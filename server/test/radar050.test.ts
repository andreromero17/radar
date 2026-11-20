import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { definirContextoApollo } from '../src/app/apollo';
import { colaboradoresNoPeriodo } from '../src/app/services/visao';
import { inserir } from '../src/db/knex';
import { makeTestApp, type TestCtx } from './helpers';

// Radar 0.4.6: colaboradores do LinkedIn e Apollo (fetch simulado — nunca a rede nos testes).
let chamadas: { metodo: string; caminho: string; params: URLSearchParams; corpo: unknown }[] = [];
let semCreditos = false;

const pessoasBusca = [
  { id: 'ap1', first_name: 'Carla', last_name_obfuscated: 'S***a', title: 'CTO' },
  { id: 'ap2', first_name: 'Rui', last_name_obfuscated: 'M***s', title: 'Diretor Comercial' },
  { id: 'ap3', first_name: 'Ana', last_name_obfuscated: 'L***e', title: 'Gerente de Marketing' },
  { id: 'ap4', first_name: 'Beto', last_name_obfuscated: 'C***o', title: 'Gerente Financeiro' }, // fora das áreas
  { id: 'ap5', first_name: 'Duda', last_name_obfuscated: 'P***a', title: 'Head of People' },
];

function fetchFalso(chave = 'chave-mestra') {
  return async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada));
    const caminho = url.pathname.replace('/api/v1', '');
    chamadas.push({
      metodo: init?.method ?? 'GET',
      caminho,
      params: url.searchParams,
      corpo: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (new Headers(init?.headers).get('x-api-key') !== chave) return new Response('{}', { status: 401 });
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
    if (caminho === '/organizations/enrich') {
      if (semCreditos) return new Response('{"error":"insufficient credits"}', { status: 422 });
      if (url.searchParams.get('domain') !== 'concorrente-x.com.br') return json({ organization: null });
      return json({
        organization: {
          id: 'org-x',
          estimated_num_employees: 850,
          industry: 'information technology & services',
          annual_revenue_printed: '120M',
          founded_year: 2008,
          city: 'Porto Alegre',
          state: 'Rio Grande do Sul',
          country: 'Brazil',
          technology_names: ['AWS', 'Salesforce'],
          short_description: 'Software house.',
          linkedin_url: 'http://www.linkedin.com/company/concorrente-x',
        },
      });
    }
    if (caminho === '/mixed_people/api_search') return json({ people: pessoasBusca, total_entries: 5 });
    if (caminho === '/people/bulk_match') {
      const ids = (JSON.parse(String(init!.body)) as { details: { id: string }[] }).details.map((d) => d.id);
      const nomes: Record<string, { name: string; linkedin_url: string | null }> = {
        ap1: { name: 'Carla Souza', linkedin_url: 'https://www.linkedin.com/in/carla-souza' },
        ap2: { name: 'Rui Martins', linkedin_url: 'http://www.linkedin.com/in/ja-existe' },
        ap3: { name: 'Ana Leite', linkedin_url: null },
      };
      return json({ matches: ids.map((id) => ({ id, title: 'Título do Apollo', ...nomes[id] })) });
    }
    return new Response('{}', { status: 404 });
  };
}
const usar = (env: Record<string, string>) =>
  definirContextoApollo(() => ({ fetch: fetchFalso() as typeof fetch, env }));

let ctx: TestCtx;
let empresaId: number;
beforeAll(async () => {
  ctx = await makeTestApp();
  empresaId = await inserir(ctx.db('empresas'), {
    universo: 'Concorrente',
    nome: 'Concorrente X',
    site: 'https://www.concorrente-x.com.br/sobre',
    monitorar: true,
  });
});
afterEach(() => {
  definirContextoApollo(null);
  chamadas = [];
  semCreditos = false;
});
afterAll(() => ctx.db.destroy());

