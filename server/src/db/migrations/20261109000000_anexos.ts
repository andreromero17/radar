// Núcleo: arquivos anexados a registros de qualquer entidade com `anexos: true`.
// O conteúdo fica em disco (UPLOAD_DIR); aqui só os metadados.
import type { Knex } from 'knex';

export const name = '20261109000000_anexos';

export async function up(knex: Knex) {
  await knex.schema.createTable('anexos', (t) => {
    t.increments('id');
    t.text('entidade').notNullable();
    t.integer('registro_id').notNullable();
    t.text('nome').notNullable();
    t.text('tipo');
    t.integer('tamanho');
    t.text('arquivo').notNullable(); // nome do arquivo no disco (aleatório)
    t.integer('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    t.text('criado_em');
    t.index(['entidade', 'registro_id']);
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists('anexos');
}
