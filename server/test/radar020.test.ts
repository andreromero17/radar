import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { definirContextoPipedrive, nivelDoCargo } from '../src/app/pipedrive';
import { saveAppSettings } from '../src/services/settings';
import { makeTestApp, type TestCtx } from './helpers';

// Radar 0.2.0: sincronização com o Pipedrive (fetch simulado — nunca a rede nos testes).
const LI_PESSOA = '6860b2467247c9a2efc1345a5b524d195f0fe657';
const SEGMENTO = '7097bbfe9f6847ce579b49f95b9be9bdb2bee83b';
const TIER = '0d6fc242ac7fa710fee91aab4cc117daed55f813';

const orgsPorFiltro: Record<string, unknown[]> = {
  '100': [
    {
      id: 3556,
      name: 'PARANA BANCO S/A',
      owner_id: 28688365,
      website: 'paranabanco.com.br',
      linkedin: 'linkedin.com/company/paranabanco',
      address: { value: 'PR', admin_area_level_1: 'PR' },
      custom_fields: { [SEGMENTO]: 'Serviços financeiros', [TIER]: '93' },
    },
    {
      id: 9001,
      name: 'EMPRESA NOVA S.A.',
      owner_id: 26670382,
      website: null,
      linkedin: 'https://br.linkedin.com/company/Empresa-Nova/',
      address: { value: 'Porto Alegre', admin_area_level_1: 'RS' },
      custom_fields: { [SEGMENTO]: 'Varejo', [TIER]: '94' },
    },
  ],
  '200': [
    {
      id: 77,
      name: 'Accenture Brasil',
      owner_id: 21484916,
      linkedin: 'linkedin.com/company/accenture-song',
      address: { value: 'São Paulo' },
      custom_fields: {},
    },
  ],
};
const pessoasPorOrg: Record<string, unknown[]> = {
  '3556': [
    {
      id: 86,
      name: 'Adriano Polidoro',
      org_id: 3556,
      job_title: 'CIO - Superintendente de TI',
      custom_fields: { [LI_PESSOA]: 'https://www.linkedin.com/in/polidoro/' },
    },
    { id: 4249, name: 'Joao Antunes', org_id: 3556, job_title: null, custom_fields: { [LI_PESSOA]: null } },
    {
      id: 5000,
      name: 'Polidoro (duplicado)',
      org_id: 3556,
      job_title: 'CIO',
      custom_fields: { [LI_PESSOA]: 'linkedin.com/in/Polidoro' },
    },
  ],
  '9001': [
    {
      id: 7000,
      name: 'Maria Gestora',
      org_id: 9001,
      job_title: 'Gerente de TI',
      custom_fields: { [LI_PESSOA]: 'linkedin.com/in/maria-gestora' },
    },
  ],
  '77': [],
};

let chamadas: string[] = [];
let gravacoes: { caminho: string; corpo: Record<string, unknown> }[] = [];
function fetchFalso(token = 'tok-secreto') {
  return async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada));
    chamadas.push(url.pathname + url.search);
    const headers = new Headers(init?.headers);
    if (headers.get('x-api-token') !== token) return new Response('{}', { status: 401 });
    if (init?.method === 'PUT') {
      gravacoes.push({ caminho: url.pathname, corpo: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    }
    const json = (data: unknown, extra: Record<string, unknown> = {}) =>
      new Response(JSON.stringify({ success: true, data, ...extra }), { status: 200 });
    switch (url.pathname) {
      case '/v1/organizationFields':
        return json([
          { key: 'linkedin', name: 'Perfil do LinkedIn' },
          { key: SEGMENTO, name: 'Segmento' },
          {
            key: TIER,
            name: 'Tier',
            options: [
              { id: 92, label: 'A - holdings' },
              { id: 93, label: 'B - boa aderência' },
              { id: 94, label: 'C - Alta aderência' },
              { id: 96, label: 'Descartar' },
            ],
          },
        ]);
      case '/v1/personFields':
        return json([{ key: LI_PESSOA, name: 'LinkedIn' }]);
      case '/v1/users':
        return json([
          { id: 28688365, name: 'Sabrina Barros' },
          { id: 26670382, name: 'Patricia Martins' },
          { id: 21484916, name: 'André Romero' },
        ]);
      case '/api/v2/organizations':
        return json(orgsPorFiltro[url.searchParams.get('filter_id') ?? ''] ?? [], {
          additional_data: { next_cursor: null },
        });
      case '/api/v2/persons':
        return json(pessoasPorOrg[url.searchParams.get('org_id') ?? ''] ?? [], {
          additional_data: { next_cursor: null },
        });
    }
    return new Response('{}', { status: 404 });
  };
}

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});
afterEach(() => definirContextoPipedrive(null));
afterAll(() => ctx.db.destroy());