describe('colaboradores do LinkedIn', () => {
  it('última medição e variação desde o início do período (ou a primeira medição)', () => {
    const m = [
      { data: '2026-10-01', funcionarios: 100 },
      { data: '2026-10-20', funcionarios: 104 },
      { data: '2026-11-15', funcionarios: 110 },
      { data: '2026-11-18', funcionarios: null },
    ];
    expect(colaboradoresNoPeriodo(m, '2026-10-21')).toEqual({ atual: 110, variacao: 6, desde: '2026-10-20' });
    expect(colaboradoresNoPeriodo(m, '2026-09-01')).toEqual({ atual: 110, variacao: 10, desde: '2026-10-01' });
    expect(colaboradoresNoPeriodo([{ data: '2026-11-15', funcionarios: 7 }], '2026-10-01')).toEqual({
      atual: 7,
      variacao: null,
      desde: null,
    });
    expect(colaboradoresNoPeriodo([], '2026-10-01').atual).toBeNull();
  });

  it('aparece no comparativo dos concorrentes e na página da empresa', async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const antes = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
    await ctx.db('metricas_empresas').insert([
      { empresa_id: empresaId, data: antes, funcionarios: 800 },
      { empresa_id: empresaId, data: hoje, funcionarios: 812, seguidores: 5000 },
    ]);
    const v = await ctx.admin.get('/api/radar/visao?universo=Concorrente&dias=90').expect(200);
    const linha = v.body.linhas.find((l: { id: number }) => l.id === empresaId);
    expect(linha).toMatchObject({ colaboradores: 812, colaboradores_var: 12 });
    const d = await ctx.admin.get(`/api/radar/empresas/${empresaId}/detalhe?dias=90`).expect(200);
    expect(d.body.kpis).toMatchObject({ colaboradores: 812, colaboradores_var: 12, colaboradores_desde: antes });
  });
});

