import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { SERVER_ROOT } from './config';
import { authenticate, originGuard, requireAuth } from './auth/middleware';
import type { Db } from './db/knex';
import { appRouter } from './app/routes';
import { arquivoEspaco, dbEspaco, espacoAtivo } from './espacos';
import { resolverEspaco } from './auth/middleware';
import { registrarPaineis } from './app/paineis';
import { paineisRouter } from './routes/paineis';
import { notificacoesRouter } from './routes/notificacoes';
import { authRouter } from './routes/auth';
import { crudRouter } from './routes/crud';
import { membrosRouter } from './routes/membros';
import { configurarDoisFatores } from './services/doisFatores';
import { plataformaRouter } from './routes/plataforma';
import { systemRouter } from './routes/system';
import type { Mailer } from './services/mailer';
import { configureAnexos } from './services/anexos';
import { lerFonte, pesoValido } from './services/fonte';
import { getPublicSettings } from './services/settings';
import { HttpError } from './utils/http';
import { VERSION } from './version';

export interface AppOptions {
  /** Banco da PLATAFORMA (usuários, sessões, identidade, espaços). Os bancos dos espaços vêm de configurarEspacos */
  db: Db;
  logger: Logger;
  mailer: Mailer;
  /** Endereço público do front (links de e-mail; origem confiável) */
  appUrl: string;
  corsOrigins?: string[];
  sessionHours?: number;
  rememberDays?: number;
  cookieSecure?: boolean;
  /** Verificação em duas etapas obrigatória para administradores (padrão: não) */
  admin2faObrigatorio?: boolean;
  /** Quantos proxies confiáveis na frente do servidor (IP real do cliente) */
  trustProxy?: number;
  /** Pasta dos anexos e limite de tamanho (MB) de upload/importação */
  uploadDir?: string;
  uploadMaxMb?: number;
  /** Pasta do front buildado; servida quando existir (produção) */
  webDist?: string;
  /** SMTP configurado (as preferências de notificação avisam quando o e-mail não sai de verdade) */
  emailDisponivel?: boolean;
}

/** Monta o app Express. Separado do listen() para os testes usarem direto. */
export function createApp(opts: AppOptions) {
  const { db, logger, corsOrigins = [], webDist } = opts;
  const session = { sessionHours: opts.sessionHours ?? 12, rememberDays: opts.rememberDays ?? 30 };
  registrarPaineis();
  configurarDoisFatores({ exigirParaAdmin: !!opts.admin2faObrigatorio });
  const app = express();
  const uploadMaxMb = opts.uploadMaxMb ?? 10;
  if (opts.uploadDir) configureAnexos({ dir: opts.uploadDir, maxMb: uploadMaxMb });

  app.disable('x-powered-by');
  app.set('trust proxy', opts.trustProxy ?? 0);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          // só força HTTPS quando o sistema roda em HTTPS (mesma chave do cookie seguro)
          'upgrade-insecure-requests': opts.cookieSecure ? [] : null,
        },
      },
      strictTransportSecurity: opts.cookieSecure ?? false,
    }),
  );
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' })); // folga para o logo em base64

  app.use((req, res, next) => {
    const start = performance.now();
    res.on('finish', () =>
      logger.debug(
        {
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          ms: Math.round(performance.now() - start),
          user: req.auth?.user.id,
        },
        'request',
      ),
    );
    next();
  });

  // ---- camadas da API ----
  app.use('/api', originGuard([...corsOrigins, opts.appUrl]));
  app.use('/api', authenticate(db, session));

  // públicas
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ...VERSION });
  });
  app.get('/api/settings/publicas', async (_req, res) => {
    res.json(await getPublicSettings(db));
  });
  // fonte própria (pública: a tela de login também usa); a URL leva ?v=versão, então pode ficar em cache
  app.get('/api/settings/fonte/:peso', async (req, res) => {
    const f = pesoValido(req.params.peso) ? await lerFonte(db, req.params.peso) : null;
    if (!f) return res.status(404).json({ error: 'Fonte não encontrada' });
    res.set('Content-Type', f.mime);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(f.buf);
  });
  app.use(
    '/api/auth',
    authRouter(db, {
      ...session,
      cookieSecure: opts.cookieSecure ?? false,
      appUrl: opts.appUrl,
      mailer: opts.mailer,
    }),
  );

  // daqui para baixo: só com login (e senha em dia), DENTRO do espaço da sessão — `dbEspaco` é o banco dele
  app.use('/api', requireAuth);
  app.use('/api', plataformaRouter(db)); // antes do espaço: o administrador pode não estar em nenhum
  app.use('/api', resolverEspaco(db));
  const arquivo = () => arquivoEspaco(espacoAtivo().espacoId);
  app.use('/api', systemRouter(db, dbEspaco, { arquivo })); // antes do CRUD genérico
  app.use('/api', membrosRouter(db, { mailer: opts.mailer, appUrl: opts.appUrl }));
  app.use('/api', paineisRouter(dbEspaco)); // fontes de dados, relatórios dinâmicos e preferências
  app.use('/api', notificacoesRouter(dbEspaco, { emailDisponivel: !!opts.emailDisponivel }));
  app.use('/api', appRouter(dbEspaco)); // rotas próprias da aplicação (sempre no espaço da sessão)
  app.use('/api', crudRouter({ plataforma: db, espaco: dbEspaco }, { uploadMaxMb }));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });

  // ---- front buildado (produção) ----
  const dist = webDist ?? path.resolve(SERVER_ROOT, '../web/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next()));
  }

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res
        .status(err.status)
        .json({ error: err.message, ...(err.fields && { errors: err.fields }), ...(err.code && { code: err.code }) });
    }
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Conteúdo muito grande' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
    logger.error({ err, method: req.method, url: req.originalUrl }, 'erro não tratado');
    res.status(500).json({ error: 'Erro interno' });
  };
  app.use(onError);

  return app;
}
