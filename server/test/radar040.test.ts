import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DetalheEmpresa, VisaoConcorrentes, VisaoContas } from '@frame/shared';
import { scoreRadar } from '@frame/shared';
import { coletarPaginas, definirContextoApify } from '../src/app/coleta';
import { makeTestApp, type TestCtx } from './helpers';

// Radar 0.4.0: dados das páginas (seguidores, logos) e a visão geral por universo.
let ctx: TestCtx;
let entrada: { companies?: string[] } = {};
let entradaVagas: { companies?: string[]; postedWithin?: string } = {};
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function apifyFalso() {
  return async (u: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(u));
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
    if (url.host === 'media.licdn.com')
      return url.pathname.includes('quebrado')
        ? new Response('nao', { status: 404 })
        : new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
    if (url.pathname === '/v2/acts/harvestapi~linkedin-company/runs') {
      entrada = JSON.parse(String(init?.body));
      return json({ data: { id: 'runp', status: 'SUCCEEDED', defaultDatasetId: 'dsp', usageTotalUsd: 0.15 } });
    }
    if (url.pathname === '/v2/acts/piotrv1001~linkedin-company-jobs-scraper/runs') {
      entradaVagas = JSON.parse(String(init?.body));
      return json({ data: { id: 'runv', status: 'SUCCEEDED', defaultDatasetId: 'dsv', usageTotalUsd: 0.05 } });
    }
    if (url.pathname === '/v2/datasets/dsv/items')
      return json([
        {
          jobId: '111',
          jobUrl: 'https://www.linkedin.com/jobs/view/111',
          title: 'Engenheiro de Dados Sênior',
          location: 'Porto Alegre',
          postedDate: '2026-11-15',
          companySlug: 'taking',
        },
        {
          jobId: '112',
          title: 'Analista de Cloud',
          postedDate: '2026-11-10',
          companyUrl: 'https://www.linkedin.com/company/taking/',
        },
        { jobId: '999', title: 'Outra', companySlug: 'nao-monitorada' },
      ]);
    if (url.pathname === '/v2/datasets/dsp/items')
      return json([
        {
          universalName: 'taking',
          linkedinUrl: 'https://www.linkedin.com/company/taking/',
          followerCount: 57000,
          employeeCount: 900,
          logo: 'https://media.licdn.com/logo-taking.png',
          website: 'https://www.taking.com.br/?utm_source=li',
        },
        { universalName: 'grupofcamara', followerCount: 155000, logo: 'https://media.licdn.com/quebrado.png' },
        { universalName: 'desconhecida', followerCount: 1 },
      ]);
    return new Response('{}', { status: 404 });
  };
}

beforeAll(async () => {
  ctx = await makeTestApp();
});
afterEach(() => definirContextoApify(null));
afterAll(() => ctx.db.destroy());

