import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inserir } from '../src/db/knex';
import { makeTestApp, type TestCtx } from './helpers';

// Radar 0.4.9: página da pessoa, assuntos das pessoas na página da empresa e reposts da empresa de posts das pessoas.
let ctx: TestCtx;
let empresa: number;
let ana: number;
const hoje = new Date().toISOString().slice(0, 10);
const post = (extra: Record<string, unknown>) => ({
  tipo: 'Post',
  data_publicacao: hoje,
  curtidas: 10,
  comentarios: 2,
  compartilhamentos: 0,
  post_proprio: true,
  ...extra,
});

beforeAll(async () => {
  ctx = await makeTestApp();
  empresa = await inserir(ctx.db('empresas'), {
    nome: 'Empresa X',
    universo: 'Concorrente',
    linkedin_url: 'https://www.linkedin.com/company/empresa-x',
    monitorar: true,
  });
  ana = await inserir(ctx.db('pessoas'), {
    nome: 'Ána Silva',
    empresa_id: empresa,
    cargo: 'CTO',
    linkedin_url: 'https://www.linkedin.com/in/ana-silva',
    monitorar: true,
  });
  await ctx.db('publicacoes').insert([
    // posts da Ana: um repostado pela página, outro não; e um repost dela de um post da empresa
    post({ empresa_id: empresa, pessoa_id: ana, id_externo: 'a1', titulo: 'Agentes de IA', assuntos: 'IA e agentes' }),
    post({
      empresa_id: empresa,
      pessoa_id: ana,
      id_externo: 'a2',
      titulo: 'Cultura',
      assuntos: 'Cultura e pessoas',
      curtidas: 30,
    }),
    post({
      empresa_id: empresa,
      pessoa_id: ana,
      id_externo: `repost:p${ana}:c9`,
      original_id: 'c9',
      post_proprio: false,
      autor: 'Empresa X',
      autor_linkedin: 'https://www.linkedin.com/company/empresa-x',
    }),
    // página: post próprio, repost do post da Ana (pelo LinkedIn) e repost de alguém de fora
    post({ empresa_id: empresa, id_externo: 'c9', titulo: 'Post da empresa', assuntos: 'Cases e clientes' }),
    post({
      empresa_id: empresa,
      id_externo: `repost:e${empresa}:a1`,
      original_id: 'a1',
      post_proprio: false,
      autor: 'Outro Nome',
      autor_linkedin: 'https://www.linkedin.com/in/ana-silva',
    }),
    post({
      empresa_id: empresa,
      id_externo: `repost:e${empresa}:z1`,
      original_id: 'z1',
      post_proprio: false,
      autor: 'Fulano',
    }),
    // repost antigo (sem LinkedIn do autor): casa pelo nome, sem acento
    post({
      empresa_id: empresa,
      id_externo: `repost:e${empresa}:a0`,
      original_id: 'a0',
      post_proprio: false,
      autor: 'ana silva',
    }),
  ]);
});
afterAll(() => ctx.db.destroy());

describe('página da empresa: pessoas-chave', () => {
  it('assuntos das pessoas e reposts da página de posts delas', async () => {
    const d = (await ctx.admin.get(`/api/radar/empresas/${empresa}/detalhe?dias=30`).expect(200)).body;
    expect(d.assuntos_pessoas.map((a: { assunto: string }) => a.assunto).sort()).toEqual([
      'Cultura e pessoas',
      'IA e agentes',
    ]);
    expect(d.assuntos.map((a: { assunto: string }) => a.assunto)).toEqual(['Cases e clientes']);
    expect(d.reposts_pessoas).toHaveLength(2);
    expect(
      d.reposts_pessoas.every(
        (r: { autor: string; pessoa_id: number }) => r.autor === 'Ána Silva' && r.pessoa_id === ana,
      ),
    ).toBe(true);
    const a1 = d.posts.find((x: { titulo: string }) => x.titulo === 'Agentes de IA');
    const a2 = d.posts.find((x: { titulo: string }) => x.titulo === 'Cultura');
    expect(a1.repost_empresa).toBe(true);
    expect(a2.repost_empresa).toBe(false);
  });
});

describe('página da pessoa', () => {
  it('estatísticas dos posts dela e a relação com a página da empresa', async () => {
    const d = (await ctx.admin.get(`/api/radar/pessoas/${ana}/detalhe?dias=30`).expect(200)).body;
    expect(d.pessoa).toMatchObject({ nome: 'Ána Silva', cargo: 'CTO', empresa: { id: empresa, nome: 'Empresa X' } });
    expect(d.kpis).toMatchObject({
      posts: 2,
      reposts: 1,
      repostados_pela_empresa: 1,
      reposts_da_empresa: 1,
      interacoes_post: 22,
      curtidas_post: 20,
    });
    expect(d.melhores[0].titulo).toBe('Cultura');
    expect(d.posts).toHaveLength(3);
    expect(d.assuntos).toHaveLength(2);
    await ctx.admin.get('/api/radar/pessoas/999999/detalhe').expect(404);
  });
});
