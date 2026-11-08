import { config } from './config';
import { logger } from './logger';
import { createApp } from './app';
import { createDb } from './db/knex';
import { migrateLatest, migrationStatus } from './db/migrator';
import { purgeLogs } from './services/logs';
import { getSettings } from './services/settings';

const db = createDb(config.dbFile);

// Migrações pendentes: aplicadas sozinhas em dev; em produção o servidor não sobe
const { pending } = await migrationStatus(db);
if (pending.length) {
  if (config.NODE_ENV === 'production') {
    logger.fatal(
      { pending },
      'Há migrações pendentes. Rode `npm run db:migrate` (ou `node dist/cli.js migrate` no servidor) antes de subir.',
    );
    process.exit(1);
  }
  const applied = await migrateLatest(db);
  logger.info({ applied }, 'migrações aplicadas');
}

const limparLogs = async () => {
  const removidos = await purgeLogs(db, (await getSettings(db)).dias_logs);
  if (removidos) logger.info({ removidos }, 'logs antigos removidos');
};
await limparLogs();
setInterval(() => limparLogs().catch((err) => logger.error({ err }, 'falha ao limpar logs')), 86_400_000).unref();

const app = createApp({ db, logger, dbFile: config.dbFile, corsOrigins: config.corsOrigins });
const server = app.listen(config.PORT, () => {
  logger.info(`API rodando em http://localhost:${config.PORT}/api (${config.NODE_ENV})`);
});

const shutdown = async (signal: string) => {
  logger.info(`${signal} recebido, encerrando...`);
  server.close();
  await db.destroy();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
