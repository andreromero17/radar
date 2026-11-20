import type { Knex } from 'knex';

export const name = '20261120111113_metricas_e_universo_nos';

export async function up(knex: Knex) {
  await knex.schema.createTable('metricas_empresas', (t) => {
    t.increments('id');
    t.date('data');
    t.integer('empresa_id').references('id').inTable('empresas').onDelete('SET NULL');
    t.index(['empresa_id']);
    t.double('seguidores');
    t.double('funcionarios');
    t.text('criado_em');
    t.text('atualizado_em');
  });
  await knex.schema.alterTable('metricas_empresas', (t) => t.unique(['empresa_id', 'data']));
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists('metricas_empresas');
}
