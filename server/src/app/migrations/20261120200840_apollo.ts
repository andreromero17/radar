import type { Knex } from 'knex';

export const name = '20261120200840_apollo';

export async function up(knex: Knex) {
  await knex.schema.createTable('sugestoes_pessoas', (t) => {
    t.increments('id');
    t.integer('empresa_id').references('id').inTable('empresas').onDelete('SET NULL');
    t.index(['empresa_id']);
    t.text('nome');
    t.text('cargo');
    t.text('area');
    t.text('situacao');
    t.integer('pessoa_id').references('id').inTable('pessoas').onDelete('SET NULL');
    t.index(['pessoa_id']);
    t.text('apollo_id');
    t.index(['apollo_id']);
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.alterTable('empresas', (t) => {
    t.double('apollo_funcionarios');
    t.text('apollo_setor');
    t.text('apollo_faturamento');
    t.double('apollo_fundacao');
    t.text('apollo_local');
    t.text('apollo_investimento');
    t.text('apollo_tecnologias');
    t.text('apollo_descricao');
    t.text('apollo_enriquecido_em');
    t.text('apollo_org_id');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('empresas', (t) => {
    t.dropColumn('apollo_funcionarios');
    t.dropColumn('apollo_setor');
    t.dropColumn('apollo_faturamento');
    t.dropColumn('apollo_fundacao');
    t.dropColumn('apollo_local');
    t.dropColumn('apollo_investimento');
    t.dropColumn('apollo_tecnologias');
    t.dropColumn('apollo_descricao');
    t.dropColumn('apollo_enriquecido_em');
    t.dropColumn('apollo_org_id');
  });

  await knex.schema.dropTableIfExists('sugestoes_pessoas');
}