describe('Apollo', () => {
  it('sem chave: status avisa e as ações recusam', async () => {
    usar({});
    expect((await ctx.admin.get('/api/radar/apollo/status').expect(200)).body.configurado).toBe(false);
    const r = await ctx.admin.post(`/api/radar/apollo/empresas/${empresaId}/enriquecer`).send({}).expect(400);
    expect(r.body.error).toContain('APOLLO_API_KEY');
  });

  it('chave errada vira 502 com mensagem clara (e a chave não vaza)', async () => {
    usar({ APOLLO_API_KEY: 'outra' });
    const r = await ctx.admin.post(`/api/radar/apollo/empresas/${empresaId}/enriquecer`).send({}).expect(502);
    expect(r.body.error).toContain('recusou a chave');
    expect(JSON.stringify(r.body)).not.toContain('outra');
  });

  it('enriquecer: grava os campos do Apollo, completa o LinkedIn vazio e mostra na página da empresa', async () => {
    usar({ APOLLO_API_KEY: 'chave-mestra' });
    await ctx.admin.post(`/api/radar/apollo/empresas/${empresaId}/enriquecer`).send({}).expect(200);
    expect(chamadas[0].params.get('domain')).toBe('concorrente-x.com.br');
    const e = await ctx.db('empresas').where('id', empresaId).first();
    expect(e).toMatchObject({
      apollo_org_id: 'org-x',
      apollo_funcionarios: 850,
      apollo_faturamento: '120M',
      apollo_local: 'Porto Alegre, Rio Grande do Sul, Brazil',
      apollo_tecnologias: 'AWS, Salesforce',
      linkedin_url: 'https://www.linkedin.com/company/concorrente-x',
    });
    const d = await ctx.admin.get(`/api/radar/empresas/${empresaId}/detalhe`).expect(200);
    expect(d.body.empresa.apollo).toMatchObject({ funcionarios: 850, setor: 'information technology & services' });
    // já enriquecida: o lote não a conta de novo (créditos)
    const s = await ctx.admin.get('/api/radar/apollo/status?universo=Concorrente').expect(200);
    expect(s.body.a_enriquecer).toBe(0);
  });

  it('sem site ou sem créditos: erro claro', async () => {
    usar({ APOLLO_API_KEY: 'chave-mestra' });
    const semSite = await inserir(ctx.db('empresas'), { universo: 'Concorrente', nome: 'Sem Site', monitorar: true });
    const r = await ctx.admin.post(`/api/radar/apollo/empresas/${semSite}/enriquecer`).send({}).expect(502);
    expect(r.body.error).toContain('sem site');
    semCreditos = true;
    const c = await ctx.admin.post(`/api/radar/apollo/empresas/${empresaId}/enriquecer`).send({}).expect(502);
    expect(c.body.error).toContain('créditos');
    await ctx.db('empresas').where('id', semSite).update({ monitorar: false });
  });

  it('buscar pessoas: só as áreas relevantes viram sugestão, sem duplicar na segunda busca', async () => {
    usar({ APOLLO_API_KEY: 'chave-mestra' });
    const r = await ctx.admin.post(`/api/radar/apollo/empresas/${empresaId}/pessoas`).send({}).expect(200);
    expect(r.body).toMatchObject({ encontradas: 5, novas: 4, fora_do_perfil: 1 });
    const busca = chamadas.find((c) => c.caminho === '/mixed_people/api_search')!;
    expect(busca.params.getAll('q_organization_domains_list[]')).toEqual(['concorrente-x.com.br']);
    expect(busca.params.getAll('person_seniorities[]')).toContain('c_suite');
    const lista = (await ctx.admin.get(`/api/radar/apollo/sugestoes?empresa_id=${empresaId}`).expect(200)).body;
    expect(lista.map((s: { nome: string; area: string }) => `${s.nome}|${s.area}`).sort()).toEqual([
      'Ana L***e|Marketing',
      'Carla S***a|TI',
      'Duda P***a|RH',
      'Rui M***s|Comercial',
    ]);
    const deNovo = (await ctx.admin.post(`/api/radar/apollo/empresas/${empresaId}/pessoas`).send({}).expect(200)).body;
    expect(deNovo).toMatchObject({ novas: 0, ja_sugeridas: 4 });
  });

  it('aprovar: enriquece só as escolhidas (sem e-mail/telefone) e cadastra como pessoas; descartar não volta', async () => {
    usar({ APOLLO_API_KEY: 'chave-mestra' });
    await inserir(ctx.db('pessoas'), {
      nome: 'Rui (já no Radar)',
      linkedin_url: 'https://www.linkedin.com/in/ja-existe',
      monitorar: true,
    });
    const sug = (await ctx.db('sugestoes_pessoas').where('empresa_id', empresaId).select('id', 'apollo_id')) as {
      id: number;
      apollo_id: string;
    }[];
    const id = (a: string) => sug.find((s) => s.apollo_id === a)!.id;
    const r = await ctx.admin
      .post('/api/radar/apollo/sugestoes/aprovar')
      .send({ ids: [id('ap1'), id('ap2'), id('ap3')] })
      .expect(200);
    expect(r.body).toEqual({ cadastradas: 2, ja_existiam: 1, sem_linkedin: 1 });
    const pedido = chamadas.find((c) => c.caminho === '/people/bulk_match')!.corpo as Record<string, unknown>;
    expect(pedido).toMatchObject({ reveal_personal_emails: false, reveal_phone_number: false });
    const carla = await ctx.db('pessoas').where('linkedin_url', 'https://www.linkedin.com/in/carla-souza').first();
    expect(carla).toMatchObject({ nome: 'Carla Souza', empresa_id: empresaId, cargo: 'Título do Apollo' });
    expect(!!carla.monitorar).toBe(true);
    expect((await ctx.db('pessoas').where('nome', 'Rui Martins').first()) ?? null).toBeNull();

    await ctx.admin
      .post('/api/radar/apollo/sugestoes/descartar')
      .send({ ids: [id('ap5')] })
      .expect(200);
    expect((await ctx.admin.get(`/api/radar/apollo/sugestoes?empresa_id=${empresaId}`)).body).toEqual([]);
    usar({ APOLLO_API_KEY: 'chave-mestra' });
    const b = (await ctx.admin.post(`/api/radar/apollo/empresas/${empresaId}/pessoas`).send({}).expect(200)).body;
    expect(b.novas).toBe(0);
  });

  it('leitor não busca, não aprova e não enriquece', async () => {
    usar({ APOLLO_API_KEY: 'chave-mestra' });
    await ctx.leitura.post(`/api/radar/apollo/empresas/${empresaId}/pessoas`).send({}).expect(403);
    await ctx.leitura.post(`/api/radar/apollo/empresas/${empresaId}/enriquecer`).send({}).expect(403);
    await ctx.leitura
      .post('/api/radar/apollo/sugestoes/aprovar')
      .send({ ids: [1] })
      .expect(403);
    expect(chamadas).toHaveLength(0);
  });
});
