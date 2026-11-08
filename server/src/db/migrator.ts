import type { Knex } from 'knex';
import { isSqlite } from './knex';
import { appMigrations } from '../app/migrations';
import { migrations } from './migrations';

export interface Migration {
  name: string;
  up(knex: Knex): Promise<void>;
  down(knex: Knex): Promise<void>;
}

/**
 * As migrações ficam registradas em código em vez de serem lidas da pasta em
 * tempo de execução: funciona igual com tsx, no build de produção e nos testes.
 * Núcleo (db/migrations) e aplicação (app/migrations) ficam em listas separadas
 * — num sistema derivado do frame, cada lado mexe só na sua — e rodam juntas,
 * na ordem do nome (data e hora).
 */
export const allMigrations = () => [...migrations, ...appMigrations].sort((a, b) => a.name.localeCompare(b.name));

const migrationSource: Knex.MigrationSource<Migration> = {
  getMigrations: async () => allMigrations(),
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
export async function withForeignKeysOff<T>(db: Knex, fn: () => Promise<T>): Promise<T> {
  if (!isSqlite(db)) return fn();
  await db.raw('PRAGMA foreign_keys = OFF');
  let result: T;
  try {
    result = await fn();
  } finally {
    await db.raw('PRAGMA foreign_keys = ON');
  }
  const violations = (await db.raw('PRAGMA foreign_key_check')) as unknown[];
  if (violations.length) {
    throw new Error(
      `Migração deixou ${violations.length} referência(s) inválida(s): ${JSON.stringify(violations.slice(0, 5))}`,
    );
  }
  return result;
}

export async function migrateLatest(db: Knex) {
  const [, applied] = (await withForeignKeysOff(db, () =>
    db.migrate.latest(migrationConfig).catch(rethrowCorrupt),
  )) as [number, string[]];
  return applied;
}

export async function rollback(db: Knex, all = false) {
  const [, reverted] = (await withForeignKeysOff(db, () => db.migrate.rollback(migrationConfig, all))) as [
    number,
    string[],
  ];
  return reverted;
}

/** Banco criado com migrações que não existem mais no código (histórico reescrito) */
export class OutdatedHistoryError extends Error {
  constructor(public missing: string[]) {
    super(
      `O banco foi criado com migrações que não existem mais neste código: ${missing.join(', ')}.\n` +
        '  Em desenvolvimento, recrie o banco com: npm run db:reset (apaga os dados).',
    );
  }
}

const rethrowCorrupt = (err: unknown): never => {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /files are missing: (.+)$/.exec(msg);
  if (m) throw new OutdatedHistoryError(m[1].split(',').map((s) => s.trim()));
  throw err;
};

export async function migrationStatus(db: Knex) {
  const [done, pending] = (await db.migrate.list(migrationConfig).catch(rethrowCorrupt)) as [
    { name: string }[],
    Migration[],
  ];
  return { done: done.map((m) => m.name), pending: pending.map((m) => m.name) };
}
