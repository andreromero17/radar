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
import { comEspaco, configurarEspacos, criarEspaco, fecharEspacos, idsEspacosAtivos } from './espacos';
import { converterInstalacaoUnica, garantirEspacoInicial } from './espacos/conversao';
import { entities } from '@frame/shared';

// Plataforma (usuários, sessões, identidade, espaços) + um banco por espaço (Fase 5A)
await converterInstalacaoUnica(config.dbFile, config.espacosDir, logger);
const db = createDb(config.dbFile);
configureAnexos({ dir: config.uploadDir, maxMb: config.UPLOAD_MAX_MB });
const producao = config.NODE_ENV === 'production';

// Migrações pendentes: aplicadas sozinhas em dev; em produção o servidor não sobe
const { pending } = await migrationStatus(db, 'plataforma').catch((err) => {
  if (err instanceof OutdatedHistoryError) {
    logger.fatal(err.message);
    process.exit(1);
  }
  throw err;
});
if (pending.length) {
  if (producao) {
    logger.fatal(
      { pending },
      'Há migrações pendentes. Rode `npm run db:migrate` (ou `node dist/cli.js migrate` no servidor) antes de subir.',
    );
    process.exit(1);
  }
  const applied = await migrateLatest(db, 'plataforma');
  logger.info({ applied }, 'migrações da plataforma aplicadas');
}
// espaços: em dev migram ao abrir; em produção um espaço desatualizado não abre (rode db:migrate no deploy)
configurarEspacos({ plataforma: db, dir: config.espacosDir, autoMigrar: !producao });
const inicial = await garantirEspacoInicial(db, criarEspaco);
if (inicial) logger.info({ espaco: inicial }, 'espaço inicial criado');

if (config.demo) {
  const [primeiro] = await idsEspacosAtivos();
  if (primeiro) {
    const populou = await comEspaco(primeiro, (edb) => setupDemo(edb));
    logger.info(populou ? 'módulo de demonstração ativo (dados de exemplo criados)' : 'módulo de demonstração ativo');
  }
}

const mailer = createMailer(config, logger);
registrarPaineis(); // fontes, conjuntos e alertas do sistema (antes da primeira verificação)

// Manutenção diária. Plataforma: logs de acesso, sessões vencidas, links de senha. Cada espaço (no próprio banco):
// logs, lixeira vencida, manutenção do sistema e alertas (notificações novas + resumo por e-mail para quem pediu)
const manutencao = async () => {
  const settings = await getSettings(db);
  const logsPlat = await purgeLogs(db, settings.dias_logs);
  const acessos = await purgeExpiredAuth(db);
  if (logsPlat || acessos) logger.info({ logs: logsPlat, acessos }, 'limpeza da plataforma');
  for (const id of await idsEspacosAtivos()) {
    try {
      await comEspaco(id, async (edb) => {
        const logs = await purgeLogs(edb, settings.dias_logs);
        const lixeira = await purgeTrash(edb, entities, settings.dias_lixeira);
        const app = Object.fromEntries(Object.entries(await appMaintenance(edb)).filter(([, n]) => n));
        const notificacoes = await purgeNotificacoes(edb);
        const { novas, total } = await verificarAlertas(edb, { espacoId: id });
        const emails = await enviarResumos(edb, mailer, novas, config.APP_URL, settings.nome_sistema);
        const r = { logs, lixeira, ...app, notificacoes_apagadas: notificacoes, novas: total, emails };
        if (Object.values(r).some(Boolean)) logger.info({ espaco: id, ...r }, 'manutenção do espaço');
      });
    } catch (err) {
      logger.error({ err, espaco: id }, 'falha na manutenção do espaço');
    }
  }
};
await manutencao();
setInterval(() => manutencao().catch((err) => logger.error({ err }, 'falha na manutenção')), 86_400_000).unref();

if ((await activeAdmins(db)) === 0) {
  logger.warn('Nenhum administrador ativo. Crie um com: npm run db:admin -- seu@email.com "Seu Nome"');
}
if (!config.SMTP_HOST && producao) {
  logger.warn('SMTP não configurado: e-mails de redefinição de senha vão apenas para o log.');
}

const app = createApp({
  db,
  logger,
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
  await fecharEspacos();
  await db.destroy();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
