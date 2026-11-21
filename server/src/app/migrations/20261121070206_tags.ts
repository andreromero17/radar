import type { Knex } from 'knex';

export const name = '20261121070206_tags';

export async function up(knex: Knex) {
  await knex.schema.createTable('tags', (t) => {
    t.increments('id');
    t.text('nome');
    t.text('cor');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.alterTable('empresas', (t) => {
    t.text('tags');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('empresas', (t) => {
    t.dropColumn('tags');
  });

  await knex.schema.dropTableIfExists('tags');
}
