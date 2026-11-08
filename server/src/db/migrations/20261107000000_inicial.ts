import type { Knex } from 'knex';

export const name = '20261107000000_inicial';

export async function up(knex: Knex) {
  await knex.schema.createTable('clientes', (t) => {
    t.increments('id');
    t.text('nome');
    t.text('email');
    t.text('telefone');
    t.text('documento');
    t.boolean('ativo');
    t.text('observacoes');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.createTable('usuarios', (t) => {
    t.increments('id');
    t.text('nome');
    t.text('email');
    t.text('perfil');
    t.boolean('ativo');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.createTable('chamados', (t) => {
    t.increments('id');
    t.text('protocolo');
    t.text('assunto');
    t.text('prioridade');
    t.integer('cliente_id').references('id').inTable('clientes').onDelete('SET NULL');
    t.integer('responsavel_id').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('status');
    t.text('descricao');
    t.text('criado_em');
    t.text('atualizado_em');
    t.index(['cliente_id']);
    t.index(['responsavel_id']);
  });

  // ---- tabelas de sistema ----
  await knex.schema.createTable('logs', (t) => {
    t.increments('id');
    t.text('entidade');
    t.integer('registro_id');
    t.text('acao');
    t.text('detalhe');
    t.text('usuario');
    t.text('criado_em');
    t.index(['criado_em']);
  });

  await knex.schema.createTable('configuracoes', (t) => {
    t.text('chave').primary();
    t.text('valor');
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists('configuracoes');
  await knex.schema.dropTableIfExists('logs');
  await knex.schema.dropTableIfExists('chamados');
  await knex.schema.dropTableIfExists('usuarios');
  await knex.schema.dropTableIfExists('clientes');
}
