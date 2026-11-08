import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from './db.js';
import { seed } from './seed.js';
import { migrateSettings, purgeLogs } from './settings.js';
import systemRoutes from './routes/system.js';
import crudRoutes from './routes/crud.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

migrate();
migrateSettings();
seed();
purgeLogs();
setInterval(purgeLogs, 24 * 60 * 60 * 1000); // limpeza diária dos logs

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' })); // folga para o logo em base64

app.use('/api', systemRoutes); // meta, dashboard, logs, backup (antes do CRUD genérico)
app.use('/api', crudRoutes);

// Em produção (após `npm run build`), o próprio Express serve o front.
const dist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) return res.sendFile(path.join(dist, 'index.html'));
    next();
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

app.listen(PORT, () => console.log(`🚀 API rodando em http://localhost:${PORT}/api`));
