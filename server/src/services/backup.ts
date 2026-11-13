import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { entities, type BackupInfo } from '@frame/shared';
import { count, isPg, isSqlite, listarTabelas, type Db } from '../db/knex';

const SYSTEM_TABLES = ['logs', 'configuracoes', 'anexos'];

/** Bytes ocupados pelo banco: arquivo no SQLite; tabelas do schema no Postgres */
export async function tamanhoBanco(db: Db, dbFile?: string | null): Promise<number> {
  if (isPg(db)) {
    const r = (await db.raw(
      `select coalesce(sum(pg_total_relation_size(format('%I.%I', table_schema, table_name))), 0) as n
         from information_schema.tables where table_schema = current_schema()`,
    )) as { rows: { n: number | string }[] };
    return Number(r.rows[0]?.n ?? 0);
  }
  return dbFile && dbFile !== ':memory:' && fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0;
}

export async function backupInfo(db: Db, dbFile: string): Promise<BackupInfo> {
  if (isPg(db)) {
    const tabelas = [];
    for (const tabela of [...Object.keys(entities), ...SYSTEM_TABLES])
      if (await db.schema.hasTable(tabela)) tabelas.push({ tabela, registros: await count(db(tabela)) });
    const schema = ((await db.raw('select current_schema() as s')) as { rows: { s: string }[] }).rows[0].s;
    return { arquivo: `${schema} (Postgres)`, tamanho: await tamanhoBanco(db), modificado: null, tabelas };
  }
  const stat = dbFile !== ':memory:' && fs.existsSync(dbFile) ? fs.statSync(dbFile) : null;
  const tabelas = [];
  for (const tabela of [...Object.keys(entities), ...SYSTEM_TABLES])
    tabelas.push({ tabela, registros: await count(db(tabela)) });
  return {
    arquivo: path.basename(dbFile),
    tamanho: stat?.size ?? 0,
    modificado: stat?.mtime.toISOString() ?? null,
    tabelas,
  };
}

/**
 * Cópia do banco para baixar. SQLite: o próprio arquivo (consistente, mesmo em uso). Postgres: um JSON com todas as
 * tabelas do espaço (o backup do servidor inteiro é do provedor/pg_dump; este é o do dono do espaço).
 * Devolve o caminho gerado (a extensão depende do banco).
 */
export async function gerarBackup(db: Db, destSemExtensao: string): Promise<string> {
  if (isPg(db)) {
    const destino = `${destSemExtensao}.json`;
    const tabelas: Record<string, unknown[]> = {};
    for (const t of await listarTabelas(db)) if (!t.startsWith('knex_')) tabelas[t] = await db(t).select();
    fs.writeFileSync(destino, JSON.stringify({ gerado_em: new Date().toISOString(), tabelas }));
    return destino;
  }
  const destino = `${destSemExtensao}.db`;
  await createBackup(db, destino);
  return destino;
}

/** Gera uma cópia consistente do banco SQLite (mesmo com o sistema em uso). */
export async function createBackup(db: Db, destFile: string): Promise<void> {
  if (!isSqlite(db)) throw new Error('Cópia de arquivo disponível apenas para SQLite (use gerarBackup)');
  const client = db.client as {
    acquireConnection(): Promise<Database.Database>;
    releaseConnection(c: unknown): Promise<void>;
  };
  const conn = await client.acquireConnection();
  try {
    await conn.backup(destFile);
  } finally {
    await client.releaseConnection(conn);
  }
}
