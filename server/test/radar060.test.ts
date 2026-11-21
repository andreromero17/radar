import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lerTags } from '@frame/shared';
import { inserir } from '../src/db/knex';
import { makeTestApp, type TestCtx } from './helpers';

// Radar 0.4.7: tags de empresas (como as etiquetas do Pipedrive) e o filtro da visão geral.
let ctx: TestCtx;
const ids: Record<string, number> = {};
beforeAll(async () => {
  ctx = await makeTestApp();
  // começa limpo: só as empresas deste teste no universo
  await ctx.db('empresas').update({ monitorar: false });
  for (const [nome, universo] of [
    ['Alfa', 'Concorrente'],
    ['Beta', 'Concorrente'],
    ['Gama', 'Concorrente'],
    ['Nossa', 'Nós'],
    ['Conta 1', 'Conta-alvo'],
    ['Conta 2', 'Conta-alvo'],
  ])
    ids[nome] = await inserir(ctx.db('empresas'), { nome, universo, monitorar: true });
});
afterAll(() => ctx.db.destroy());

const tag = async (nome: string, cor = '#2b8a5a') =>
  (await ctx.admin.post('/api/radar/tags').send({ nome, cor }).expect(201)).body as { id: number; nome: string };

describe('tags', () => {
  it('cria pelo seletor; mesmo nome (sem diferenciar maiúsculas) devolve a existente; cor inválida recusa', async () => {
    const a = await tag('Fintech');
    const b = await tag('  fintech ');
    expect(b.id).toBe(a.id);
    await ctx.admin.post('/api/radar/tags').send({ nome: 'X', cor: 'verde' }).expect(422);
    // pelo cadastro genérico, nome repetido = 409
    const r = await ctx.admin.post('/api/tags').send({ nome: 'FINTECH', cor: '#000000' });
    expect(r.status).toBe(409);
  });

  it('define as tags da empresa (várias), valida os ids e lista com a contagem', async () => {
    const fintech = await tag('Fintech');
    const sp = await tag('São Paulo', '#1d4ed8');
    await ctx.admin
      .put(`/api/radar/empresas/${ids.Alfa}/tags`)
      .send({ ids: [sp.id, fintech.id, sp.id] })
      .expect(200);
    await ctx.admin
      .put(`/api/radar/empresas/${ids.Beta}/tags`)
      .send({ ids: [sp.id] })
      .expect(200);
    await ctx.admin
      .put(`/api/radar/empresas/${ids['Conta 1']}/tags`)
      .send({ ids: [fintech.id] })
      .expect(200);
    expect(lerTags((await ctx.db('empresas').where('id', ids.Alfa).first('tags')).tags)).toEqual(
      [fintech.id, sp.id].sort((x, y) => x - y),
    );
    await ctx.admin
      .put(`/api/radar/empresas/${ids.Alfa}/tags`)
      .send({ ids: [99999] })
      .expect(422);
    await ctx.admin.put('/api/radar/empresas/99999/tags').send({ ids: [] }).expect(404);
    const lista = (await ctx.admin.get('/api/radar/tags').expect(200)).body as { nome: string; empresas: number }[];
    expect(lista.find((t) => t.nome === 'São Paulo')?.empresas).toBe(2);
    expect(lista.find((t) => t.nome === 'Fintech')?.empresas).toBe(2);
    const d = await ctx.admin.get(`/api/radar/empresas/${ids.Alfa}/detalhe`).expect(200);
    expect(d.body.empresa.tags).toHaveLength(2);
  });

  it('visão geral filtra por "qualquer uma das tags"; "Nós" fica sempre', async () => {
    const lista = (await ctx.admin.get('/api/radar/tags')).body as { id: number; nome: string }[];
    const fintech = lista.find((t) => t.nome === 'Fintech')!.id;
    const sp = lista.find((t) => t.nome === 'São Paulo')!.id;
    const nomes = async (q: string) =>
      (
        (await ctx.admin.get(`/api/radar/visao?universo=Concorrente&dias=30${q}`).expect(200)).body.linhas as {
          nome: string;
          tags: number[];
        }[]
      )
        .map((l) => l.nome)
        .sort();
    expect(await nomes('')).toEqual(['Alfa', 'Beta', 'Gama', 'Nossa']);
    expect(await nomes(`&tags=${fintech}`)).toEqual(['Alfa', 'Nossa']);
    expect(await nomes(`&tags=${fintech},${sp}`)).toEqual(['Alfa', 'Beta', 'Nossa']);
    expect(await nomes('&tags=lixo,')).toEqual(['Alfa', 'Beta', 'Gama', 'Nossa']);
    const contas = await ctx.admin.get(`/api/radar/visao?universo=Conta-alvo&dias=30&tags=${fintech}`).expect(200);
    expect(contas.body.kpis.contas).toBe(1);
  });

  it('excluir a tag tira das empresas', async () => {
    const lista = (await ctx.admin.get('/api/radar/tags')).body as { id: number; nome: string }[];
    const sp = lista.find((t) => t.nome === 'São Paulo')!.id;
    await ctx.admin.delete(`/api/tags/${sp}`).expect(204);
    expect(lerTags((await ctx.db('empresas').where('id', ids.Beta).first('tags')).tags)).toEqual([]);
    expect(lerTags((await ctx.db('empresas').where('id', ids.Alfa).first('tags')).tags)).not.toContain(sp);
  });

  it('leitor não cria tag nem muda as da empresa', async () => {
    await ctx.leitura.post('/api/radar/tags').send({ nome: 'Nova', cor: '#000000' }).expect(403);
    await ctx.leitura.put(`/api/radar/empresas/${ids.Alfa}/tags`).send({ ids: [] }).expect(403);
  });
});

describe('lerTags', () => {
  it('aceita lista, JSON e lixo', () => {
    expect(lerTags([1, '2', 'x', -1, 2.5])).toEqual([1, 2]);
    expect(lerTags('[3,4]')).toEqual([3, 4]);
    expect(lerTags('não é json')).toEqual([]);
    expect(lerTags(null)).toEqual([]);
  });
});
