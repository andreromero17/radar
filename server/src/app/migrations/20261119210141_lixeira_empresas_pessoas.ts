import type { Knex } from 'knex';

export const name = '20261119210141_lixeira_empresas_pessoas';

export async function up(knex: Knex) {
  await knex.schema.alterTable('empresas', (t) => {
    t.text('excluido_em');
  });

  await knex.schema.alterTable('pessoas', (t) => {
    t.text('excluido_em');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('pessoas', (t) => {
    t.dropColumn('excluido_em');
  });

  await knex.schema.alterTable('empresas', (t) => {
    t.dropColumn('excluido_em');
  });
}
