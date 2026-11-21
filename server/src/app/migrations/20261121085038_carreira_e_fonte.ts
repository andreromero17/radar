import type { Knex } from 'knex';

export const name = '20261121085038_carreira_e_fonte';

export async function up(knex: Knex) {
  await knex.schema.alterTable('publicacoes', (t) => {
    t.text('fonte_tipo');
  });
  // de onde veio cada publicação (antes só dava para saber pelo pessoa_id)
  await knex('publicacoes').whereNotNull('pessoa_id').update({ fonte_tipo: 'pessoa' });
  await knex('publicacoes').whereNull('pessoa_id').update({ fonte_tipo: 'empresa' });
  // reclassifica os posts das pessoas com a regra de troca de emprego (garantirAssuntos refaz os vazios)
  await knex('publicacoes').whereNotNull('pessoa_id').whereIn('post_proprio', [1, true]).update({ assuntos: null });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('publicacoes', (t) => {
    t.dropColumn('fonte_tipo');
  });
}