const usar = (env: Record<string, string>) =>
  definirContextoPipedrive(() => ({ fetch: fetchFalso() as typeof fetch, env }));

describe('sincronização com o Pipedrive', () => {
  it('sem token: status avisa e a rota recusa', async () => {
    usar({});
    expect((await ctx.admin.get('/api/radar/pipedrive/status').expect(200)).body.configurado).toBe(false);
    const res = await ctx.admin.post('/api/radar/pipedrive/sincronizar').send({}).expect(400);
    expect(res.body.error).toContain('PIPEDRIVE_API_TOKEN');
  });

  it('sem filtro configurado: não chama o Pipedrive e avisa', async () => {
    usar({ PIPEDRIVE_API_TOKEN: 'tok-secreto' });
    chamadas = [];
    const res = await ctx.admin.post('/api/radar/pipedrive/sincronizar').send({}).expect(200);
    expect(res.body.resultado.avisos[0]).toContain('filtro');
    expect(chamadas).toEqual([]);
  });

  it('traz contas-alvo, concorrentes e pessoas sem duplicar o que veio do piloto', async () => {
    usar({ PIPEDRIVE_API_TOKEN: 'tok-secreto', PIPEDRIVE_DOMINIO: 'lighthouse' });
    await saveAppSettings(ctx.db, {
      pipedrive_filtro_contas: 100,
      pipedrive_filtro_concorrentes: 200,
      pipedrive_sincronizar_diario: true,
    });
    const antes = Number((await ctx.db('empresas').count({ n: '*' }))[0].n);
    const res = await ctx.admin.post('/api/radar/pipedrive/sincronizar').send({}).expect(200);
    const r = res.body.resultado;
    expect(r.empresas).toEqual({ novas: 2, atualizadas: 1, ignoradas: 0 });
    expect(Number((await ctx.db('empresas').count({ n: '*' }))[0].n)).toBe(antes + 2);

    const parana = await ctx.db('empresas').where('pipedrive_org_id', 3556).first();
    expect(parana).toMatchObject({
      nome_curto: 'Paraná Banco',
      tier: 'B',
      uf: 'PR',
      dono: 'Sabrina Barros',
      segmento: 'Serviços financeiros',
    });
    expect(parana.linkedin_url).toBe('https://www.linkedin.com/company/paranabanco');
    const nova = await ctx.db('empresas').where('pipedrive_org_id', 9001).first();
    expect(nova).toMatchObject({
      universo: 'Conta-alvo',
      tier: 'C',
      uf: 'RS',
      dono: 'Patricia Martins',
      linkedin_url: 'https://www.linkedin.com/company/empresa-nova',
    });
    expect((await ctx.db('empresas').where('pipedrive_org_id', 77).first()).universo).toBe('Concorrente');

    // Polidoro já existia (piloto): ganha o id do Pipedrive, não duplica
    const polidoro = await ctx.db('pessoas').where('linkedin_url', 'https://www.linkedin.com/in/polidoro');
    expect(polidoro).toHaveLength(1);
    expect(polidoro[0]).toMatchObject({ pipedrive_person_id: 86, cargo: 'CIO - Superintendente de TI' });
    expect(await ctx.db('pessoas').where('pipedrive_person_id', 7000).first('nivel', 'empresa_id')).toEqual({
      nivel: 'Gerência',
      empresa_id: nova.id,
    });
    expect(r.pessoas).toMatchObject({ novas: 1, atualizadas: 1, sem_linkedin: 1 });

    // dois contatos com o mesmo perfil → um alerta
    expect(r.alertas).toBe(1);
    expect(
      await ctx
        .db('alertas_cadastro')
        .where('chave', 'pipedrive:duplicado:https://www.linkedin.com/in/polidoro')
        .first('tipo'),
    ).toEqual({ tipo: 'Cadastro duplicado' });
    expect(chamadas.some((c) => c.includes('tok-secreto'))).toBe(false); // token só no cabeçalho
  });

  it('rodar de novo não cria nada e não repete o alerta', async () => {
    usar({ PIPEDRIVE_API_TOKEN: 'tok-secreto' });
    const r = (await ctx.admin.post('/api/radar/pipedrive/sincronizar').send({}).expect(200)).body.resultado;
    expect(r.empresas.novas).toBe(0);
    expect(r.pessoas.novas).toBe(0);
    expect(r.alertas).toBe(0);
  });

  it('não sobrescreve o que é do Radar (nome curto, monitorar, logo)', async () => {
    await ctx
      .db('empresas')
      .where('pipedrive_org_id', 9001)
      .update({ nome_curto: 'Nova', monitorar: false, logo: 'data:image/png;base64,AAA' });
    usar({ PIPEDRIVE_API_TOKEN: 'tok-secreto' });
    await ctx.admin.post('/api/radar/pipedrive/sincronizar').send({}).expect(200);
    const e = await ctx.db('empresas').where('pipedrive_org_id', 9001).first('nome_curto', 'monitorar', 'logo');
    expect(e.nome_curto).toBe('Nova');
    expect(!!e.monitorar).toBe(false);
    expect(e.logo).toBe('data:image/png;base64,AAA');
  });

  it('empresa mandada para a lixeira não volta na sincronização', async () => {
    const accenture = await ctx.db('empresas').where('pipedrive_org_id', 77).first('id');
    await ctx.admin.delete(`/api/empresas/${accenture.id}`).expect(200);
    const nova = await ctx.db('empresas').where('pipedrive_org_id', 9001).first('id');
    await ctx.admin.delete(`/api/empresas/${nova.id}`).expect(200);
    usar({ PIPEDRIVE_API_TOKEN: 'tok-secreto' });
    const r = (await ctx.admin.post('/api/radar/pipedrive/sincronizar').send({}).expect(200)).body.resultado;
    expect(r.empresas).toMatchObject({ novas: 0, ignoradas: 2 });
    expect(await ctx.db('empresas').where('pipedrive_org_id', 77).count({ n: '*' })).toEqual([{ n: 1 }]);
    // restaurar volta a sincronizar
    await ctx.db('empresas').where('id', nova.id).update({ excluido_em: null });
    const r2 = (await ctx.admin.post('/api/radar/pipedrive/sincronizar').send({}).expect(200)).body.resultado;
    expect(r2.empresas.ignoradas).toBe(1);
  });

  it('token recusado vira erro 502 com mensagem clara e fica no status', async () => {
    usar({ PIPEDRIVE_API_TOKEN: 'errado' });
    const res = await ctx.admin.post('/api/radar/pipedrive/sincronizar').send({}).expect(502);
    expect(res.body.error).toContain('recusou o token');
    expect((await ctx.admin.get('/api/radar/pipedrive/status')).body.ultima.ok).toBe(false);
  });

  it('domínio errado no .env: cai no endereço geral da API', async () => {
    const real = fetchFalso();
    const hosts: string[] = [];
    definirContextoPipedrive(() => ({
      env: { PIPEDRIVE_API_TOKEN: 'tok-secreto', PIPEDRIVE_DOMINIO: 'naoexiste' },
      fetch: (async (u: string | URL | Request, init?: RequestInit) => {
        const host = new URL(String(u)).host;
        hosts.push(host);
        if (host === 'naoexiste.pipedrive.com') throw new TypeError('fetch failed');
        return real(u, init);
      }) as typeof fetch,
    }));
    await ctx.admin.post('/api/radar/pipedrive/sincronizar').send({}).expect(200);
    expect(hosts[0]).toBe('naoexiste.pipedrive.com');
    expect(hosts.at(-1)).toBe('api.pipedrive.com');
  });

  it('completa no Pipedrive o que lá está vazio e o Radar tem (e não mexe no que o Pipedrive já tem)', async () => {
    // Accenture: Pipedrive sem site, segmento e tier; o Radar tem os três (restaurada da lixeira para sincronizar)
    await ctx
      .db('empresas')
      .where('pipedrive_org_id', 77)
      .update({ excluido_em: null, site: 'accenture.com', segmento: 'Consultoria', tier: 'A' });
    // Joao Antunes (sem LinkedIn no Pipedrive): o Radar conhece pelo id e tem o perfil
    await ctx.db('pessoas').insert({
      nome: 'Joao Antunes',
      pipedrive_person_id: 4249,
      linkedin_url: 'https://www.linkedin.com/in/joao-antunes',
      cargo: 'Gerente de Dados',
      monitorar: true,
    });
    usar({ PIPEDRIVE_API_TOKEN: 'tok-secreto' });
    gravacoes = [];
    const r = (await ctx.admin.post('/api/radar/pipedrive/sincronizar').send({}).expect(200)).body.resultado;
    const org = gravacoes.find((g) => g.caminho === '/v1/organizations/77')!;
    expect(org.corpo).toEqual({ website: 'accenture.com', [SEGMENTO]: 'Consultoria', [TIER]: 92 });
    // Paraná: Pipedrive já tem tudo → nada enviado
    expect(gravacoes.some((g) => g.caminho === '/v1/organizations/3556')).toBe(false);
    const pessoa = gravacoes.find((g) => g.caminho === '/v1/persons/4249')!;
    expect(pessoa.corpo).toEqual({
      [LI_PESSOA]: 'https://www.linkedin.com/in/joao-antunes',
      job_title: 'Gerente de Dados',
    });
    expect(r.enviados.organizacoes).toBeGreaterThanOrEqual(1);
    expect(r.enviados.pessoas).toBe(1);
  });

  it('com a opção desligada, não grava nada no Pipedrive', async () => {
    await saveAppSettings(ctx.db, { pipedrive_completar: false });
    usar({ PIPEDRIVE_API_TOKEN: 'tok-secreto' });
    gravacoes = [];
    await ctx.admin.post('/api/radar/pipedrive/sincronizar').send({}).expect(200);
    expect(gravacoes).toEqual([]);
    await saveAppSettings(ctx.db, { pipedrive_completar: true });
  });

  it('perfil só de leitura não sincroniza', async () => {
    usar({ PIPEDRIVE_API_TOKEN: 'tok-secreto' });
    await ctx.leitura.post('/api/radar/pipedrive/sincronizar').send({}).expect(403);
  });
});

describe('nível pelo cargo', () => {
  it('classifica os cargos comuns', () => {
    expect(nivelDoCargo('CIO - Superintendente de TI')).toBe('C-level');
    expect(nivelDoCargo('Diretor de TI')).toBe('Diretoria');
    expect(nivelDoCargo('Superintendente de Engenharia')).toBe('Diretoria');
    expect(nivelDoCargo('Gerente de Tecnologia')).toBe('Gerência');
    expect(nivelDoCargo('Coordenador de Sistemas')).toBe('Coordenação');
    expect(nivelDoCargo('Analista')).toBe('Outro');
    expect(nivelDoCargo(null)).toBeNull();
  });
});
