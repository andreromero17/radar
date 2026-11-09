// Núcleo: aparência (claro / escuro / do sistema) escolhida por cada usuário.
import type { Knex } from 'knex';

export const name = '20261110000000_aparencia';

export async function up(knex: Knex) {
  await knex.schema.alterTable('usuarios', (t) => {
    t.text('aparencia').defaultTo('sistema');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('usuarios', (t) => {
    t.dropColumn('aparencia');
  });
}
