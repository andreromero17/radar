import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { autorEhDaFonte, coletarPosts, definirContextoApify, idDoPost } from '../src/app/coleta';
import { makeTestApp, type TestCtx } from './helpers';

// Radar 0.3.0: coleta de posts pelo Apify (fetch simulado — nunca a rede nos testes).
let ctx: TestCtx;
let entradas: Record<string, unknown>[] = [];
let itensDoAtor: unknown[] = [];

function apifyFalso(opcoes: { statusFinal?: string } = {}) {
  let consultas = 0;
  return async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada));
    if (new Headers(init?.headers).get('authorization') !== 'Bearer tok-apify')
      return new Response('{}', { status: 401 });
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
    if (url.pathname === '/v2/acts/harvestapi~linkedin-company-posts/runs') {
      entradas.push(JSON.parse(String(init?.body)));
      return json({ data: { id: 'run1', status: 'RUNNING', defaultDatasetId: 'ds1' } });
    }
    if (url.pathname === '/v2/actor-runs/run1') {
      consultas++;
      const fim = consultas >= 2;
      return json({
        data: {
          id: 'run1',
          status: fim ? (opcoes.statusFinal ?? 'SUCCEEDED') : 'RUNNING',
          defaultDatasetId: 'ds1',
          usageTotalUsd: fim ? 0.042 : null,
        },
      });
    }
    if (url.pathname === '/v2/datasets/ds1/items') return json(itensDoAtor);
    return new Response('{}', { status: 404 });
  };
}
const usar = (env: Record<string, string>, opcoes?: { statusFinal?: string }) =>
  definirContextoApify(() => ({ fetch: apifyFalso(opcoes) as typeof fetch, env, esperar: async () => {} }));

const post = (o: Record<string, unknown>) => ({
  id: String(o.id),
  linkedinUrl: `https://www.linkedin.com/posts/x-activity-${o.id}-abc`,
  content: o.texto ?? 'Primeira linha do post\nresto',
  author: o.autor,
  postedAt: { date: '2026-11-18T10:00:00.000Z' },
  engagement: { likes: o.likes ?? 10, comments: 2, shares: 1 },
  header: o.header ?? null,
  query: { targetUrl: o.fonte },
});

beforeAll(async () => {
  ctx = await makeTestApp();
});
afterEach(() => definirContextoApify(null));
afterAll(() => ctx.db.destroy());

describe('autoria', () => {
  it('reconhece a página e o perfil pelo slug ou pelo endereço', () => {
    const empresa = { url: 'https://www.linkedin.com/company/taking', slug: 'taking' };
    expect(autorEhDaFonte({ author: { universalName: 'taking' } }, empresa)).toBe(true);
    expect(autorEhDaFonte({ author: { linkedinUrl: 'https://br.linkedin.com/company/Taking/' } }, empresa)).toBe(true);
    expect(autorEhDaFonte({ author: { universalName: 'outra' } }, empresa)).toBe(false);
    const pessoa = { url: 'https://www.linkedin.com/in/polidoro', slug: 'polidoro' };
    expect(autorEhDaFonte({ author: { publicIdentifier: 'polidoro' } }, pessoa)).toBe(true);
    expect(
      autorEhDaFonte({ author: { linkedinUrl: 'https://www.linkedin.com/in/polidoro?miniProfileUrn=x' } }, pessoa),
    ).toBe(true);
  });

  it('pega o id do post do campo id ou da activity no endereço', () => {
    expect(idDoPost({ id: '123' })).toBe('123');
    expect(idDoPost({ linkedinUrl: 'https://www.linkedin.com/posts/a_b-activity-7528409129338593281-BxcT' })).toBe(
      '7528409129338593281',
    );
    expect(idDoPost({})).toBeNull();
  });
});

