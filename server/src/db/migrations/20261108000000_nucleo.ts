// =============================================================================
// Migração inicial do NÚCLEO do frame: acesso, segurança, logs e configurações.
// As tabelas da aplicação vêm em migrações seguintes (npm run db:diff).
// =============================================================================
import type { Knex } from 'knex';
import { nowLocal } from '../../utils/time';

export const name = '20261108000000_nucleo';

/** Perfis padrão: necessários em qualquer instalação (não são dados de exemplo) */
const PERFIS = [
  { nome: 'Administrador', descricao: 'Acesso total ao sistema', admin: true },
  { nome: 'Usuário', descricao: 'Ponto de partida: libere as permissões conforme o sistema', admin: false },
];

export async function up(knex: Knex) {
  await knex.schema.createTable('perfis', (t) => {
    t.increments('id');
    t.text('nome').unique();
    t.text('descricao');
    t.boolean('admin');
    t.text('permissoes'); // JSON { recurso: [ações] }
    t.text('criado_em');
    t.text('atualizado_em');
  });
  await knex('perfis').insert(PERFIS.map((p) => ({ ...p, permissoes: '{}', criado_em: nowLocal() })));

  await knex.schema.createTable('usuarios', (t) => {
    t.increments('id');
    t.text('nome');
    t.text('email').unique();
    t.integer('perfil_id').references('id').inTable('perfis').onDelete('RESTRICT');
    t.text('senha'); // hash scrypt; nunca sai da API
    t.boolean('ativo');
    t.boolean('trocar_senha');
    t.text('ultimo_acesso');
    t.text('criado_em');
    t.text('atualizado_em');
    t.index(['perfil_id']);
  });

  // sessões: id = hash SHA-256 do token do cookie
  await knex.schema.createTable('sessoes', (t) => {
    t.text('id').primary();
    t.integer('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.boolean('lembrar');
    t.text('criado_em');
    t.text('expira_em');
    t.text('ultimo_uso');
    t.text('ip');
    t.text('user_agent');
    t.index(['usuario_id']);
    t.index(['expira_em']);
  });

  // links de redefinição de senha: id = hash SHA-256 do token do link
  await knex.schema.createTable('tokens_senha', (t) => {
    t.text('id').primary();
    t.integer('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.text('criado_em');
    t.text('expira_em');
    t.text('usado_em');
    t.index(['usuario_id']);
  });

  await knex.schema.createTable('logs', (t) => {
    t.increments('id');
    t.text('entidade');
    t.integer('registro_id');
    t.text('acao');
    t.text('detalhe');
    t.integer('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('usuario');
    t.text('ip');
    t.text('alteracoes'); // JSON { campo: { de, para } }
    t.text('criado_em');
    t.index(['criado_em']);
    t.index(['usuario_id']);
    t.index(['entidade', 'registro_id']);
  });

  await knex.schema.createTable('configuracoes', (t) => {
    t.text('chave').primary();
    t.text('valor');
  });
}

export async function down(knex: Knex) {
  for (const t of ['configuracoes', 'logs', 'tokens_senha', 'sessoes', 'usuarios', 'perfis']) {
    await knex.schema.dropTableIfExists(t);
  }
}
