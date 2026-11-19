import type { Knex } from 'knex';

export const name = '20261119200457_entidades_do_radar';

export async function up(knex: Knex) {
  await knex.schema.createTable('empresas', (t) => {
    t.increments('id');
    t.text('logo');
    t.text('universo');
    t.text('nome');
    t.text('nome_curto');
    t.text('linkedin_url');
    t.text('site');
    t.text('segmento');
    t.text('tier');
    t.text('uf');
    t.text('dono');
    t.double('seguidores');
    t.text('logo_linkedin');
    t.double('pipedrive_org_id');
    t.boolean('monitorar');
    t.text('observacoes');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.createTable('pessoas', (t) => {
    t.increments('id');
    t.text('nome');
    t.integer('empresa_id').references('id').inTable('empresas').onDelete('SET NULL');
    t.index(['empresa_id']);
    t.text('cargo');
    t.text('nivel');
    t.text('prioridade');
    t.text('linkedin_url');
    t.text('titulo_linkedin');
    t.double('pipedrive_person_id');
    t.boolean('monitorar');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.createTable('publicacoes', (t) => {
    t.increments('id');
    t.date('data_publicacao');
    t.text('tipo');
    t.integer('empresa_id').references('id').inTable('empresas').onDelete('SET NULL');
    t.index(['empresa_id']);
    t.integer('pessoa_id').references('id').inTable('pessoas').onDelete('SET NULL');
    t.index(['pessoa_id']);
    t.text('autor');
    t.text('titulo');
    t.text('texto');
    t.text('url');
    t.boolean('post_proprio');
    t.double('curtidas');
    t.double('comentarios');
    t.double('compartilhamentos');
    t.text('triagem');
    t.text('id_externo');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.createTable('sinais', (t) => {
    t.increments('id');
    t.date('data');
    t.text('universo');
    t.text('severidade');
    t.double('confianca');
    t.text('tipo');
    t.integer('empresa_id').references('id').inTable('empresas').onDelete('SET NULL');
    t.index(['empresa_id']);
    t.integer('pessoa_id').references('id').inTable('pessoas').onDelete('SET NULL');
    t.index(['pessoa_id']);
    t.integer('publicacao_id').references('id').inTable('publicacoes').onDelete('SET NULL');
    t.index(['publicacao_id']);
    t.text('titulo');
    t.text('gancho');
    t.text('linha_servico');
    t.text('situacao');
    t.text('avaliacao');
    t.text('comentario');
    t.text('modelo');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.createTable('alertas_cadastro', (t) => {
    t.increments('id');
    t.text('tipo');
    t.integer('pessoa_id').references('id').inTable('pessoas').onDelete('SET NULL');
    t.index(['pessoa_id']);
    t.integer('empresa_id').references('id').inTable('empresas').onDelete('SET NULL');
    t.index(['empresa_id']);
    t.text('detalhe');
    t.text('sugestao');
    t.text('situacao');
    t.text('chave');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.createTable('coletas', (t) => {
    t.increments('id');
    t.text('inicio');
    t.text('fim');
    t.text('situacao');
    t.text('descricao');
    t.text('ator');
    t.double('fontes');
    t.double('itens_encontrados');
    t.double('itens_novos');
    t.double('descartados');
    t.double('custo_usd');
    t.text('erro');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  // Chaves que a coleta e a sincronização usam para não duplicar (null pode repetir)
  await knex.schema.alterTable('empresas', (t) => t.unique(['linkedin_url']));
  await knex.schema.alterTable('pessoas', (t) => t.unique(['linkedin_url']));
  await knex.schema.alterTable('publicacoes', (t) => t.unique(['id_externo']));
  await knex.schema.alterTable('alertas_cadastro', (t) => t.unique(['chave']));
  await knex.schema.alterTable('sinais', (t) => t.index(['data']));
  await knex.schema.alterTable('publicacoes', (t) => t.index(['data_publicacao']));
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists('coletas');

  await knex.schema.dropTableIfExists('alertas_cadastro');

  await knex.schema.dropTableIfExists('sinais');

  await knex.schema.dropTableIfExists('publicacoes');

  await knex.schema.dropTableIfExists('pessoas');

  await knex.schema.dropTableIfExists('empresas');
}
