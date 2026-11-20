import type { Knex } from 'knex';

export const name = '20261120153021_vagas_nas_metricas';

export async function up(knex: Knex) {
  await knex.schema.alterTable('metricas_empresas', (t) => {
    t.double('vagas');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('metricas_empresas', (t) => {
    t.dropColumn('vagas');
  });
}
