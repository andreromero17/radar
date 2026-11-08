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
import type { EntityDef, FieldDef } from '@frame/shared';

const SYSTEM_COLUMNS = new Set(['id', 'criado_em', 'atualizado_em']);
const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export interface SchemaDiff {
  createTables: { table: string; entity: EntityDef }[];
  addColumns: { table: string; field: FieldDef }[];
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
    for (const field of entity.fields) if (!existing.includes(field.name)) diff.addColumns.push({ table, field });
    for (const column of existing) {
      if (!SYSTEM_COLUMNS.has(column) && !entity.fields.some((f) => f.name === column))
        diff.orphanColumns.push({ table, column });
    }
  }
  return diff;
}

/** Código Knex de uma coluna (literal: a migração não depende de código que muda) */
export function columnCode(f: FieldDef): string {
  const n = `'${f.name}'`;
  switch (f.type) {
    case 'number':
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
      return `t.integer(${n}).references('id').inTable('${f.entity}').onDelete('SET NULL');\n    t.index([${n}]);`;
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
      ...entity.fields.map(columnCode),
      "t.text('criado_em');",
      "t.text('atualizado_em');",
    ];
    up.push(`  await knex.schema.createTable('${table}', (t) => {\n    ${cols.join('\n    ')}\n  });`);
    down.unshift(`  await knex.schema.dropTableIfExists('${table}');`);
  }

  const byTable = new Map<string, FieldDef[]>();
  for (const { table, field } of diff.addColumns) byTable.set(table, [...(byTable.get(table) ?? []), field]);
  for (const [table, fields] of byTable) {
    up.push(`  await knex.schema.alterTable('${table}', (t) => {\n    ${fields.map(columnCode).join('\n    ')}\n  });`);
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
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50) || 'ajustes';

const stamp = (d = new Date()) =>
  [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n, i) => String(n).padStart(i === 0 ? 4 : 2, '0'))
    .join('');

/** Grava o arquivo da migração e registra em migrations/index.ts */
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
