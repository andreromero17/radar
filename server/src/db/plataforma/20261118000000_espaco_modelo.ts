// Plataforma (frame 0.22.0): um espaço pode ser o MODELO. Espaços novos recebem dele o que o sistema registrar
// (registrarCopiaDoModelo: bibliotecas, cadastros padrão...) — nunca os dados do dia a dia.
import type { Knex } from 'knex';

export const name = '20261118000000_espaco_modelo';

export async function up(knex: Knex) {
  await knex.schema.alterTable('espacos', (t) => {
    t.boolean('modelo').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('espacos', (t) => {
    t.dropColumn('modelo');
  });
}
