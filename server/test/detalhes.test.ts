import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerEntities, type EntityDef } from '@frame/shared';
import { createEntityTable } from '../src/db/diff';
import { makeTestApp, type TestCtx } from './helpers';

// 0.30.0: filtro que também casa nas linhas da sub-tabela (FieldDef.filtraDetalhe)
const despesas: EntityDef = {
  label: 'Despesas',
  singular: 'Despesa',
  icon: 'cash',
  labelField: 'descricao',
  details: [{ entity: 't_despesa_partes', field: 'despesa_id' }],
  fields: [
    { name: 'descricao', label: 'Descrição', type: 'text', required: true },
    {
      name: 'grupo',
      label: 'Grupo',
      type: 'select',
      options: ['Casa', 'Gás', 'Água', 'Lazer'],
      filtraDetalhe: { entidade: 't_despesa_partes', campo: 'grupo' },
    },
    { name: 'valor', label: 'Valor', type: 'money' },
  ],
};
const partes: EntityDef = {
  label: 'Partes',
  singular: 'Parte',
  icon: 'list',
  labelField: 'grupo',
  detailOf: 't_despesas',
  fields: [
    { name: 'despesa_id', label: 'Despesa', type: 'relation', entity: 't_despesas', required: true },
    { name: 'grupo', label: 'Grupo', type: 'select', options: ['Casa', 'Gás', 'Água', 'Lazer'], required: true },
    { name: 'valor', label: 'Valor', type: 'money', required: true },
  ],
};
registerEntities({ t_despesas: despesas, t_despesa_partes: partes });

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
  await createEntityTable(ctx.db, 't_despesas', despesas);
  await createEntityTable(ctx.db, 't_despesa_partes', partes);
  const nova = (descricao: string, grupo: string, linhas: { grupo: string; valor: number }[]) =>
    ctx.admin.post('/api/t_despesas').send({ descricao, grupo, valor: 100, t_despesa_partes: linhas }).expect(201);
  await nova('Condomínio', 'Casa', [
    { grupo: 'Casa', valor: 70 },
    { grupo: 'Gás', valor: 20 },
    { grupo: 'Água', valor: 10 },
  ]);
  await nova('Cinema', 'Lazer', []);
  await nova('Botijão', 'Gás', []);
});
afterAll(() => ctx.db.destroy());

const nomes = async (q: string) =>
  (
    (await ctx.admin.get(`/api/t_despesas?${q}&sort=descricao&dir=asc`).expect(200)).body.rows as {
      descricao: string;
    }[]
  ).map((r) => r.descricao);

describe('filtro que casa nas linhas da sub-tabela', () => {
  it('o registro aparece pelo próprio valor ou pelo de uma linha', async () => {
    expect(await nomes('grupo=G%C3%A1s')).toEqual(['Botijão', 'Condomínio']);
    expect(await nomes('grupo=%C3%81gua')).toEqual(['Condomínio']);
    expect(await nomes('grupo=Lazer')).toEqual(['Cinema']);
    expect(await nomes('grupo=Lazer&grupo=%C3%81gua')).toEqual(['Cinema', 'Condomínio']);
  });

  it('sem filtro, cada registro uma vez só', async () => {
    expect(await nomes('page=1')).toEqual(['Botijão', 'Cinema', 'Condomínio']);
  });
});
