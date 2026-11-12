// Núcleo: preferências de cada usuário guardadas no servidor (valem em qualquer aparelho), por chave.
// Ex.: 'painel:inicio' → { ocultos: [...], ordem: [...] } (widgets escondidos e ordem do painel).
import type { Knex } from 'knex';

export const name = '20261112000000_preferencias';

export async function up(knex: Knex) {
  await knex.schema.createTable('preferencias', (t) => {
    t.increments('id');
    t.integer('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.text('chave').notNullable();
    t.text('valor'); // JSON
    t.text('atualizado_em');
    t.unique(['usuario_id', 'chave']);
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists('preferencias');
}
