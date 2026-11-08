import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { entities, type BackupInfo } from '@frame/shared';
import { count, isSqlite, type Db } from '../db/knex';

const SYSTEM_TABLES = ['logs', 'configuracoes', 'anexos'];

export async function backupInfo(db: Db, dbFile: string): Promise<BackupInfo> {
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

/** Gera uma cópia consistente do banco SQLite (mesmo com o sistema em uso). */
export async function createBackup(db: Db, destFile: string): Promise<void> {
  if (!isSqlite(db)) throw new Error('Backup pela interface disponível apenas para SQLite');
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
