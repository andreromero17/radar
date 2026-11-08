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
});

export type Config = z.infer<typeof schema> & { dbFile: string; corsOrigins: string[] };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`\n✖ Configuração inválida em server/.env:\n${lines}\n`);
    process.exit(1);
  }
  const c = parsed.data;
  return {
    ...c,
    dbFile: c.DB_PATH === ':memory:' ? ':memory:' : path.resolve(SERVER_ROOT, c.DB_PATH),
    corsOrigins: c.CORS_ORIGIN.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export const config = loadConfig();
