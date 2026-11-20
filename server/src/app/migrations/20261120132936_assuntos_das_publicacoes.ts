import type { Knex } from 'knex';

export const name = '20261120132936_assuntos_das_publicacoes';

export async function up(knex: Knex) {
  await knex.schema.alterTable('publicacoes', (t) => {
    t.text('assuntos');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('publicacoes', (t) => {
    t.dropColumn('assuntos');
  });
}
