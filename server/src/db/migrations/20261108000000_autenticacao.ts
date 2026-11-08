import type { Knex } from 'knex';
import { nowLocal } from '../../utils/time';

export const name = '20261108000000_autenticacao';

/** Perfis padrão: necessários em qualquer instalação (não são dados de exemplo) */
const PERFIS = [
  {
    nome: 'Administrador',
    descricao: 'Acesso total ao sistema',
    admin: true,
    permissoes: {},
  },
  {
    nome: 'Operador',
    descricao: 'Opera o dia a dia: clientes e chamados',
    admin: false,
    permissoes: { clientes: ['ver', 'criar', 'editar'], chamados: ['ver', 'criar', 'editar', 'excluir'] },
  },
  {
    nome: 'Leitura',
    descricao: 'Apenas consulta',
    admin: false,
    permissoes: { clientes: ['ver'], chamados: ['ver'] },
  },
];

export async function up(knex: Knex) {
  // ---- perfis de acesso ----
  await knex.schema.createTable('perfis', (t) => {
    t.increments('id');
    t.text('nome').unique();
    t.text('descricao');
    t.boolean('admin');
    t.text('permissoes'); // JSON { recurso: [ações] }
    t.text('criado_em');
    t.text('atualizado_em');
  });
  await knex('perfis').insert(
    PERFIS.map((p) => ({ ...p, permissoes: JSON.stringify(p.permissoes), criado_em: nowLocal() })),
  );

  // ---- usuários: perfil texto -> perfil_id, senha, controle de acesso ----
  await knex.schema.alterTable('usuarios', (t) => {
    t.integer('perfil_id').references('id').inTable('perfis').onDelete('RESTRICT');
    t.text('senha'); // hash scrypt; nunca sai da API
    t.boolean('trocar_senha');
    t.text('ultimo_acesso');
  });
  const leitura = await knex('perfis').where('nome', 'Leitura').first('id');
  for (const p of await knex('perfis').select('id', 'nome')) {
    await knex('usuarios').where('perfil', p.nome).update({ perfil_id: p.id });
  }
  await knex('usuarios').whereNull('perfil_id').update({ perfil_id: leitura.id });
  await knex('usuarios').update({ email: knex.raw('lower(trim(email))'), trocar_senha: false });
  await knex.schema.alterTable('usuarios', (t) => {
    t.dropColumn('perfil');
    t.unique(['email']);
    t.index(['perfil_id']);
  });

  // ---- sessões (id = hash SHA-256 do token do cookie) ----
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

  // ---- tokens de redefinição de senha (id = hash SHA-256 do token do link) ----
  await knex.schema.createTable('tokens_senha', (t) => {
    t.text('id').primary();
    t.integer('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.text('criado_em');
    t.text('expira_em');
    t.text('usado_em');
    t.index(['usuario_id']);
  });

  // ---- logs: quem, de onde e o que mudou ----
  await knex.schema.alterTable('logs', (t) => {
    t.integer('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('ip');
    t.text('alteracoes'); // JSON { campo: { de, para } }
    t.index(['usuario_id']);
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('logs', (t) => {
    t.dropIndex(['usuario_id']);
    t.dropColumn('usuario_id');
    t.dropColumn('ip');
    t.dropColumn('alteracoes');
  });
  await knex.schema.dropTableIfExists('tokens_senha');
  await knex.schema.dropTableIfExists('sessoes');

  await knex.schema.alterTable('usuarios', (t) => {
    t.text('perfil');
  });
  for (const p of await knex('perfis').select('id', 'nome')) {
    await knex('usuarios').where('perfil_id', p.id).update({ perfil: p.nome });
  }
  await knex.schema.alterTable('usuarios', (t) => {
    t.dropUnique(['email']);
    t.dropIndex(['perfil_id']);
    t.dropColumn('perfil_id');
    t.dropColumn('senha');
    t.dropColumn('trocar_senha');
    t.dropColumn('ultimo_acesso');
  });
  await knex.schema.dropTableIfExists('perfis');
}
