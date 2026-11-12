// Plataforma (Fase 5C): verificação em duas etapas (TOTP) e acesso de suporte com consentimento do dono.
// Colunas `segredo_*` nunca saem da API (o CRUD as remove em `present`).
import type { Knex } from 'knex';

export const name = '20261116000000_suporte_2fa';

export async function up(knex: Knex) {
  await knex.schema.alterTable('usuarios', (t) => {
    /** 2FA ligado (código do aplicativo autenticador no login) */
    t.boolean('dois_fatores').notNullable().defaultTo(false);
    t.text('segredo_2fa');
    /** Segredo gerado na configuração, antes de confirmar o primeiro código */
    t.text('segredo_2fa_pendente');
    /** Hashes (JSON) dos códigos de recuperação ainda não usados */
    t.text('segredo_2fa_recuperacao');
    /** Último passo de 30 s aceito (o mesmo código não vale duas vezes) */
    t.integer('segredo_2fa_passo');
  });
  // login em duas etapas: senha ok → desafio (curto) → código
  await knex.schema.createTable('desafios_2fa', (t) => {
    t.text('id').primary(); // hash do token
    t.integer('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.boolean('lembrar').notNullable().defaultTo(false);
    t.integer('tentativas').notNullable().defaultTo(0);
    t.text('criado_em').notNullable();
    t.text('expira_em').notNullable();
  });
  // o dono libera o suporte por um prazo; cada liberação é uma linha (histórico)
  await knex.schema.createTable('acessos_suporte', (t) => {
    t.increments('id');
    t.integer('espaco_id').notNullable().references('id').inTable('espacos').onDelete('CASCADE');
    /** leitor (padrão) ou editor */
    t.text('papel').notNullable().defaultTo('leitor');
    t.integer('liberado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('liberado_em').notNullable();
    t.text('expira_em').notNullable();
    t.text('revogado_em');
    t.integer('revogado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.index(['espaco_id']);
  });
  await knex.schema.alterTable('sessoes', (t) => {
    /** Sessão de suporte: em uso a liberação X (o espaço vem dela, não de `membros`) */
    t.integer('suporte_id').references('id').inTable('acessos_suporte').onDelete('SET NULL');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('sessoes', (t) => t.dropColumn('suporte_id'));
  await knex.schema.dropTableIfExists('acessos_suporte');
  await knex.schema.dropTableIfExists('desafios_2fa');
  await knex.schema.alterTable('usuarios', (t) => {
    for (const c of [
      'dois_fatores',
      'segredo_2fa',
      'segredo_2fa_pendente',
      'segredo_2fa_recuperacao',
      'segredo_2fa_passo',
    ])
      t.dropColumn(c);
  });
}
