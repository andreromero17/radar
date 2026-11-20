import type { Knex } from 'knex';

export const name = '20261120180824_universo_das_publicacoes';

export async function up(knex: Knex) {
  await knex.schema.alterTable('publicacoes', (t) => {
    t.text('universo');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('publicacoes', (t) => {
    t.dropColumn('universo');
  });
}
