import { afterEach, describe, expect, it } from 'vitest';
import { entities, type EntityDef } from '@frame/shared';
import { createDb, type Db } from '../src/db/knex';
import { computeDiff, isEmptyDiff, renderMigration } from '../src/db/diff';
import { migrateLatest, migrationStatus, OutdatedHistoryError, withForeignKeysOff } from '../src/db/migrator';
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
      usuarios: {
        ...entities.usuarios,
        fields: [
          ...entities.usuarios.fields.filter((f) => f.name !== 'ultimo_acesso'),
          { name: 'cidade', label: 'Cidade', type: 'text' },
        ],
      },
      x_tabela_nova: {
        label: 'Contas',
        singular: 'Conta',
        icon: 'bank',
        labelField: 'nome',
        fields: [{ name: 'nome', label: 'Nome', type: 'text' }],
      },
    };
    const diff = await computeDiff(db, changed);
    expect(diff.createTables.map((t) => t.table)).toEqual(['x_tabela_nova']);
    expect(diff.addColumns.map((c) => `${c.table}.${c.field.name}`)).toEqual(['usuarios.cidade']);
    expect(diff.orphanColumns).toEqual([{ table: 'usuarios', column: 'ultimo_acesso' }]);

    const code = renderMigration(diff, 'x');
    expect(code).toContain("createTable('x_tabela_nova'");
    expect(code).toContain("t.text('cidade');");
    expect(code).toContain('usuarios.ultimo_acesso existe no banco');
  });

  it('alterar tabela pai no SQLite não apaga vínculos das tabelas filhas', async () => {
    db = createDb(':memory:');
    await migrateLatest(db);
    await seed(db);
    await db('logs').insert({ entidade: 'x', acao: 'teste', usuario_id: 1, criado_em: '2026-01-01 00:00:00' });
    const vinculados = async () => Number((await db('logs').whereNotNull('usuario_id').count({ n: '*' }).first())?.n);
    expect(await vinculados()).toBe(1);

    // alterar coluna no SQLite faz o Knex recriar a tabela `usuarios` (pai de logs, com ON DELETE SET NULL)
    await withForeignKeysOff(db, async () => {
      await db.schema.alterTable('usuarios', (t) => t.text('temp'));
      await db.schema.alterTable('usuarios', (t) => t.dropColumn('temp'));
    });
    expect(await vinculados()).toBe(1);
  });
});

describe('histórico de migrações desatualizado', () => {
  it('explica o problema e a solução em vez de um erro técnico', async () => {
    db = createDb(':memory:');
    await migrateLatest(db);
    await db('knex_migrations').insert({ name: '20200101000000_antiga', batch: 9, migration_time: new Date() });
    await expect(migrationStatus(db)).rejects.toBeInstanceOf(OutdatedHistoryError);
    await expect(migrationStatus(db)).rejects.toThrow(/npm run db:reset/);
  });
});
