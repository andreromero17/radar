import type { Knex } from 'knex';

export const name = '20261121074503_reposts_identificados';

export async function up(knex: Knex) {
  await knex.schema.alterTable('publicacoes', (t) => {
    t.text('autor_linkedin');
    t.text('original_id');
  });
  // Reposts passam a ter chave própria (repost:e<empresa>:<id> ou repost:p<pessoa>:<id>): antes o repost e o post
  // original usavam o mesmo id_externo e um impedia o outro de entrar (ex.: a empresa repostou o post de uma
  // pessoa-chave que também é monitorada).
  const reposts = (await knex('publicacoes')
    .where('tipo', 'Post')
    .whereIn('post_proprio', [0, false])
    .whereNotNull('id_externo')
    .select('id', 'id_externo', 'empresa_id', 'pessoa_id')) as {
    id: number;
    id_externo: string;
    empresa_id: number | null;
    pessoa_id: number | null;
  }[];
  for (const r of reposts) {
    if (r.id_externo.startsWith('repost:')) continue;
    const dono = r.pessoa_id ? `p${r.pessoa_id}` : `e${r.empresa_id ?? 0}`;
    await knex('publicacoes')
      .where('id', r.id)
      .update({ id_externo: `repost:${dono}:${r.id_externo}`, original_id: r.id_externo });
  }
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('publicacoes', (t) => {
    t.dropColumn('autor_linkedin');
    t.dropColumn('original_id');
  });
}
