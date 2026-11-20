import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { VisaoConcorrentes, VisaoContas } from '@frame/shared';
import { scoreRadar } from '@frame/shared';
import { coletarPaginas, definirContextoApify } from '../src/app/coleta';
import { makeTestApp, type TestCtx } from './helpers';

// Radar 0.4.0: dados das páginas (seguidores, logos) e a visão geral por universo.
let ctx: TestCtx;
let entrada: { companies?: string[] } = {};
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
    if (url.pathname === '/v2/datasets/dsp/items')
      return json([
        {
          universalName: 'taking',
          linkedinUrl: 'https://www.linkedin.com/company/taking/',
          followerCount: 57000,
          employeeCount: 900,
          logo: 'https://media.licdn.com/logo-taking.png',
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

  it('pela rota, com tipo "paginas"', async () => {
    definirContextoApify(() => ({
      fetch: apifyFalso() as typeof fetch,
      env: { APIFY_TOKEN: 't' },
      esperar: async () => {},
    }));
    const res = await ctx.admin.post('/api/radar/coleta/executar').send({ tipo: 'paginas' }).expect(202);
    const c = await ctx.db('coletas').where('id', res.body.coleta_id).first('situacao', 'ator');
    expect(c).toEqual({ situacao: 'Ok', ator: 'harvestapi/linkedin-company' });
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
    expect(taking.posts).toBeGreaterThan(0);
    expect(d.engaja.length).toBeGreaterThan(0);
    expect(d.engaja[0].media).toBeGreaterThanOrEqual(d.engaja.at(-1)!.media);
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
