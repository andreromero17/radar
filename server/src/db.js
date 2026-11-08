import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { entities } from './entities.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '../data');
export const DB_PATH = path.join(DATA_DIR, 'app.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const sqlType = (f) => ({ number: 'REAL', money: 'REAL', boolean: 'INTEGER', relation: 'INTEGER' }[f.type] || 'TEXT');

/** Cria tabelas a partir de entities.js e adiciona colunas novas (migração simples). */
export function migrate() {
  for (const [table, ent] of Object.entries(entities)) {
    const cols = ent.fields.map((f) => {
      let c = `${f.name} ${sqlType(f)}`;
      if (f.type === 'relation') c += ` REFERENCES ${f.entity}(id) ON DELETE SET NULL`;
      return c;
    });
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ${cols.join(',\n        ')},
        criado_em TEXT DEFAULT (datetime('now','localtime')),
        atualizado_em TEXT
      )`);

    const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    for (const f of ent.fields) {
      if (!existing.includes(f.name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${f.name} ${sqlType(f)}`);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entidade TEXT,
      registro_id INTEGER,
      acao TEXT,
      detalhe TEXT,
      usuario TEXT DEFAULT 'Administrador',
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    )`);
}

export function log(entidade, registro_id, acao, detalhe = '') {
  db.prepare('INSERT INTO logs (entidade, registro_id, acao, detalhe) VALUES (?, ?, ?, ?)').run(
    entidade,
    registro_id,
    acao,
    detalhe,
  );
}
