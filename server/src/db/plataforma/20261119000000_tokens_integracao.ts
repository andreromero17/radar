// Plataforma (frame 0.29.0): tokens de integração — acesso sem navegador (atalho do celular, automação) a rotas
// que o sistema libera para um escopo. Presos a um usuário e a um espaço; só o hash é guardado.
import type { Knex } from 'knex';

export const name = '20261119000000_tokens_integracao';

export async function up(knex: Knex) {
  await knex.schema.createTable('tokens_integracao', (t) => {
    t.increments('id');
    t.integer('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.integer('espaco_id').notNullable().references('id').inTable('espacos').onDelete('CASCADE');
    t.string('nome', 80).notNullable();
    t.string('escopo', 60).notNullable();
    t.string('token_hash', 64).notNullable().unique();
    /** Início do token (para o usuário reconhecer na lista) */
    t.string('prefixo', 12).notNullable();
    t.string('criado_em').notNullable();
    t.string('ultimo_uso');
    t.string('revogado_em');
    t.index(['usuario_id']);
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTable('tokens_integracao');
}
