import type { Knex } from 'knex';
import { isSqlite } from './knex';
import { appMigrations } from '../app/migrations';
import { migrations } from './migrations';
import { plataformaMigrations } from './plataforma';

export interface Migration {
  name: string;
  up(knex: Knex): Promise<void>;
  down(knex: Knex): Promise<void>;
}

/**
 * As migrações ficam registradas em código em vez de serem lidas da pasta em
 * tempo de execução: funciona igual com tsx, no build de produção e nos testes.
 *
 * Dois tipos de banco (Fase 5A):
 *  - ESPAÇO (um por espaço: as finanças de um assinante): núcleo (db/migrations) + aplicação (app/migrations)
 *  - PLATAFORMA (um só: usuários, sessões, identidade, espaços e membros): núcleo + db/plataforma
 * Cada lista roda na ordem do nome (data e hora). Num sistema derivado, o sistema mexe só em app/migrations.
 */
export type TipoBanco = 'espaco' | 'plataforma';

const ordenar = (l: Migration[]) => [...l].sort((a, b) => a.name.localeCompare(b.name));
export const migracoesDe = (tipo: TipoBanco) =>
  ordenar(tipo === 'plataforma' ? [...migrations, ...plataformaMigrations] : [...migrations, ...appMigrations]);
/** Migrações do banco de um espaço (o que o `db:diff` compara com as entidades) */
export const allMigrations = () => migracoesDe('espaco');

export const migrationConfigDe = (tipo: TipoBanco): Knex.MigratorConfig => ({
  migrationSource: {
    getMigrations: async () => migracoesDe(tipo),
    getMigrationName: (m) => m.name,
    getMigration: async (m) => m,
  } satisfies Knex.MigrationSource<Migration>,
  tableName: 'knex_migrations',
});
export const migrationConfig = migrationConfigDe('espaco');

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

export async function migrateLatest(db: Knex, tipo: TipoBanco = 'espaco') {
  const [, applied] = (await withForeignKeysOff(db, () =>
    db.migrate.latest(migrationConfigDe(tipo)).catch(rethrowCorrupt),
  )) as [number, string[]];
  return applied;
}

export async function rollback(db: Knex, all = false, tipo: TipoBanco = 'espaco') {
  const [, reverted] = (await withForeignKeysOff(db, () => db.migrate.rollback(migrationConfigDe(tipo), all))) as [
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

export async function migrationStatus(db: Knex, tipo: TipoBanco = 'espaco') {
  const [done, pending] = (await db.migrate.list(migrationConfigDe(tipo)).catch(rethrowCorrupt)) as [
    { name: string }[],
    Migration[],
  ];
  return { done: done.map((m) => m.name), pending: pending.map((m) => m.name) };
}
