import type { Knex } from 'knex';

export const name = '20261119220717_run_apify_nas_coletas';

export async function up(knex: Knex) {
  await knex.schema.alterTable('coletas', (t) => {
    t.text('run_apify');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('coletas', (t) => {
    t.dropColumn('run_apify');
  });
}
