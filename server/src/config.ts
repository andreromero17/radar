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
  DB_PATH: z.string().min(1).default('./data/app.db'),
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
  /** Número de proxies na frente do servidor (para obter o IP real). 0 = nenhum */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  // ---- E-mail (opcional; sem SMTP_HOST, os e-mails vão para o log) ----
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Sistema <nao-responda@localhost>'),
});

export type Config = Omit<z.infer<typeof schema>, 'COOKIE_SECURE' | 'SMTP_SECURE'> & {
  dbFile: string;
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
  const { COOKIE_SECURE, SMTP_SECURE, ...c } = parsed.data;
  return {
    ...c,
    cookieSecure: COOKIE_SECURE ? COOKIE_SECURE === 'true' : c.NODE_ENV === 'production',
    smtpSecure: SMTP_SECURE === 'true',
    dbFile: c.DB_PATH === ':memory:' ? ':memory:' : path.resolve(SERVER_ROOT, c.DB_PATH),
    corsOrigins: c.CORS_ORIGIN.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export const config = loadConfig();
