import pino from 'pino';
import { createApp } from '../src/app';
import { createDb } from '../src/db/knex';
import { migrateLatest } from '../src/db/migrator';
import { seed } from '../src/db/seed';

/** App completo sobre um banco SQLite em memória, migrado e com dados de exemplo. */
export async function makeTestApp({ withSeed = true } = {}) {
  const db = createDb(':memory:');
  await migrateLatest(db);
  if (withSeed) await seed(db);
  const app = createApp({ db, logger: pino({ level: 'silent' }), dbFile: ':memory:', webDist: '/nao-existe' });
  return { db, app };
}
