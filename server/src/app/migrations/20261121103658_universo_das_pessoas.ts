import type { Knex } from 'knex';

export const name = '20261121103658_universo_das_pessoas';

export async function up(knex: Knex) {
  await knex.schema.alterTable('pessoas', (t) => {
    t.text('universo');
  });
  await knex('pessoas').update({
    universo: knex('empresas').select('universo').whereRaw('empresas.id = pessoas.empresa_id'),
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('pessoas', (t) => {
    t.dropColumn('universo');
  });
}
