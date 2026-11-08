import { afterEach, describe, expect, it } from 'vitest';
import { entities, type EntityDef } from '@frame/shared';
import { createDb, type Db } from '../src/db/knex';
import { computeDiff, isEmptyDiff, renderMigration } from '../src/db/diff';
import { migrateLatest, migrationStatus, withForeignKeysOff } from '../src/db/migrator';
import { seed } from '../src/db/seed';

let db: Db;
afterEach(() => db?.destroy());

describe('Migrações', () => {
  it('banco migrado fica em sincronia com as entidades', async () => {
    db = createDb(':memory:');
    await migrateLatest(db);
    expect((await migrationStatus(db)).pending).toEqual([]);
    expect(isEmptyDiff(await computeDiff(db, entities))).toBe(true);
  });

  it('diff detecta tabela nova, coluna nova e coluna órfã', async () => {
    db = createDb(':memory:');
    await migrateLatest(db);
    const changed: Record<string, EntityDef> = {
      ...entities,
      clientes: {
        ...entities.clientes,
        fields: [
          ...entities.clientes.fields.filter((f) => f.name !== 'observacoes'),
          { name: 'cidade', label: 'Cidade', type: 'text' },
        ],
      },
      contas: {
        label: 'Contas',
        singular: 'Conta',
        icon: 'bank',
        labelField: 'nome',
        fields: [{ name: 'nome', label: 'Nome', type: 'text' }],
      },
    };
    const diff = await computeDiff(db, changed);
    expect(diff.createTables.map((t) => t.table)).toEqual(['contas']);
    expect(diff.addColumns.map((c) => `${c.table}.${c.field.name}`)).toEqual(['clientes.cidade']);
    expect(diff.orphanColumns).toEqual([{ table: 'clientes', column: 'observacoes' }]);

    const code = renderMigration(diff, 'x');
    expect(code).toContain("createTable('contas'");
    expect(code).toContain("t.text('cidade');");
    expect(code).toContain('clientes.observacoes existe no banco');
  });

  it('alterar tabela pai no SQLite não apaga vínculos das tabelas filhas', async () => {
    db = createDb(':memory:');
    await migrateLatest(db);
    await seed(db);
    const vinculados = async () =>
      Number((await db('chamados').whereNotNull('cliente_id').count({ n: '*' }).first())?.n);
    expect(await vinculados()).toBe(40);

    // dropColumn no SQLite faz o Knex recriar a tabela `clientes`
    await withForeignKeysOff(db, () => db.schema.alterTable('clientes', (t) => t.dropColumn('observacoes')));
    expect(await vinculados()).toBe(40);
  });
});
