// Núcleo: tamanho do texto (pequeno / normal / grande) escolhido por cada usuário.
import type { Knex } from 'knex';

export const name = '20261111000000_tamanho_texto';

export async function up(knex: Knex) {
  await knex.schema.alterTable('usuarios', (t) => {
    t.text('tamanho_texto').defaultTo('normal');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('usuarios', (t) => {
    t.dropColumn('tamanho_texto');
  });
}