describe('dados das páginas', () => {
  it('atualiza seguidores, guarda o histórico e baixa o logo como imagem', async () => {
    definirContextoApify(() => ({
      fetch: apifyFalso() as typeof fetch,
      env: { APIFY_TOKEN: 't' },
      esperar: async () => {},
    }));
    const r = await coletarPaginas(ctx.db);
    expect(r).toMatchObject({ atualizadas: 2, logos: 1, custo_usd: 0.15 });
    expect(entrada.companies?.every((c) => c.includes('/company/'))).toBe(true);
    const taking = await ctx.db('empresas').where('linkedin_url', 'https://www.linkedin.com/company/taking').first();
    expect(taking.seguidores).toBe(57000);
    expect(taking.site).toBe('taking.com.br'); // estava vazio: veio do LinkedIn, limpo
    expect(taking.logo_linkedin).toMatch(/^data:image\/png;base64,/);
    expect(
      await ctx.db('metricas_empresas').where('empresa_id', taking.id).first('seguidores', 'funcionarios'),
    ).toEqual({ seguidores: 57000, funcionarios: 900 });
    // logo quebrado não apaga nada; seguidores entram mesmo assim
    const fc = await ctx.db('empresas').where('linkedin_url', 'like', '%fcamara%').first('seguidores', 'logo_linkedin');
    expect(fc).toEqual({ seguidores: 155000, logo_linkedin: null });
    // de novo no mesmo dia: atualiza a métrica do dia, não duplica
    await coletarPaginas(ctx.db);
    expect(await ctx.db('metricas_empresas').where('empresa_id', taking.id).count({ n: '*' })).toEqual([{ n: 1 }]);
  });

  it('site já preenchido no Radar não é trocado pelo do LinkedIn', async () => {
    const url = 'https://www.linkedin.com/company/taking';
    await ctx.db('empresas').where('linkedin_url', url).update({ site: 'meu-site.com' });
    definirContextoApify(() => ({
      fetch: apifyFalso() as typeof fetch,
      env: { APIFY_TOKEN: 't' },
      esperar: async () => {},
    }));
    await coletarPaginas(ctx.db);
    expect((await ctx.db('empresas').where('linkedin_url', url).first('site')).site).toBe('meu-site.com');
  });

  it('pela rota, "paginas" também busca as vagas: viram publicações e contagem por empresa', async () => {
    definirContextoApify(() => ({
      fetch: apifyFalso() as typeof fetch,
      env: { APIFY_TOKEN: 't' },
      esperar: async () => {},
    }));
    const res = await ctx.admin.post('/api/radar/coleta/executar').send({ tipo: 'paginas' }).expect(202);
    const c = await ctx.db('coletas').where('id', res.body.coleta_id).first('situacao', 'ator');
    expect(c).toEqual({ situacao: 'Ok', ator: 'harvestapi/linkedin-company' });
    const v = await ctx
      .db('coletas')
      .where('ator', 'piotrv1001/linkedin-company-jobs-scraper')
      .orderBy('id', 'desc')
      .first('situacao', 'itens_novos');
    expect(v).toEqual({ situacao: 'Ok', itens_novos: 2 });
    expect(entradaVagas.postedWithin).toBe('r2592000');
    const taking = await ctx
      .db('empresas')
      .where('linkedin_url', 'https://www.linkedin.com/company/taking')
      .first('id');
    const m = await ctx.db('metricas_empresas').where('empresa_id', taking.id).orderBy('data', 'desc').first('vagas');
    expect(m.vagas).toBe(2);
    const vaga = await ctx.db('publicacoes').where('id_externo', 'vaga:111').first('tipo', 'titulo', 'assuntos');
    expect(vaga).toMatchObject({ tipo: 'Vaga', titulo: 'Engenheiro de Dados Sênior' });
    expect(vaga.assuntos).toContain('Dados e analytics');
  });
});

