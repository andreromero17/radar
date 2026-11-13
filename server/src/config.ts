// =============================================================================
// Configuração por ambiente. Lê server/.env e valida tudo no boot: se algo
// estiver errado, o servidor não sobe e diz exatamente o que corrigir.
// =============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/** Pasta server/ — vale tanto rodando de src/ (tsx) quanto de dist/ (build) */
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /** Banco da plataforma (usuários, sessões, identidade, espaços) */
  DB_PATH: z.string().min(1).default('./data/app.db'),
  /**
   * Postgres (Fase 6A): postgres://usuario:senha@host:5432/banco. Preenchido, a plataforma fica no schema `public` e
   * cada espaço no schema `espaco_<id>`; DB_PATH/ESPACOS_DIR deixam de ser usados. Vazio = SQLite (arquivos).
   */
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'Use postgres://usuario:senha@host:5432/banco')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  /** Pasta dos bancos dos espaços (um arquivo por espaço) */
  ESPACOS_DIR: z.string().min(1).default('./data/espacos'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // ---- Acesso ----
  /** Endereço público do front (usado nos links enviados por e-mail) */
  APP_URL: z.url('APP_URL deve ser uma URL (ex.: http://localhost:5173)').default('http://localhost:5173'),
  /** Sessão expira após X horas sem uso */
  SESSION_HOURS: z.coerce.number().positive().max(720).default(12),
  /** Duração da sessão com "lembrar de mim" */
  REMEMBER_DAYS: z.coerce.number().int().positive().max(365).default(30),
  /** Cookie só trafega em HTTPS. Padrão: ligado em produção */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  /** Administradores precisam da verificação em duas etapas (Fase 5C). Padrão: ligado em produção */
  ADMIN_2FA_OBRIGATORIO: z.enum(['true', 'false']).optional(),
  /** Número de proxies na frente do servidor (para obter o IP real). 0 = nenhum */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  // ---- E-mail (opcional; sem SMTP_HOST, os e-mails vão para o log) ----
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Sistema <nao-responda@localhost>'),

  // ---- Arquivos ----
  /** Pasta dos anexos (relativa a server/) */
  UPLOAD_DIR: z.string().min(1).default('./data/anexos'),
  /** Tamanho máximo de um anexo ou arquivo importado, em MB */
  UPLOAD_MAX_MB: z.coerce.number().positive().max(200).default(10),

  /** Módulo de demonstração (cadastros de exemplo com todos os recursos do motor) */
  DEMO: z.enum(['true', 'false']).default('false'),
});

export type Config = Omit<
  z.infer<typeof schema>,
  'COOKIE_SECURE' | 'SMTP_SECURE' | 'DEMO' | 'ADMIN_2FA_OBRIGATORIO'
> & {
  admin2faObrigatorio: boolean;
  demo: boolean;
  dbFile: string;
  espacosDir: string;
  uploadDir: string;
  corsOrigins: string[];
  cookieSecure: boolean;
  smtpSecure: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`\n✖ Configuração inválida em server/.env:\n${lines}\n`);
    process.exit(1);
  }
  const { COOKIE_SECURE, SMTP_SECURE, DEMO, ADMIN_2FA_OBRIGATORIO, ...c } = parsed.data;
  return {
    ...c,
    cookieSecure: COOKIE_SECURE ? COOKIE_SECURE === 'true' : c.NODE_ENV === 'production',
    smtpSecure: SMTP_SECURE === 'true',
    admin2faObrigatorio: ADMIN_2FA_OBRIGATORIO ? ADMIN_2FA_OBRIGATORIO === 'true' : c.NODE_ENV === 'production',
    demo: DEMO === 'true',
    uploadDir: path.resolve(SERVER_ROOT, c.UPLOAD_DIR),
    espacosDir: path.resolve(SERVER_ROOT, c.ESPACOS_DIR),
    dbFile: c.DB_PATH === ':memory:' ? ':memory:' : path.resolve(SERVER_ROOT, c.DB_PATH),
    corsOrigins: c.CORS_ORIGIN.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export const config = loadConfig();
