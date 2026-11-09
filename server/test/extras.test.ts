import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hooks } from '../src/hooks';
import { makeTestApp, type TestCtx } from './helpers';

// v0.10.0: linhas extras na listagem (hook listExtras)
let ctx: TestCtx;
const consultas: Record<string, unknown>[] = [];
beforeAll(async () => {
  ctx = await makeTestApp();
  hooks.clientes = {
    ...hooks.clientes,
    async listExtras(query) {
      consultas.push(query);
      if (query.ativo) return [];
      return [
        { id: 1, nome: 'Dados extras', ativo: true, __extra: { rotulo: 'Extra', link: '/outra/1' } },
        { id: 2, nome: 'Zeta extra', ativo: true, __extra: { rotulo: 'Extra', link: '/outra/2' } },
      ];
    },
  };
});
afterAll(async () => {
  delete hooks.clientes?.listExtras;
  await ctx.db.destroy();
});

describe('linhas extras na listagem', () => {
  it('intercala as extras na ordenação, pagina junto e informa quantas são', async () => {
    const r = await ctx.admin.get('/api/clientes?sort=nome&dir=asc&pageSize=10');
    expect(r.status).toBe(200);
    const nomes = r.body.rows.map((x: { nome: string }) => x.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    expect(nomes).toContain('Dados extras');
    expect(r.body.extras).toBe(2);
    const proprios = (await ctx.admin.get('/api/clientes?ativo=1&pageSize=50')).body.total;
    const todos = (await ctx.admin.get('/api/clientes?pageSize=50')).body;
    expect(todos.total).toBe(todos.rows.length);
    expect(todos.rows.filter((x: { __extra?: unknown }) => x.__extra)).toHaveLength(2);
    expect(proprios).toBeLessThan(todos.total);

    const p2 = (await ctx.admin.get('/api/clientes?sort=nome&dir=desc&pageSize=1&page=1')).body;
    expect(p2.rows[0]).toMatchObject({ nome: 'Zeta extra', __extra: { link: '/outra/2' } });
    expect(p2.total).toBe(todos.total);
  });

  it('o hook recebe os filtros; sem extras é a listagem normal', async () => {
    const r = (await ctx.admin.get('/api/clientes?ativo=1')).body;
    expect(consultas.at(-1)).toMatchObject({ ativo: '1' });
    expect(r.extras).toBeUndefined();
    expect(r.rows.some((x: { __extra?: unknown }) => x.__extra)).toBe(false);
  });

  it('lixeira e exportação não chamam o hook', async () => {
    const antes = consultas.length;
    await ctx.admin.get('/api/clientes/exportar');
    expect(consultas.length).toBe(antes);
    const csv = (await ctx.admin.get('/api/clientes/exportar')).text;
    expect(csv).not.toContain('Dados extras');
  });
});
