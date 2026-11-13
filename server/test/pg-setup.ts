// Rodada da suíte no Postgres (TESTE_PG_URL): apaga os schemas de teste da rodada anterior
import knex from 'knex';

export default async function setup() {
  const url = process.env.TESTE_PG_URL;
  if (!url) return;
  const db = knex({ client: 'pg', connection: url });
  try {
    const schemas = (await db('information_schema.schemata')
      .where('schema_name', 'like', 't\\_%')
      .pluck('schema_name')) as string[];
    for (const s of schemas) await db.raw('drop schema ?? cascade', [s]);
  } finally {
    await db.destroy();
  }
}