describe('visão geral', () => {
  it('concorrentes: comparativo com a linha "Nós" no topo e números do período', async () => {
    await ctx
      .db('empresas')
      .insert({ universo: 'Nós', nome: 'Lighthouse', nome_curto: 'Lighthouse', monitorar: true, seguidores: 20000 });
    const d = (await ctx.admin.get('/api/radar/visao?universo=Concorrente&dias=90').expect(200))
      .body as VisaoConcorrentes;
    expect(d.linhas[0]).toMatchObject({ nome: 'Lighthouse', nos: true });
    const conc = d.linhas.filter((l) => !l.nos);
    expect(conc.length).toBe(10);
    expect(d.kpis.movimentos).toBe(conc.reduce((s, l) => s + l.movimentos, 0));
    const taking = d.linhas.find((l) => l.nome === 'Grupo Taking')!;
    expect(taking.seguidores).toBe(57000);
    expect(taking.logo).toMatch(/^data:image/);
    expect(taking.vagas).toBe(2);
    // vagas não contam como posts
    const postsTaking = Number(
      (
        await ctx
          .db('publicacoes')
          .where({ empresa_id: taking.id, tipo: 'Post' })
          .whereNull('pessoa_id')
          .where('data_publicacao', '>=', d.periodo.de)
          .whereIn('post_proprio', [1, true])
          .count({ n: '*' })
      )[0].n,
    );
    expect(taking.posts).toBe(postsTaking);
    expect(taking.posts).toBeGreaterThan(0);
    expect(d.engaja.length).toBeGreaterThan(0);
    expect(d.engaja[0].media).toBeGreaterThanOrEqual(d.engaja.at(-1)!.media);
  });

  it('concorrentes: assuntos mais abordados, por concorrente e o que mais engaja', async () => {
    const d = (await ctx.admin.get('/api/radar/visao?universo=Concorrente&dias=90').expect(200))
      .body as VisaoConcorrentes;
    expect(d.assuntos.length).toBeGreaterThan(3);
    expect(d.assuntos[0].posts).toBeGreaterThanOrEqual(d.assuntos.at(-1)!.posts);
    const somaTaking = d.assuntos_por_empresa.empresas
      .find((e) => e.nome === 'Grupo Taking')!
      .valores.reduce((s, v) => s + v, 0);
    expect(somaTaking).toBeGreaterThanOrEqual(d.linhas.find((l) => l.nome === 'Grupo Taking')!.posts);
    expect(d.engaja.every((e) => e.posts >= 2 && e.assunto !== 'Outros')).toBe(true);
    // toda publicação ganhou assunto
    expect(await ctx.db('publicacoes').whereNull('assuntos').count({ n: '*' })).toEqual([{ n: 0 }]);
  });

  it('página da empresa: números, assuntos, melhores posts e pessoas', async () => {
    const parana = await ctx.db('empresas').where('pipedrive_org_id', 3556).first('id');
    const d = (await ctx.admin.get(`/api/radar/empresas/${parana.id}/detalhe?dias=90`).expect(200))
      .body as DetalheEmpresa;
    expect(d.empresa.nome).toBe('Paraná Banco');
    expect(d.kpis.sinais).toBeGreaterThan(0);
    expect(d.pessoas.some((p) => p.nome === 'Adriano Polidoro')).toBe(true);
    expect(d.melhores.map((p) => p.interacoes)).toEqual([...d.melhores.map((p) => p.interacoes)].sort((a, b) => b - a));
    expect(d.posts.some((p) => p.autor === 'Adriano Polidoro')).toBe(true);
    expect(d.vagas).toEqual([]);
    await ctx.admin.get('/api/radar/empresas/999999/detalhe').expect(404);
  });

  it('publicações ganham o universo da empresa e filtram por assunto (link dos gráficos)', async () => {
    await ctx.admin.get('/api/radar/visao?universo=Concorrente&dias=90').expect(200); // completa os derivados
    expect(await ctx.db('publicacoes').whereNotNull('empresa_id').whereNull('universo').count({ n: '*' })).toEqual([
      { n: 0 },
    ]);
    const res = await ctx.admin
      .get(
        '/api/publicacoes?tipo=Post&universo=Concorrente&post_proprio=1&assuntos__contem=Prêmios e certificações&pageSize=200',
      )
      .expect(200);
    const linhas = (res.body.rows ?? res.body.data) as { assuntos: string; universo: string }[];
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.every((l) => l.universo === 'Concorrente' && l.assuntos.includes('Prêmios e certificações'))).toBe(
      true,
    );
    // mudar o universo da empresa atualiza as publicações dela
    const taking = await ctx.db('empresas').where('linkedin_url', 'https://www.linkedin.com/company/taking').first();
    await ctx.admin
      .put(`/api/empresas/${taking.id}`)
      .send({ ...taking, universo: 'Conta-alvo', logo: null })
      .expect(200);
    expect(await ctx.db('publicacoes').where('empresa_id', taking.id).distinct('universo')).toEqual([
      { universo: 'Conta-alvo' },
    ]);
    await ctx.admin
      .put(`/api/empresas/${taking.id}`)
      .send({ ...taking, universo: 'Concorrente', logo: null })
      .expect(200);
  });

  it('contas-alvo: indicadores, ações e destaque ordenado pelo Score Radar', async () => {
    const d = (await ctx.admin.get('/api/radar/visao?universo=Conta-alvo&dias=90').expect(200)).body as VisaoContas;
    expect(d.kpis.contas).toBe(37);
    expect(d.kpis.alta).toBeGreaterThan(0);
    expect(d.agir.every((s) => s.severidade !== 'Baixa')).toBe(true);
    expect(d.agir[0].severidade).toBe('Alta');
    expect(d.destaque[0].nome).toBe('Paraná Banco');
    expect(d.destaque.map((x) => x.score)).toEqual([...d.destaque.map((x) => x.score)].sort((a, b) => b - a));
  });

  it('Score Radar pesa severidade e pessoas ativas, até 100', () => {
    expect(scoreRadar({ alta: 1, media: 1, baixa: 1, pessoasAtivas: 1 })).toBe(43);
    expect(scoreRadar({ alta: 9, media: 0, baixa: 0, pessoasAtivas: 0 })).toBe(100);
  });
});
