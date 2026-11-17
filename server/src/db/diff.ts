// =============================================================================
// Compara as entidades (shared/src/entities.ts) com o banco e gera o arquivo de
// migração com o que falta. Tabelas e colunas novas são automáticas.
// Renomear ou remover coluna NUNCA é automático (para não perder dados):
// o diff só avisa, e você escreve essa parte na migração à mão.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Knex } from 'knex';
import { entities, type EntityDef, type FieldDef } from '@frame/shared';

/** Entidades cujas tabelas valem na PLATAFORMA (no espaço há só a cópia leve, das migrações do núcleo) */
export const ENTIDADES_DA_PLATAFORMA = new Set(['usuarios', 'perfis']);
/** Entidades de cada tipo de banco (o diff compara o espaço com as do espaço) */
export const entidadesDe = (tipo: 'espaco' | 'plataforma'): Record<string, EntityDef> =>
  Object.fromEntries(
    Object.entries(entities).filter(([t]) => ENTIDADES_DA_PLATAFORMA.has(t) === (tipo === 'plataforma')),
  );

const SYSTEM_COLUMNS = new Set(['id', 'criado_em', 'atualizado_em']);

/** Coluna da lixeira, criada para entidades com `lixeira: true` */
const TRASH_FIELD: FieldDef = { name: 'excluido_em', label: 'Excluído em', type: 'datetime' };

/** Colunas da tabela além das de sistema: campos da entidade (+ lixeira) */
/** Colunas da tabela (as de `deRelacao` vêm da relação, não são gravadas) */
export const tableFields = (ent: EntityDef): FieldDef[] => {
  const proprias = ent.fields.filter((f) => !f.deRelacao);
  return ent.lixeira ? [...proprias, TRASH_FIELD] : proprias;
};
/** Migrações geradas pelo diff são da aplicação (as do núcleo são escritas à mão em db/migrations) */
const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/migrations');

export interface SchemaDiff {
  createTables: { table: string; entity: EntityDef }[];
  addColumns: { table: string; field: FieldDef; entity?: EntityDef }[];
  /** Colunas que existem no banco mas não na entidade (só aviso) */
  orphanColumns: { table: string; column: string }[];
}

export const isEmptyDiff = (d: SchemaDiff) => d.createTables.length === 0 && d.addColumns.length === 0;

export async function computeDiff(db: Knex, entities: Record<string, EntityDef>): Promise<SchemaDiff> {
  const diff: SchemaDiff = { createTables: [], addColumns: [], orphanColumns: [] };
  for (const [table, entity] of Object.entries(entities)) {
    if (!(await db.schema.hasTable(table))) {
      diff.createTables.push({ table, entity });
      continue;
    }
    const existing = Object.keys(await db(table).columnInfo());
    const fields = tableFields(entity);
    for (const field of fields) if (!existing.includes(field.name)) diff.addColumns.push({ table, field, entity });
    for (const column of existing) {
      if (!SYSTEM_COLUMNS.has(column) && !fields.some((f) => f.name === column))
        diff.orphanColumns.push({ table, column });
    }
  }
  return diff;
}

/** Linha de sub-tabela some junto com o "pai"; demais relações só perdem o vínculo */
const onDeleteOf = (f: FieldDef, ent?: EntityDef) =>
  ent?.detailOf && ent.detailOf === f.entity ? 'CASCADE' : 'SET NULL';

/** Código Knex de uma coluna (literal: a migração não depende de código que muda) */
export function columnCode(f: FieldDef, ent?: EntityDef): string {
  const n = `'${f.name}'`;
  switch (f.type) {
    case 'number':
    case 'percent':
      return `t.double(${n});`;
    case 'money':
      return `t.decimal(${n}, 15, 2);`;
    case 'boolean':
      return `t.boolean(${n});`;
    case 'date':
      return `t.date(${n});`;
    case 'datetime':
    case 'password':
    case 'permissions':
      return `t.text(${n});`;
    case 'relation':
      return `t.integer(${n}).references('id').inTable('${f.entity}').onDelete('${onDeleteOf(f, ent)}');\n    t.index([${n}]);`;
    default:
      return `t.text(${n});`;
  }
}

