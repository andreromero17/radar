// Plataforma (Fase 5D): cadastro com confirmação de e-mail, convites para testar (beta), aceite dos termos,
// exclusão de conta (espaços guardados 30 dias antes de apagar de vez) e feedback de quem usa.
import type { Knex } from 'knex';

export const name = '20261117000000_cadastro_lgpd';

export async function up(knex: Knex) {
  await knex.schema.alterTable('usuarios', (t) => {
    /** Conta criada pelo cadastro e ainda sem o e-mail confirmado: não entra */
    t.boolean('confirmar_email').notNullable().defaultTo(false);
    t.text('termos_aceitos_em');
    t.text('termos_versao');
  });
  await knex.schema.createTable('tokens_email', (t) => {
    t.text('id').primary(); // hash do token do link
    t.integer('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    /** Nome do primeiro espaço, criado ao confirmar */
    t.text('espaco_nome');
    t.text('criado_em').notNullable();
    t.text('expira_em').notNullable();
    t.text('usado_em');
  });
  await knex.schema.createTable('convites_plataforma', (t) => {
    t.increments('id');
    t.text('email').notNullable();
    t.text('token').notNullable().unique(); // hash
    t.integer('convidado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('criado_em').notNullable();
    t.text('expira_em').notNullable();
    t.text('usado_em');
    t.integer('usado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('cancelado_em');
  });
  await knex.schema.createTable('espacos_excluidos', (t) => {
    t.increments('id');
    t.integer('espaco_id').notNullable();
    t.text('nome').notNullable();
    /** Onde ficou o banco até ser apagado de vez (null = banco em memória) */
    t.text('arquivo');
    t.text('motivo');
    t.text('excluido_em').notNullable();
    t.text('apagado_em');
  });
  await knex.schema.createTable('feedbacks', (t) => {
    t.increments('id');
    t.integer('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('nome');
    t.text('email');
    /** sugestao | problema | elogio */
    t.text('tipo').notNullable();
    t.text('mensagem').notNullable();
    t.text('pagina');
    t.text('navegador');
    t.text('versao');
    t.text('criado_em').notNullable();
    t.text('lido_em');
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists('feedbacks');
  await knex.schema.dropTableIfExists('espacos_excluidos');
  await knex.schema.dropTableIfExists('convites_plataforma');
  await knex.schema.dropTableIfExists('tokens_email');
  await knex.schema.alterTable('usuarios', (t) => {
    for (const c of ['confirmar_email', 'termos_aceitos_em', 'termos_versao']) t.dropColumn(c);
  });
}
