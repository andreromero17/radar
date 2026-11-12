import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../src/app';
import { createEntityTable } from '../src/db/diff';
import { createDb } from '../src/db/knex';
import { migrateLatest } from '../src/db/migrator';
import { seed, seedEspaco } from '../src/db/seed';
import { abrirEspaco, adicionarMembro, configurarEspacos, criarEspaco } from '../src/espacos';
import { memoryMailer } from '../src/services/mailer';
import { fixtureEntities, seedFixtures, seedFixtureUsuarios, registerFixtureEntities } from './fixtures';

export const APP_URL = 'http://localhost:5173';
export { registerFixtureEntities };

/**
 * App completo sobre SQLite em memória (Fase 5A): PLATAFORMA (usuários, sessões, espaços) + um ESPAÇO com o
 * núcleo migrado e as entidades de exemplo. `db` = banco do espaço (onde ficam os dados); `plataforma` = usuários,
 * perfis, sessões, configurações de identidade. `admin`, `operador` e `leitura` são clientes HTTP já logados,
 * todos membros do espaço.
 */
export async function makeTestApp() {
  registerFixtureEntities();
  const plataforma = createDb(':memory:');
  await migrateLatest(plataforma, 'plataforma');
  await seed(plataforma);
  await seedFixtureUsuarios(plataforma);
  configurarEspacos({ plataforma, dir: null, autoMigrar: true });
  const usuarios = (await plataforma('usuarios').orderBy('id').select('id', 'email')) as {
    id: number;
    email: string;
  }[];
  const admin = usuarios.find((u) => u.email === 'admin@sistema.com')!;
  const espacoId = await criarEspaco({ nome: 'Espaço de teste', donoId: admin.id });
  for (const u of usuarios.filter((x) => x.id !== admin.id)) await adicionarMembro(espacoId, u.id, 'editor');
  const db = await abrirEspaco(espacoId);
  await seedEspaco(db); // dados de exemplo do sistema derivado (no frame, vazio)
  for (const [table, ent] of Object.entries(fixtureEntities)) await createEntityTable(db, table, ent);
  await seedFixtures(db);

  const mailer = memoryMailer();
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-anexos-'));
  const app = createApp({
    uploadDir,
    uploadMaxMb: 1,
    db: plataforma,
    logger: pino({ level: 'silent' }),
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
    plataforma,
    espacoId,
    app,
    mailer,
    uploadDir,
    login,
    admin: await login('admin@sistema.com', 'admin123'),
    operador: await login('ana@sistema.com', 'senha123'),
    leitura: await login('bruno@sistema.com', 'senha123'),
  };
}

export type TestCtx = Awaited<ReturnType<typeof makeTestApp>>;
