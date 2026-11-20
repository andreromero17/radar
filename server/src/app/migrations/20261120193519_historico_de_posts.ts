import type { Knex } from 'knex';

export const name = '20261120193519_historico_de_posts';

export async function up(knex: Knex) {
  await knex.schema.alterTable('empresas', (t) => {
    t.text('historico_posts_em');
  });

  await knex.schema.alterTable('pessoas', (t) => {
    t.text('historico_posts_em');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('pessoas', (t) => {
    t.dropColumn('historico_posts_em');
  });

  await knex.schema.alterTable('empresas', (t) => {
    t.dropColumn('historico_posts_em');
  });
}
