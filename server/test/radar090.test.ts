import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestApp, type TestCtx } from './helpers';

// Radar 0.4.11: universo nas pessoas (copiado da empresa) para filtrar a lista de pessoas.
let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => ctx.db.destroy());

describe('universo das pessoas', () => {
  it('vem da empresa, muda com ela e filtra a lista', async () => {
    const e = (await ctx.admin.post('/api/empresas').send({ nome: 'Alvo Z', universo: 'Conta-alvo' }).expect(201)).body;
    const p = (await ctx.admin.post('/api/pessoas').send({ nome: 'Pessoa Z', empresa_id: e.id }).expect(201)).body;
    expect(p.universo).toBe('Conta-alvo');
    await ctx.admin
      .put(`/api/empresas/${e.id}`)
      .send({ ...e, universo: 'Concorrente' })
      .expect(200);
    expect((await ctx.db('pessoas').where('id', p.id).first('universo')).universo).toBe('Concorrente');
    const lista = (await ctx.admin.get('/api/pessoas?universo=Concorrente&q=Pessoa Z').expect(200)).body;
    const linhas = (lista.data ?? lista.rows ?? lista) as { id: number }[];
    expect(linhas.map((l) => l.id)).toContain(p.id);
    const outra = (await ctx.admin.get('/api/pessoas?universo=Conta-alvo&q=Pessoa Z').expect(200)).body;
    expect(((outra.data ?? outra.rows ?? outra) as { id: number }[]).map((l) => l.id)).not.toContain(p.id);
    // trocar a pessoa de empresa leva o universo da nova
    const nos = (await ctx.admin.post('/api/empresas').send({ nome: 'Casa Z', universo: 'Nós' }).expect(201)).body;
    await ctx.admin.put(`/api/pessoas/${p.id}`).send({ nome: 'Pessoa Z', empresa_id: nos.id }).expect(200);
    expect((await ctx.db('pessoas').where('id', p.id).first('universo')).universo).toBe('Nós');
  });
});
