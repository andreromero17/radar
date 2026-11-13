import fs from 'node:fs';
import path from 'node:path';
import knex, { type Knex } from 'knex';
import type Database from 'better-sqlite3';
import pg from 'pg';

export type Db = Knex;

// Postgres devolve alguns tipos de um jeito diferente do SQLite; aqui ficam iguais para o resto do código:
// numeric (dinheiro) e bigint (count) como número, date como texto 'AAAA-MM-DD' (nunca Date, que muda com o fuso).
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v == null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v == null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

/**
 * Conexão com o Postgres num SCHEMA (Fase 6A): a plataforma usa um; cada espaço, o seu (`espaco_<id>`). O
 * `search_path` da conexão é só aquele schema — uma consulta sem prefixo nunca alcança outro espaço.
 */
export function createPgDb(url: string, schema: string, opts: { max?: number } = {}): Db {
  return knex({
    client: 'pg',
    connection: url,
    searchPath: [schema],
    pool: { min: 0, max: opts.max ?? 4, idleTimeoutMillis: 30_000 },
  });
}

/** Nome de schema seguro (só letras minúsculas, números e _) */
export const nomeSchema = (s: string) => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(s)) throw new Error(`Nome de schema inválido: ${s}`);
  return s;
};

export const isPg = (db: Db) => String(db.client.config.client) === 'pg';

/** Operador de busca sem diferenciar maiúsculas (o LIKE do SQLite já não diferencia; o do Postgres, sim) */
export const likeOp = (db: Db) => (isPg(db) ? 'ilike' : 'like');

/**
 * INSERT que devolve o id criado nos dois bancos (o SQLite devolve o id sozinho; o Postgres só com RETURNING).
 * Uso: `const id = await inserir(db('tabela'), linha)`.
 */
export async function inserir(qb: Knex.QueryBuilder, linha: Record<string, unknown>): Promise<number> {
  const [r] = (await qb.insert(linha).returning('id')) as ({ id: number } | number)[];
  return Number(typeof r === 'object' ? r.id : r);
}

/**
 * Cria a conexão com o banco SQLite (desenvolvimento, testes e instalações pequenas). Toda a aplicação fala com o
 * banco via Knex: o Postgres (createPgDb) entra pela configuração, não pelo resto do código.
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

/** Tabelas do banco (do schema da conexão, no Postgres) — para exportações e conferências */
export async function listarTabelas(db: Db): Promise<string[]> {
  if (isPg(db))
    return (await db('information_schema.tables')
      .whereRaw('table_schema = current_schema()')
      .where({ table_type: 'BASE TABLE' })
      .orderBy('table_name')
      .pluck('table_name')) as string[];
  return (await db('sqlite_master')
    .where({ type: 'table' })
    .whereNot('name', 'like', 'sqlite_%')
    .orderBy('name')
    .pluck('name')) as string[];
}
