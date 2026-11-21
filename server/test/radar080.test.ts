import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ASSUNTO_CARREIRA } from '@frame/shared';
import { inserir } from '../src/db/knex';
import { makeTestApp, type TestCtx } from './helpers';

// Radar 0.4.10: troca de emprego, pessoa excluída e o filtro dos "Nós".
let ctx: TestCtx;
const hoje = new Date().toISOString().slice(0, 10);
const ids: Record<string, number> = {};
const TEXTO = 'Novo capítulo 🚀 Hoje começo na Acme, com clientes de ERP e plataformas. Obrigada!';
const pub = (extra: Record<string, unknown>) =>
  inserir(ctx.db('publicacoes'), {
    tipo: 'Post',
    data_publicacao: hoje,
    post_proprio: true,
    titulo: 'Novo capítulo 🚀',
    texto: TEXTO,
    curtidas: 5,
    ...extra,
  });

beforeAll(async () => {
  ctx = await makeTestApp();
  await ctx.db('empresas').update({ monitorar: false });
  for (const [nome, universo] of [
    ['Conta A', 'Conta-alvo'],
    ['Conc B', 'Concorrente'],
    ['Lighthouse', 'Nós'],
    ['Sellmate', 'Nós'],
  ])
    ids[nome] = await inserir(ctx.db('empresas'), { nome, universo, monitorar: true });
  ids.luana = await inserir(ctx.db('pessoas'), { nome: 'Luana', empresa_id: ids['Conta A'], monitorar: true });
  ids.rui = await inserir(ctx.db('pessoas'), { nome: 'Rui', empresa_id: ids['Conc B'], monitorar: true });
});
afterAll(() => ctx.db.destroy());

describe('troca de emprego', () => {
  it('post da pessoa vira Carreira, alerta e sinal (conta-alvo: Alta; concorrente: Média), sem repetir', async () => {
    const p1 = await pub({ empresa_id: ids['Conta A'], pessoa_id: ids.luana, id_externo: 'l1', fonte_tipo: 'pessoa' });
    const p2 = await pub({ empresa_id: ids['Conc B'], pessoa_id: ids.rui, id_externo: 'r1', fonte_tipo: 'pessoa' });
    const p3 = await pub({ empresa_id: ids['Conc B'], id_externo: 'e1', fonte_tipo: 'empresa' }); // da página: não
    const velho = await pub({
      empresa_id: ids['Conta A'],
      pessoa_id: ids.luana,
      id_externo: 'l0',
      fonte_tipo: 'pessoa',
      data_publicacao: '2025-01-10',
    });
    for (let i = 0; i < 2; i++) await ctx.admin.get('/api/radar/visao?universo=Concorrente').expect(200);
    const assuntos = async (id: number) => (await ctx.db('publicacoes').where('id', id).first('assuntos')).assuntos;
    expect(await assuntos(p1)).toBe(ASSUNTO_CARREIRA);
    expect(await assuntos(p2)).toBe(ASSUNTO_CARREIRA);
    expect(await assuntos(p3)).not.toContain(ASSUNTO_CARREIRA);
    expect(await assuntos(velho)).toBe(ASSUNTO_CARREIRA);
    const sinais = await ctx.db('sinais').whereIn('publicacao_id', [p1, p2, p3, velho]).select();
    expect(sinais.map((s) => `${s.publicacao_id}|${s.severidade}|${s.tipo}`).sort()).toEqual(
      [`${p1}|Alta|Saída de contato-chave`, `${p2}|Média|Saída de pessoa-chave`].sort(),
    );
    const alertas = await ctx.db('alertas_cadastro').where('chave', 'like', 'carreira:%').select('pessoa_id');
    expect(alertas.map((a) => a.pessoa_id).sort()).toEqual([ids.luana, ids.rui].sort());
  });
});

describe('pessoa excluída', () => {
  it('na lixeira: posts fora dos números da empresa; de vez: os posts somem (não viram posts da página)', async () => {
    const det = async () =>
      (await ctx.admin.get(`/api/radar/empresas/${ids['Conc B']}/detalhe?dias=30`).expect(200)).body;
    expect((await det()).assuntos_pessoas.length).toBe(1);
    await ctx.admin.delete(`/api/pessoas/${ids.rui}`).expect(200);
    const naLixeira = await det();
    expect(naLixeira.assuntos_pessoas).toEqual([]);
    expect(naLixeira.posts.some((p: { titulo: string; pessoa_id: number | null }) => p.pessoa_id === ids.rui)).toBe(
      false,
    );
    await ctx.admin.delete(`/api/pessoas/${ids.rui}?definitivo=1`).expect(204);
    const depois = await det();
    expect(depois.kpis.posts).toBe(1); // só o post da página (e1)
    expect(await ctx.db('publicacoes').where('id_externo', 'r1').first()).toBeUndefined();
    expect(await ctx.db('sinais').where('pessoa_id', ids.rui).first()).toBeUndefined();
  });
});

describe('"Nós" no filtro', () => {
  it('cada "Nós" liga/desliga e não segue as tags', async () => {
    const nomes = async (q = '') =>
      ((await ctx.admin.get(`/api/radar/visao?universo=Concorrente${q}`).expect(200)).body.linhas as { nome: string }[])
        .map((l) => l.nome)
        .sort();
    const r = (await ctx.admin.get('/api/radar/visao?universo=Concorrente').expect(200)).body;
    expect(r.nos.map((n: { nome: string }) => n.nome)).toEqual(['Lighthouse', 'Sellmate']);
    expect(await nomes()).toEqual(['Conc B', 'Lighthouse', 'Sellmate']);
    expect(await nomes(`&nos=${ids.Sellmate}`)).toEqual(['Conc B', 'Sellmate']);
    expect(await nomes('&nos=nenhum')).toEqual(['Conc B']);
    const tag = (await ctx.admin.post('/api/radar/tags').send({ nome: 'X', cor: '#000000' }).expect(201)).body;
    await ctx.admin
      .put(`/api/radar/empresas/${ids.Lighthouse}/tags`)
      .send({ ids: [tag.id] })
      .expect(200);
    // com a tag e o Lighthouse desligado: não aparece mesmo tendo a tag
    expect(await nomes(`&tags=${tag.id}&nos=${ids.Sellmate}`)).toEqual(['Sellmate']);
    expect(await nomes(`&tags=${tag.id}`)).toEqual(['Lighthouse', 'Sellmate']);
  });
});
