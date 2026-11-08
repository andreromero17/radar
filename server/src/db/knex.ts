import fs from 'node:fs';
import path from 'node:path';
import knex, { type Knex } from 'knex';
import type Database from 'better-sqlite3';

export type Db = Knex;

/**
 * Cria a conexão com o banco. Hoje: SQLite (better-sqlite3).
 * Toda a aplicação fala com o banco via Knex, então trocar para Postgres
 * (Fase 6) é mudar este arquivo e a configuração, não o resto do código.
 */
export function createDb(filename: string): Db {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  return knex({
    client: 'better-sqlite3',
    connection: { filename },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      afterCreate: (conn: Database.Database, done: (err: Error | null, conn: unknown) => void) => {
        conn.pragma('journal_mode = WAL');
        conn.pragma('foreign_keys = ON');
        done(null, conn);
      },
    },
  });
}

export const isSqlite = (db: Db) => ['better-sqlite3', 'sqlite3'].includes(String(db.client.config.client));

/** Converte valores para o formato aceito pelo banco (SQLite não tem boolean). */
export function toDbValue<T>(db: Db, value: T): T | number {
  if (typeof value === 'boolean' && isSqlite(db)) return value ? 1 : 0;
  return value;
}

/** Executa COUNT(*) e devolve um número, independente do driver */
export async function count(qb: Knex.QueryBuilder): Promise<number> {
  const row = (await qb.clearSelect().count({ n: '*' }).first()) as { n: number | string } | undefined;
  return Number(row?.n ?? 0);
}
