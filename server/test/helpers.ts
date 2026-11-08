import pino from 'pino';
import request from 'supertest';
import { createApp } from '../src/app';
import { createEntityTable } from '../src/db/diff';
import { createDb } from '../src/db/knex';
import { migrateLatest } from '../src/db/migrator';
import { seed } from '../src/db/seed';
import { memoryMailer } from '../src/services/mailer';
import { fixtureEntities, seedFixtures, registerFixtureEntities } from './fixtures';

export const APP_URL = 'http://localhost:5173';
export { registerFixtureEntities };

/**
 * App completo sobre SQLite em memória: núcleo migrado + entidades de exemplo.
 * `admin`, `operador` e `leitura` são clientes HTTP já logados (cookie de sessão).
 */
export async function makeTestApp() {
  registerFixtureEntities();
  const db = createDb(':memory:');
  await migrateLatest(db);
  for (const [table, ent] of Object.entries(fixtureEntities)) await createEntityTable(db, table, ent);
  await seed(db);
  await seedFixtures(db);
  const mailer = memoryMailer();
  const app = createApp({
    db,
    logger: pino({ level: 'silent' }),
    dbFile: ':memory:',
    webDist: '/nao-existe',
    mailer,
    appUrl: APP_URL,
  });

  const login = async (email: string, senha: string) => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, senha });
    if (res.status !== 200) throw new Error(`login falhou para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    return agent;
  };

  return {
    db,
    app,
    mailer,
    login,
    admin: await login('admin@sistema.com', 'admin123'),
    operador: await login('ana@sistema.com', 'senha123'),
    leitura: await login('bruno@sistema.com', 'senha123'),
  };
}

export type TestCtx = Awaited<ReturnType<typeof makeTestApp>>;
