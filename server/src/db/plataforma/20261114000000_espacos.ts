// Plataforma (Fase 5A): espaços e membros. Cada espaço tem o próprio banco (data/espacos/<id>.db);
// aqui fica só quem é dono/membro de qual espaço. A sessão guarda o espaço em uso.
import type { Knex } from 'knex';

export const name = '20261114000000_espacos';

export async function up(knex: Knex) {
  await knex.schema.createTable('espacos', (t) => {
    t.increments('id');
    t.text('nome').notNullable();
    /** pessoal, holding, empresa... (livre; só para exibição) */
    t.text('tipo').notNullable().defaultTo('pessoal');
    t.integer('dono_id').references('id').inTable('usuarios').onDelete('RESTRICT');
    t.boolean('ativo').notNullable().defaultTo(true);
    t.text('criado_em').notNullable();
  });
  await knex.schema.createTable('membros', (t) => {
    t.increments('id');
    t.integer('espaco_id').notNullable().references('id').inTable('espacos').onDelete('CASCADE');
    t.integer('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    /** dono | editor | leitor */
    t.text('papel').notNullable().defaultTo('dono');
    t.boolean('ativo').notNullable().defaultTo(true);
    t.text('criado_em').notNullable();
    t.unique(['espaco_id', 'usuario_id']);
  });
  await knex.schema.alterTable('sessoes', (t) => {
    t.integer('espaco_id').references('id').inTable('espacos').onDelete('SET NULL');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('sessoes', (t) => t.dropColumn('espaco_id'));
  await knex.schema.dropTableIfExists('membros');
  await knex.schema.dropTableIfExists('espacos');
}
