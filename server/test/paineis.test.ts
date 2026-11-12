import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupDemo } from '../src/demo/setup';
import { mesesEntre, registerDados } from '../src/services/paineis';
import { makeTestApp, type TestCtx } from './helpers';

// Fase 4: fontes de dados, relatório dinâmico (conjuntos) e preferências do usuário
let ctx: TestCtx;
let cat: { a: number; b: number };
beforeAll(async () => {
  ctx = await makeTestApp();
  await setupDemo(ctx.db);
  const ids = (await ctx.db('demo_categorias').where({ tipo: 'Despesa' }).orderBy('id').limit(2).select('id')).map(
    (r) => r.id as number,
  );
  cat = { a: ids[0], b: ids[1] };
  // movimentos num ano isolado, para conferir as contas
  const mov = (data: string, tipo: string, categoria_id: number, valor: number, forma: string) => ({
    descricao: `t ${data}`,
    data,
    tipo,
    categoria_id,
    valor,
    forma,
    pago: 1,
    criado_em: '2031-01-01 00:00:00',
  });
  const rec = (await ctx.db('demo_categorias').where({ tipo: 'Receita' }).first('id')).id as number;
  await ctx
    .db('demo_movimentos')
    .insert([
      mov('2031-01-10', 'Despesa', cat.a, -100, 'Pix'),
      mov('2031-01-20', 'Despesa', cat.b, -30, 'Cartão'),
      mov('2031-02-05', 'Despesa', cat.a, -50, 'Cartão'),
      mov('2031-03-15', 'Despesa', cat.b, -70, 'Pix'),
      mov('2031-02-01', 'Receita', rec, 1000, 'Pix'),
    ]);
  await ctx
    .db('demo_movimentos')
    .insert({ ...mov('2031-02-06', 'Despesa', cat.a, -999, 'Pix'), excluido_em: '2031-02-07' });
  registerDados('teste.restrito', {
    perm: ['backup', 'ver'],
    carregar: async ({ de, ate, params }) => ({
      tipo: 'valores',
      valores: { n: Number(params.n ?? 0) },
      notas: { n: `${de}..${ate}` },
    }),
  });
});
afterAll(() => ctx.db.destroy());

describe('meses do período', () => {
  it('lista os meses de um intervalo, virando o ano', () => {
    expect(mesesEntre('2030-11-15', '2031-02-01')).toEqual(['2030-11', '2030-12', '2031-01', '2031-02']);
  });
});

describe('fontes de dados', () => {
  it('passa período e parâmetros; respeita permissão; 404 para fonte desconhecida', async () => {
    const r = await ctx.admin.get('/api/dados/teste.restrito?de=2031-01-01&ate=2031-01-31&n=7');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ tipo: 'valores', valores: { n: 7 }, notas: { n: '2031-01-01..2031-01-31' } });
    expect((await ctx.leitura.get('/api/dados/teste.restrito')).status).toBe(403);
    expect((await ctx.admin.get('/api/dados/nao-existe')).status).toBe(404);
    expect((await ctx.admin.get('/api/dados/teste.restrito?de=2031-02-01&ate=2031-01-01')).status).toBe(422);
  });

  it('fonte de demonstração com partes (valores, série, ranking, tabela)', async () => {
    const { body } = await ctx.admin.get('/api/dados/demo.resumo?de=2031-01-01&ate=2031-03-31');
    expect(body.tipo).toBe('partes');
    expect(body.partes.totais.valores).toEqual({ receitas: 1000, despesas: 250, saldo: 750 });
    expect(body.partes.meses.rotulos).toHaveLength(6);
    expect(body.partes.categorias.itens.map((i: { valor: number }) => i.valor)).toEqual([150, 100]);
    expect(body.partes.ultimos.linhas[0].data).toBe('2031-03-15');
  });
});

