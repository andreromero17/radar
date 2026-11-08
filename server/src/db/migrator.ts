import type { Knex } from 'knex';
import { isSqlite } from './knex';
import { migrations } from './migrations';

export interface Migration {
  name: string;
  up(knex: Knex): Promise<void>;
  down(knex: Knex): Promise<void>;
}

/**
 * As migrações ficam registradas em código (migrations/index.ts) em vez de
 * serem lidas da pasta em tempo de execução: funciona igual com tsx, no build
 * de produção e nos testes.
 */
const migrationSource: Knex.MigrationSource<Migration> = {
  getMigrations: async () => migrations,
  getMigrationName: (m) => m.name,
  getMigration: async (m) => m,
};

export const migrationConfig: Knex.MigratorConfig = { migrationSource, tableName: 'knex_migrations' };

/**
 * No SQLite, remover/alterar coluna faz o Knex recriar a tabela. Com as chaves
 * estrangeiras ligadas, apagar a tabela antiga dispararia ON DELETE SET NULL nas
 * tabelas filhas e PERDERIA os vínculos. Por isso as FKs ficam desligadas durante
 * a migração e são verificadas no fim.
 */
async function withForeignKeysOff<T>(db: Knex, fn: () => Promise<T>): Promise<T> {
  if (!isSqlite(db)) return fn();
  await db.raw('PRAGMA foreign_keys = OFF');
  try {
    return await fn();
  } finally {
    await db.raw('PRAGMA foreign_keys = ON');
    const violations = (await db.raw('PRAGMA foreign_key_check')) as unknown[];
    if (violations.length) throw new Error(`Migração deixou ${violations.length} referência(s) inválida(s): ${JSON.stringify(violations.slice(0, 5))}`);
  }
}

export async function migrateLatest(db: Knex) {
  const [, applied] = (await withForeignKeysOff(db, () => db.migrate.latest(migrationConfig))) as [number, string[]];
  return applied;
}

export async function rollback(db: Knex, all = false) {
  const [, reverted] = (await withForeignKeysOff(db, () => db.migrate.rollback(migrationConfig, all))) as [number, string[]];
  return reverted;
}

export async function migrationStatus(db: Knex) {
  const [done, pending] = (await db.migrate.list(migrationConfig)) as [{ name: string }[], Migration[]];
  return { done: done.map((m) => m.name), pending: pending.map((m) => m.name) };
}