describe('coleta de posts', () => {
  it('sem token: a rota recusa e o status avisa', async () => {
    usar({});
    expect((await ctx.admin.get('/api/radar/coleta/status').expect(200)).body.configurado).toBe(false);
    expect((await ctx.admin.post('/api/radar/coleta/executar').send({}).expect(400)).body.error).toContain(
      'APIFY_TOKEN',
    );
  });

  it('grava posts novos, separa reposts, descarta autor errado e registra a execução', async () => {
    const taking = 'https://www.linkedin.com/company/taking';
    const polidoro = 'https://www.linkedin.com/in/polidoro';
    await ctx.db('pessoas').where('linkedin_url', polidoro).update({ titulo_linkedin: 'CIO no Paraná Banco' });
    itensDoAtor = [
      post({
        id: 'novo1',
        fonte: taking,
        autor: {
          universalName: 'taking',
          type: 'company',
          name: 'Grupo Taking',
          avatar: { url: 'https://media.licdn.com/logo-taking.png' },
        },
        texto: 'Taking anuncia parceria\n...',
      }),
      post({
        id: 'rep1',
        fonte: taking,
        autor: { universalName: 'baguete', name: 'Baguete' },
        header: { text: 'Grupo Taking repostou isto' },
      }),
      post({ id: 'lixo1', fonte: taking, autor: { publicIdentifier: 'bill-gates', name: 'Bill Gates' } }),
      post({
        id: 'semfonte',
        fonte: 'https://www.linkedin.com/company/nao-monitorada',
        autor: { universalName: 'nao-monitorada' },
      }),
      post({
        id: 'pess1',
        fonte: polidoro,
        autor: { publicIdentifier: 'polidoro', name: 'Adriano Polidoro', info: 'CTO na Outra Empresa' },
      }),
    ];
    usar({ APIFY_TOKEN: 'tok-apify' });
    entradas = [];
    const res = await ctx.admin.post('/api/radar/coleta/executar').send({}).expect(202);
    const coleta = await ctx.db('coletas').where('id', res.body.coleta_id).first();
    expect(coleta).toMatchObject({
      situacao: 'Ok',
      itens_encontrados: 5,
      itens_novos: 3,
      descartados: 2,
      custo_usd: 0.042,
    });

    // entrada do ator: só monitorados, fora da lixeira, com endereço; janela de 30 dias na primeira vez
    const entrada = entradas[0] as { targetUrls: string[]; maxPosts: number; postedLimitDate: string };
    expect(entrada.targetUrls).toContain(taking);
    expect(entrada.targetUrls).toContain(polidoro);
    expect(entrada.maxPosts).toBe(20);
    expect(entrada.postedLimitDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const novo = await ctx.db('publicacoes').where('id_externo', 'novo1').first();
    expect(novo).toMatchObject({
      titulo: 'Taking anuncia parceria',
      triagem: 'Pendente',
      curtidas: 10,
      data_publicacao: '2026-11-18',
    });
    expect(!!novo.post_proprio).toBe(true);
    const rep = await ctx.db('publicacoes').where('original_id', 'rep1').first();
    expect(!!rep.post_proprio).toBe(false);
    expect(rep.id_externo).toMatch(/^repost:e\d+:rep1$/);
    expect(await ctx.db('publicacoes').where('id_externo', 'lixo1').first()).toBeUndefined();

    const pessoa = await ctx.db('pessoas').where('linkedin_url', polidoro).first('id', 'titulo_linkedin');
    expect(pessoa.titulo_linkedin).toBe('CTO na Outra Empresa');
    expect((await ctx.db('publicacoes').where('id_externo', 'pess1').first('pessoa_id')).pessoa_id).toBe(pessoa.id);
    const alerta = await ctx
      .db('alertas_cadastro')
      .where({ pessoa_id: pessoa.id, tipo: 'Troca de cargo' })
      .first('detalhe');
    expect(alerta.detalhe).toContain('CTO na Outra Empresa');
    expect((await ctx.db('empresas').where('linkedin_url', taking).first('logo_linkedin')).logo_linkedin).toContain(
      'logo-taking',
    );
  });

  it('rodar de novo não duplica: só atualiza o engajamento e não repete o alerta', async () => {
    itensDoAtor = [
      post({
        id: 'novo1',
        fonte: 'https://www.linkedin.com/company/taking',
        autor: { universalName: 'taking' },
        likes: 99,
      }),
      post({
        id: 'pess1',
        fonte: 'https://www.linkedin.com/in/polidoro',
        autor: { publicIdentifier: 'polidoro', info: 'CTO na Outra Empresa' },
      }),
    ];
    usar({ APIFY_TOKEN: 'tok-apify' });
    entradas = [];
    const r = await coletarPosts(ctx.db);
    expect(r).toMatchObject({ novos: 0, atualizados: 2, alertas: 0 });
    expect((await ctx.db('publicacoes').where('id_externo', 'novo1').first('curtidas')).curtidas).toBe(99);
    // janela: desde a última coleta OK menos 1 dia
    const hoje = new Date().toISOString().slice(0, 10);
    expect((entradas[0] as { postedLimitDate: string }).postedLimitDate < hoje).toBe(true);
  });

  it('fonte sem histórico (mesmo cadastrada antes e já coletada com janela curta) ganha 30 dias num run à parte', async () => {
    // caso real: a empresa entrou antes da última coleta, passou por ela com a janela curta e ficou sem histórico
    await ctx.db('empresas').insert({
      universo: 'Nós',
      nome: 'Lighthouse',
      linkedin_url: 'https://www.linkedin.com/company/lighthouse-nova',
      monitorar: true,
      criado_em: '2000-01-01 00:00:00',
    });
    itensDoAtor = [];
    usar({ APIFY_TOKEN: 'tok-apify' });
    entradas = [];
    await coletarPosts(ctx.db);
    expect(entradas).toHaveLength(2);
    const [novas, antigas] = entradas as { targetUrls: string[]; postedLimitDate: string }[];
    expect(novas.targetUrls).toEqual(['https://www.linkedin.com/company/lighthouse-nova']);
    expect(antigas.targetUrls).not.toContain('https://www.linkedin.com/company/lighthouse-nova');
    expect(novas.postedLimitDate < antigas.postedLimitDate).toBe(true);
    const trinta = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    expect(novas.postedLimitDate).toBe(trinta);
    // marcada: na próxima coleta, um run só (todas com a janela curta)
    const lh = await ctx.db('empresas').where('nome', 'Lighthouse').first('historico_posts_em');
    expect(lh.historico_posts_em).toBeTruthy();
    entradas = [];
    await coletarPosts(ctx.db);
    expect(entradas).toHaveLength(1);
  });

  it('fonte sem a marca que já tem post antigo é marcada sem gastar run; coleta com erro não marca', async () => {
    const [id] = await ctx.db('empresas').insert({
      universo: 'Concorrente',
      nome: 'Antiga',
      linkedin_url: 'https://www.linkedin.com/company/antiga',
      monitorar: true,
    });
    const empresaId = typeof id === 'object' ? (id as { id: number }).id : id;
    await ctx.db('publicacoes').insert({
      tipo: 'Post',
      empresa_id: empresaId,
      titulo: 'velho',
      data_publicacao: '2026-01-10',
      id_externo: 'velho1',
      post_proprio: true,
    });
    await ctx.db('empresas').insert({
      universo: 'Concorrente',
      nome: 'Sem posts',
      linkedin_url: 'https://www.linkedin.com/company/sem-posts',
      monitorar: true,
    });
    itensDoAtor = [];
    usar({ APIFY_TOKEN: 'tok-apify' }, { statusFinal: 'FAILED' });
    entradas = [];
    await expect(coletarPosts(ctx.db)).rejects.toThrow();
    expect((entradas[0] as { targetUrls: string[] }).targetUrls).toEqual([
      'https://www.linkedin.com/company/sem-posts',
    ]);
    expect(
      (await ctx.db('empresas').where('nome', 'Antiga').first('historico_posts_em')).historico_posts_em,
    ).toBeTruthy();
    expect(
      (await ctx.db('empresas').where('nome', 'Sem posts').first('historico_posts_em')).historico_posts_em,
    ).toBeNull();
    await ctx.db('empresas').where('nome', 'Sem posts').update({ monitorar: false });
  });

  it('"Buscar 30 dias" tira a marca da empresa e das pessoas dela', async () => {
    const e = await ctx.db('empresas').where('nome', 'Lighthouse').first('id');
    await ctx.db('empresas').where('id', e.id).update({ historico_posts_em: '2026-11-01 00:00:00' });
    await ctx.admin.post(`/api/radar/empresas/${e.id}/refazer-historico`).send({}).expect(200);
    expect((await ctx.db('empresas').where('id', e.id).first('historico_posts_em')).historico_posts_em).toBeNull();
    await ctx.admin.post('/api/radar/empresas/999999/refazer-historico').send({}).expect(404);
    await ctx.db('empresas').where('id', e.id).update({ historico_posts_em: '2026-11-01 00:00:00' });
  });

  it('coletas de páginas e vagas não contam como "última coleta de posts"', async () => {
    await ctx
      .db('empresas')
      .where('linkedin_url', 'https://www.linkedin.com/company/lighthouse-nova')
      .update({ criado_em: '2026-01-01 00:00:00' });
    await ctx.db('coletas').insert({
      inicio: '2999-01-01 00:00:00',
      situacao: 'Ok',
      ator: 'harvestapi/linkedin-company',
      descricao: 'páginas',
    });
    itensDoAtor = [];
    usar({ APIFY_TOKEN: 'tok-apify' });
    entradas = [];
    await coletarPosts(ctx.db);
    expect(entradas).toHaveLength(1);
    expect((entradas[0] as { postedLimitDate: string }).postedLimitDate < '2999-01-01').toBe(true);
    await ctx.db('coletas').where('descricao', 'páginas').del();
  });

  it('falha do ator fica gravada na execução', async () => {
    itensDoAtor = [];
    usar({ APIFY_TOKEN: 'tok-apify' }, { statusFinal: 'FAILED' });
    await expect(coletarPosts(ctx.db)).rejects.toThrow('FAILED');
    const ultima = await ctx.db('coletas').orderBy('id', 'desc').first('situacao', 'erro');
    expect(ultima.situacao).toBe('Erro');
    expect(ultima.erro).toContain('FAILED');
  });

  it('empresa na lixeira ou sem "monitorar" não entra na coleta', async () => {
    const taking = await ctx
      .db('empresas')
      .where('linkedin_url', 'https://www.linkedin.com/company/taking')
      .first('id');
    await ctx.admin.delete(`/api/empresas/${taking.id}`).expect(200);
    await ctx.db('empresas').where('nome_curto', 'FCamara').update({ monitorar: false });
    itensDoAtor = [];
    usar({ APIFY_TOKEN: 'tok-apify' });
    entradas = [];
    await coletarPosts(ctx.db);
    const urls = (entradas[0] as { targetUrls: string[] }).targetUrls;
    expect(urls).not.toContain('https://www.linkedin.com/company/taking');
    expect(urls.some((u) => u.includes('fcamara'))).toBe(false);
  });

  it('retoma um run do Apify que passou do tempo, sem disparar outro', async () => {
    itensDoAtor = [
      post({ id: 'ret1', fonte: 'https://www.linkedin.com/in/polidoro', autor: { publicIdentifier: 'polidoro' } }),
    ];
    usar({ APIFY_TOKEN: 'tok-apify' });
    entradas = [];
    const res = await ctx.admin.post('/api/radar/coleta/executar').send({ run_apify: 'run1' }).expect(202);
    expect(entradas).toEqual([]); // nenhum run novo
    const coleta = await ctx
      .db('coletas')
      .where('id', res.body.coleta_id)
      .first('situacao', 'run_apify', 'itens_novos');
    expect(coleta).toEqual({ situacao: 'Ok', run_apify: 'run1', itens_novos: 1 });
  });

  it('guarda o id do run assim que ele começa', async () => {
    itensDoAtor = [];
    usar({ APIFY_TOKEN: 'tok-apify' });
    const r = await coletarPosts(ctx.db);
    expect((await ctx.db('coletas').where('id', r.coleta_id).first('run_apify')).run_apify).toBe('run1');
  });

  it('coleta "Rodando" esquecida (servidor reiniciou) vira Erro ao consultar o status', async () => {
    await ctx
      .db('coletas')
      .insert({ inicio: '2026-01-01 10:00:00', situacao: 'Rodando', descricao: 'antiga', run_apify: 'abcdefgh123' });
    usar({ APIFY_TOKEN: 'tok-apify' });
    const st = (await ctx.admin.get('/api/radar/coleta/status').expect(200)).body;
    expect(st.rodando).toBe(false);
    const antiga = await ctx.db('coletas').where('descricao', 'antiga').first('situacao', 'erro');
    expect(antiga.situacao).toBe('Erro');
    expect(antiga.erro).toContain('Interrompida');
  });

  it('execução antiga sem o run gravado: o status tira o run do texto do erro', async () => {
    await ctx.db('coletas').insert({
      inicio: '2026-11-19 21:39:00',
      situacao: 'Erro',
      descricao: 'v030',
      erro: 'O ator não terminou em 30 min (run aEq3wfpA480qA2wxv).',
    });
    usar({ APIFY_TOKEN: 'tok-apify' });
    expect((await ctx.admin.get('/api/radar/coleta/status').expect(200)).body.ultima.run_apify).toBe(
      'aEq3wfpA480qA2wxv',
    );
  });

  it('perfil só de leitura não dispara coleta', async () => {
    usar({ APIFY_TOKEN: 'tok-apify' });
    await ctx.leitura.post('/api/radar/coleta/executar').send({}).expect(403);
  });
});

describe('reposts com chave própria (0.4.9)', () => {
  it('o post da pessoa e o repost dele pela página da empresa entram os dois', async () => {
    const taking = 'https://www.linkedin.com/company/taking';
    const polidoro = 'https://www.linkedin.com/in/polidoro';
    await ctx.db('pessoas').where('linkedin_url', polidoro).update({ monitorar: true });
    await ctx.db('empresas').where('linkedin_url', taking).update({ monitorar: true, excluido_em: null });
    const autor = { publicIdentifier: 'polidoro', name: 'Adriano Polidoro', linkedinUrl: `${polidoro}?x=1` };
    itensDoAtor = [
      post({ id: 'dup1', fonte: taking, autor, header: { text: 'Grupo Taking repostou isto' } }),
      post({ id: 'dup1', fonte: polidoro, autor }),
    ];
    usar({ APIFY_TOKEN: 'tok-apify' });
    await coletarPosts(ctx.db);
    const linhas = await ctx.db('publicacoes').where('id_externo', 'dup1').orWhere('original_id', 'dup1').select();
    expect(linhas).toHaveLength(2);
    const rep = linhas.find((l) => !l.post_proprio)!;
    expect(rep.pessoa_id).toBeNull();
    expect(rep.autor_linkedin).toBe(polidoro);
    expect(linhas.find((l) => !!l.post_proprio)!.pessoa_id).not.toBeNull();
    // de novo: idempotente
    await coletarPosts(ctx.db);
    expect(
      await ctx.db('publicacoes').where('id_externo', 'dup1').orWhere('original_id', 'dup1').select(),
    ).toHaveLength(2);
  });
});
