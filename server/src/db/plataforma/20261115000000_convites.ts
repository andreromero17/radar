// Plataforma (Fase 5B): convites para espaços e o perfil "Membro".
// O papel no espaço (dono/editor/leitor) decide o que cada um faz nos dados; o perfil continua valendo como
// restrição para editores. `perfis.completo` = acesso a todos os dados dos espaços em que a pessoa participa
// (sem nenhum poder na plataforma) — é o perfil de quem entra por convite.
import type { Knex } from 'knex';
import { nowLocal } from '../../utils/time';

export const name = '20261115000000_convites';

export async function up(knex: Knex) {
  await knex.schema.alterTable('perfis', (t) => {
    t.boolean('completo').notNullable().defaultTo(false);
  });
  const existe = await knex('perfis').where({ nome: 'Membro' }).first('id');
  if (existe) await knex('perfis').where({ id: existe.id }).update({ completo: true });
  else
    await knex('perfis').insert({
      nome: 'Membro',
      descricao: 'Dados dos espaços em que participa, conforme o papel (dono, editor, leitor)',
      admin: false,
      completo: true,
      permissoes: '{}',
      criado_em: nowLocal(),
    });
  await knex.schema.createTable('convites', (t) => {
    t.increments('id');
    t.integer('espaco_id').notNullable().references('id').inTable('espacos').onDelete('CASCADE');
    t.text('email').notNullable();
    /** editor | leitor | dono */
    t.text('papel').notNullable();
    /** hash do token do link (o token em si só vai no e-mail) */
    t.text('token').notNullable().unique();
    t.integer('convidado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('criado_em').notNullable();
    t.text('expira_em').notNullable();
    t.text('aceito_em');
    t.integer('aceito_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('cancelado_em');
    t.index(['espaco_id']);
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists('convites');
  await knex('perfis').where({ nome: 'Membro' }).del();
  await knex.schema.alterTable('perfis', (t) => t.dropColumn('completo'));
}
