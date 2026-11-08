// Apaga o banco e recria com dados de exemplo: npm run seed:reset
// (pare o `npm run dev` antes de rodar)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../data/app.db');
for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) if (fs.existsSync(f)) fs.unlinkSync(f);

const { migrate } = await import('./db.js');
const { seed } = await import('./seed.js');
const { migrateSettings } = await import('./settings.js');
migrate();
migrateSettings();
seed();
console.log('✅ Banco recriado');
