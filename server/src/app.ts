import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';
import { SERVER_ROOT } from './config';
import type { Db } from './db/knex';
import { crudRouter } from './routes/crud';
import { systemRouter } from './routes/system';

export interface AppOptions {
  db: Db;
  logger: Logger;
  dbFile: string;
  corsOrigins?: string[];
  /** Pasta do front buildado; servida quando existir (produção) */
  webDist?: string;
}

/** Monta o app Express. Separado do listen() para os testes usarem direto. */
export function createApp({ db, logger, dbFile, corsOrigins = [], webDist }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: '1mb' })); // folga para o logo em base64

  app.use((req, res, next) => {
    const start = performance.now();
    res.on('finish', () =>
      logger.debug({ method: req.method, url: req.originalUrl, status: res.statusCode, ms: Math.round(performance.now() - start) }, 'request'),
    );
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api', systemRouter(db, { dbFile })); // antes do CRUD genérico
  app.use('/api', crudRouter(db));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });

  const dist = webDist ?? path.resolve(SERVER_ROOT, '../web/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next()));
  }

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Conteúdo muito grande' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
    logger.error({ err, method: req.method, url: req.originalUrl }, 'erro não tratado');
    res.status(500).json({ error: 'Erro interno' });
  };
  app.use(onError);

  return app;
}
