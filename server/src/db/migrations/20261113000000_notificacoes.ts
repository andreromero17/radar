// Núcleo: notificações por usuário (Fase 4C). `chave` identifica o aviso (um por usuário: não se repete).
import type { Knex } from 'knex';

export const name = '20261113000000_notificacoes';

export async function up(knex: Knex) {
  await knex.schema.createTable('notificacoes', (t) => {
    t.increments('id');
    t.integer('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.text('tipo').notNullable();
    t.text('chave').notNullable();
    t.text('nivel').notNullable();
    t.text('titulo').notNullable();
    t.text('mensagem');
    t.text('link');
    t.text('icone');
    t.text('criada_em').notNullable();
    t.text('lida_em');
    t.unique(['usuario_id', 'chave']);
    t.index(['usuario_id', 'lida_em']);
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists('notificacoes');
}
