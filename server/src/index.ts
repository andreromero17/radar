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
import { registrarPaineis } from './app/paineis';
import { enviarResumos, purgeNotificacoes, verificarAlertas } from './services/notificacoes';
import { setupDemo } from './demo/setup';
import { getSettings } from './services/settings';
import { purgeTrash } from './services/records';
import { appMaintenance } from './app/maintenance';
import { configureAnexos } from './services/anexos';
import { entities } from '@frame/shared';

const db = createDb(config.dbFile);
configureAnexos({ dir: config.uploadDir, maxMb: config.UPLOAD_MAX_MB });

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

const mailer = createMailer(config, logger);
registrarPaineis(); // fontes, conjuntos e alertas do sistema (antes da primeira verificação)

// Manutenção diária: logs antigos, sessões vencidas, links de senha usados, lixeira vencida; depois os alertas
// (notificações novas + resumo por e-mail para quem pediu)
const manutencao = async () => {
  const settings = await getSettings(db);
  const logs = await purgeLogs(db, settings.dias_logs);
  const acessos = await purgeExpiredAuth(db);
  const lixeira = await purgeTrash(db, entities, settings.dias_lixeira);
  if (logs || acessos || lixeira) logger.info({ logs, acessos, lixeira }, 'limpeza de registros antigos');
  const app = Object.fromEntries(Object.entries(await appMaintenance(db)).filter(([, n]) => n));
  if (Object.keys(app).length) logger.info(app, 'manutenção da aplicação');
  const notificacoes = await purgeNotificacoes(db);
  const { novas, total } = await verificarAlertas(db);
  const emails = await enviarResumos(db, mailer, novas, config.APP_URL, settings.nome_sistema);
  if (total || emails || notificacoes) logger.info({ novas: total, emails, apagadas: notificacoes }, 'notificações');
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
  mailer,
  emailDisponivel: !!config.SMTP_HOST,
  appUrl: config.APP_URL,
  corsOrigins: config.corsOrigins,
  sessionHours: config.SESSION_HOURS,
  rememberDays: config.REMEMBER_DAYS,
  cookieSecure: config.cookieSecure,
  trustProxy: config.TRUST_PROXY,
  uploadDir: config.uploadDir,
  uploadMaxMb: config.UPLOAD_MAX_MB,
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
