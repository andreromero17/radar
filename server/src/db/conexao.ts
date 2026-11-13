// Qual banco usar (Fase 6A): Postgres se DATABASE_URL estiver preenchida; senão, SQLite em arquivos.
import type { Config } from '../config';
import { createDb, createPgDb, type Db } from './knex';

export const usaPostgres = (c: Pick<Config, 'DATABASE_URL'>) => !!c.DATABASE_URL;

/** Banco da plataforma (usuários, sessões, espaços...) */
export const abrirPlataforma = (c: Config): Db =>
  c.DATABASE_URL ? createPgDb(c.DATABASE_URL, 'public', { max: 10 }) : createDb(c.dbFile);

/** Onde ficam os bancos dos espaços (para `configurarEspacos`) */
export const opcoesEspacos = (c: Config) => ({
  dir: c.espacosDir,
  pg: c.DATABASE_URL ? { url: c.DATABASE_URL } : undefined,
});

/** Texto para logs/CLI: onde está o banco (sem a senha da URL) */
export const descreverBanco = (c: Config) =>
  c.DATABASE_URL ? `Postgres ${c.DATABASE_URL.replace(/\/\/([^:@/]+)(:[^@/]*)?@/, '//$1:***@')}` : c.dbFile;