describe('relatório dinâmico', () => {
  it('lista os conjuntos que o usuário pode ver', async () => {
    const r = await ctx.admin.get('/api/relatorios');
    const demo = r.body.find((c: { nome: string }) => c.nome === 'demo_movimentos');
    expect(demo.linhasPadrao).toBe('categoria');
    expect(demo.filtrosPadrao).toEqual({ tipo: ['Despesa'] });
  });

  it('linhas × meses com total, média, filtro padrão e lixeira de fora', async () => {
    const { body } = await ctx.admin.get('/api/relatorios/demo_movimentos?de=2031-01-01&ate=2031-03-31');
    expect(body.meses).toEqual(['2031-01', '2031-02', '2031-03']);
    expect(body.filtros).toEqual({ tipo: ['Despesa'] });
    const a = body.linhas.find((l: { id: string }) => l.id === String(cat.a));
    const b = body.linhas.find((l: { id: string }) => l.id === String(cat.b));
    expect(a.valores).toEqual([100, 50, 0]);
    expect(a.total).toBe(150);
    expect(a.media).toBe(50);
    expect(b.valores).toEqual([30, 0, 70]);
    expect(body.linhas[0].id).toBe(String(cat.a)); // maior total primeiro
    expect(body.total).toEqual({ valores: [130, 50, 70], total: 250, media: 83.33 });
    expect(a.link).toBe(`/demo_movimentos?data__de={de}&data__ate={ate}&categoria_id=${cat.a}`);
    expect(body.opcoes.tipo.map((o: { id: string }) => o.id)).toEqual(['Despesa', 'Receita']);
  });

  it('agrupa por outra dimensão e aceita filtros da URL', async () => {
    const q = '/api/relatorios/demo_movimentos?de=2031-01-01&ate=2031-03-31';
    const forma = (await ctx.admin.get(`${q}&linhas=forma`)).body;
    expect(Object.fromEntries(forma.linhas.map((l: { id: string; total: number }) => [l.id, l.total]))).toEqual({
      Pix: 170,
      Cartão: 80,
    });
    const so = (await ctx.admin.get(`${q}&linhas=tipo&f_tipo=Receita,Despesa&f_forma=Pix`)).body;
    expect(Object.fromEntries(so.linhas.map((l: { id: string; total: number }) => [l.id, l.total]))).toEqual({
      Receita: 1000,
      Despesa: 170,
    });
    expect((await ctx.admin.get(`${q}&linhas=xyz`)).status).toBe(422);
    expect((await ctx.admin.get('/api/relatorios/demo_movimentos?de=2020-01-01&ate=2031-01-01')).status).toBe(422);
    expect((await ctx.admin.get('/api/relatorios/nao-existe')).status).toBe(404);
  });
});

describe('preferências do usuário', () => {
  it('grava e lê por chave, separado por usuário; null apaga', async () => {
    expect((await ctx.admin.get('/api/preferencias/painel:inicio')).body).toEqual({ valor: null });
    const valor = { ocultos: ['a'], ordem: ['b', 'a'] };
    expect((await ctx.admin.put('/api/preferencias/painel:inicio').send({ valor })).body).toEqual({ valor });
    expect((await ctx.admin.get('/api/preferencias/painel:inicio')).body).toEqual({ valor });
    await ctx.admin.put('/api/preferencias/painel:inicio').send({ valor: { ocultos: [], ordem: [] } });
    expect((await ctx.admin.get('/api/preferencias/painel:inicio')).body.valor.ocultos).toEqual([]);
    expect((await ctx.leitura.get('/api/preferencias/painel:inicio')).body).toEqual({ valor: null });
    await ctx.admin.put('/api/preferencias/painel:inicio').send({ valor: null });
    expect((await ctx.admin.get('/api/preferencias/painel:inicio')).body).toEqual({ valor: null });
    expect((await ctx.admin.get('/api/preferencias/chave inválida!')).status).toBe(422);
  });
});
