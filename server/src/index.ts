import { config } from './config';
import { logger } from './logger';
import { createApp } from './app';
import { VERSION } from './version';
import { createDb } from './db/knex';
import { migrateLatest, migrationStatus, OutdatedHistoryError } from './db/migrator';
import { purgeExpiredAuth } from './auth/sessions';
import { activeAdmins } from './hooks/usuarios';
import { purgeLogs } from './services/logs';
import { createMailer } from './services/mailer';
import { setupDemo } from './demo/setup';
import { getSettings } from './services/settings';
import { purgeTrash } from './services/records';
import { entities } from '@frame/shared';

const db = createDb(config.dbFile);

// Migrações pendentes: aplicadas sozinhas em dev; em produção o servidor não sobe
const { pending } = await migrationStatus(db).catch((err) => {
  if (err instanceof OutdatedHistoryError) {
    logger.fatal(err.message);
    process.exit(1);
  }
  throw err;
});
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

if (config.demo) {
  const populou = await setupDemo(db);
  logger.info(populou ? 'módulo de demonstração ativo (dados de exemplo criados)' : 'módulo de demonstração ativo');
}

// Manutenção diária: logs antigos, sessões vencidas, links de senha usados, lixeira vencida
const manutencao = async () => {
  const settings = await getSettings(db);
  const logs = await purgeLogs(db, settings.dias_logs);
  const acessos = await purgeExpiredAuth(db);
  const lixeira = await purgeTrash(db, entities, settings.dias_lixeira);
  if (logs || acessos || lixeira) logger.info({ logs, acessos, lixeira }, 'limpeza de registros antigos');
};
await manutencao();
setInterval(() => manutencao().catch((err) => logger.error({ err }, 'falha na manutenção')), 86_400_000).unref();

if ((await activeAdmins(db)) === 0) {
  logger.warn('Nenhum administrador ativo. Crie um com: npm run db:admin -- seu@email.com "Seu Nome"');
}
if (!config.SMTP_HOST && config.NODE_ENV === 'production') {
  logger.warn('SMTP não configurado: e-mails de redefinição de senha vão apenas para o log.');
}

const app = createApp({
  db,
  logger,
  dbFile: config.dbFile,
  mailer: createMailer(config, logger),
  appUrl: config.APP_URL,
  corsOrigins: config.corsOrigins,
  sessionHours: config.SESSION_HOURS,
  rememberDays: config.REMEMBER_DAYS,
  cookieSecure: config.cookieSecure,
  trustProxy: config.TRUST_PROXY,
});
const server = app.listen(config.PORT, () => {
  logger.info(
    `API rodando em http://localhost:${config.PORT}/api (${config.NODE_ENV}, v${VERSION.version} · ${VERSION.commit})`,
  );
});

const shutdown = async (signal: string) => {
  logger.info(`${signal} recebido, encerrando...`);
  server.close();
  await db.destroy();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