export function renderMigration(diff: SchemaDiff, name: string): string {
  const up: string[] = [];
  const down: string[] = [];

  for (const { table, entity } of diff.createTables) {
    const cols = [
      "t.increments('id');",
      ...tableFields(entity).map((f) => columnCode(f, entity)),
      "t.text('criado_em');",
      "t.text('atualizado_em');",
    ];
    up.push(`  await knex.schema.createTable('${table}', (t) => {\n    ${cols.join('\n    ')}\n  });`);
    down.unshift(`  await knex.schema.dropTableIfExists('${table}');`);
  }

  const byTable = new Map<string, FieldDef[]>();
  const entOf = new Map<string, EntityDef | undefined>();
  for (const { table, field, entity } of diff.addColumns) {
    byTable.set(table, [...(byTable.get(table) ?? []), field]);
    entOf.set(table, entity);
  }
  for (const [table, fields] of byTable) {
    up.push(
      `  await knex.schema.alterTable('${table}', (t) => {\n    ${fields.map((f) => columnCode(f, entOf.get(table))).join('\n    ')}\n  });`,
    );
    down.unshift(
      `  await knex.schema.alterTable('${table}', (t) => {\n    ${fields
        .map((f) => (f.type === 'relation' ? `t.dropIndex(['${f.name}']);\n    ` : '') + `t.dropColumn('${f.name}');`)
        .join('\n    ')}\n  });`,
    );
  }

  const warnings = diff.orphanColumns.map(
    (o) =>
      `// ⚠ Coluna ${o.table}.${o.column} existe no banco mas não na entidade.\n//   Se foi renomeada/removida, trate aqui à mão (ex.: t.renameColumn / t.dropColumn).`,
  );

  return `import type { Knex } from 'knex';

export const name = '${name}';
${warnings.length ? '\n' + warnings.join('\n') + '\n' : ''}
export async function up(knex: Knex) {
${up.join('\n\n')}
}

export async function down(knex: Knex) {
${down.join('\n\n')}
}
`;
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50) || 'ajustes';

const stamp = (d = new Date()) =>
  [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n, i) => String(n).padStart(i === 0 ? 4 : 2, '0'))
    .join('');

/** Grava o arquivo da migração e registra no index.ts da pasta (app/migrations) */
export function writeMigration(diff: SchemaDiff, description: string, dir = MIGRATIONS_DIR): string {
  const id = stamp();
  const name = `${id}_${slug(description)}`;
  fs.writeFileSync(path.join(dir, `${name}.ts`), renderMigration(diff, name));

  const indexPath = path.join(dir, 'index.ts');
  const index = fs
    .readFileSync(indexPath, 'utf8')
    .replace('// @diff:imports', `import * as m${id} from './${name}';\n// @diff:imports`)
    .replace('  // @diff:list', `  m${id},\n  // @diff:list`);
  fs.writeFileSync(indexPath, index);
  return name;
}

/** Adiciona a coluna equivalente a `columnCode` (versão programática, usada em testes e ferramentas) */
export function addColumn(t: Knex.CreateTableBuilder, f: FieldDef, ent?: EntityDef) {
  switch (f.type) {
    case 'number':
    case 'percent':
      return t.double(f.name);
    case 'money':
      return t.decimal(f.name, 15, 2);
    case 'boolean':
      return t.boolean(f.name);
    case 'date':
      return t.date(f.name);
    case 'relation':
      t.index([f.name]);
      return t.integer(f.name).references('id').inTable(String(f.entity)).onDelete(onDeleteOf(f, ent));
    default:
      return t.text(f.name);
  }
}

/** Cria a tabela de uma entidade direto, sem arquivo de migração (testes/protótipos) */
export async function createEntityTable(db: Knex, table: string, ent: EntityDef) {
  await db.schema.createTable(table, (t) => {
    t.increments('id');
    tableFields(ent).forEach((f) => addColumn(t, f, ent));
    t.text('criado_em');
    t.text('atualizado_em');
  });
}
