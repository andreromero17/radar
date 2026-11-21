import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerEscopoIntegracao } from '../src/auth/integracao';
import { hashToken } from '../src/auth/tokens';
import { criarEspaco } from '../src/espacos';
import { makeTestApp, type TestCtx } from './helpers';

registerEscopoIntegracao({
  escopo: 'teste.clientes',
  nome: 'Cadastrar clientes',
  descricao: 'Só para os testes',
  rotas: ['POST /api/clientes', 'GET /api/me-integracao'],
});

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});

const criar = async (agent: TestCtx['admin'], nome = 'Atalho') =>
  agent.post('/api/integracoes/tokens').send({ nome, escopo: 'teste.clientes' });

describe('tokens de integração', () => {
  it('lista os escopos registrados', async () => {
    const r = await ctx.admin.get('/api/integracoes/escopos');
    expect(r.status).toBe(200);
    expect(r.body).toContainEqual({
      escopo: 'teste.clientes',
      nome: 'Cadastrar clientes',
      descricao: 'Só para os testes',
    });
  });

  it('cria (mostra o token uma vez), guarda só o hash e lista sem o token', async () => {
    const r = await criar(ctx.admin);
    expect(r.status).toBe(201);
    expect(r.body.token).toMatch(/^fi_/);
    const linha = await ctx.plataforma('tokens_integracao').where({ id: r.body.id }).first();
    expect(linha.token_hash).toBe(hashToken(r.body.token));
    expect(JSON.stringify(linha)).not.toContain(r.body.token);
    expect(Number(linha.espaco_id)).toBe(ctx.espacoId);
    const lista = await ctx.admin.get('/api/integracoes/tokens');
    expect(lista.body.some((t: { id: number }) => t.id === r.body.id)).toBe(true);
    expect(JSON.stringify(lista.body)).not.toContain(r.body.token);
    expect(lista.body[0]).not.toHaveProperty('token_hash');
  });

  it('valida nome e escopo', async () => {
    expect((await ctx.admin.post('/api/integracoes/tokens').send({ nome: '', escopo: 'teste.clientes' })).status).toBe(
      422,
    );
    expect((await ctx.admin.post('/api/integracoes/tokens').send({ nome: 'x', escopo: 'nao.existe' })).status).toBe(
      422,
    );
  });

  it('abre só as rotas do escopo, no espaço do token', async () => {
    const { token } = (await criar(ctx.admin)).body;
    const ok = await request(ctx.app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Via token' });
    expect(ok.status).toBe(201);
    expect(await ctx.db('clientes').where({ nome: 'Via token' }).first()).toBeTruthy();

    // fora do escopo: listar, outra entidade, rotas de conta e os próprios tokens
    for (const [m, url] of [
      ['get', '/api/clientes'],
      ['get', '/api/auth/me'],
      ['get', '/api/integracoes/tokens'],
      ['post', '/api/integracoes/tokens'],
      ['get', '/api/membros'],
      ['get', '/api/settings'],
    ] as const) {
      const r = await request(ctx.app)[m](url).set('Authorization', `Bearer ${token}`).send({});
      expect(r.status, `${m} ${url}`).toBe(403);
    }
  });

  it('token inválido ou revogado não entra; o cookie não é usado junto com Bearer', async () => {
    const b = (t: string) =>
      request(ctx.app).post('/api/clientes').set('Authorization', `Bearer ${t}`).send({ nome: 'X' });
    expect((await b('fi_inventado')).status).toBe(401);
    expect((await b('qualquer')).status).toBe(401);
    const { id, token } = (await criar(ctx.admin)).body;
    expect((await ctx.admin.delete(`/api/integracoes/tokens/${id}`)).status).toBe(200);
    expect((await b(token)).status).toBe(401);
    expect((await ctx.admin.delete(`/api/integracoes/tokens/${id}`)).status).toBe(404);
    // sessão válida no cookie + Bearer inválido = não autenticado (o Bearer manda)
    const r = await ctx.admin.get('/api/auth/me').set('Authorization', 'Bearer fi_inventado');
    expect(r.status).toBe(401);
  });

  it('um usuário não vê nem revoga token de outro', async () => {
    const { id } = (await criar(ctx.admin)).body;
    const lista = await ctx.operador.get('/api/integracoes/tokens');
    expect(lista.body.some((t: { id: number }) => t.id === id)).toBe(false);
    expect((await ctx.operador.delete(`/api/integracoes/tokens/${id}`)).status).toBe(404);
  });

  it('as permissões do usuário continuam valendo (leitor não grava)', async () => {
    const r = await criar(ctx.leitura, 'Leitor');
    expect(r.status).toBe(201);
    const g = await request(ctx.app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${r.body.token}`)
      .send({ nome: 'Do leitor' });
    expect(g.status).toBe(403);
  });

  it('o token fica preso ao espaço dele, mesmo que a sessão troque de espaço', async () => {
    const admin = await ctx.plataforma('usuarios').where({ email: 'admin@sistema.com' }).first();
    const outro = await criarEspaco({ nome: 'Outro espaço', donoId: admin.id });
    const { token } = (await criar(ctx.admin)).body; // criado no espaço de teste
    // tenta "escolher" outro espaço: não há como; o espaço vem do token
    const r = await request(ctx.app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', 'espaco=' + outro)
      .send({ nome: 'Preso ao espaço' });
    expect(r.status).toBe(201);
    expect(await ctx.db('clientes').where({ nome: 'Preso ao espaço' }).first()).toBeTruthy();
  });

  it('deixa de valer quando o usuário sai do espaço', async () => {
    const { token } = (await criar(ctx.operador, 'Do operador')).body;
    const ana = await ctx.plataforma('usuarios').where({ email: 'ana@sistema.com' }).first();
    await ctx.plataforma('membros').where({ usuario_id: ana.id, espaco_id: ctx.espacoId }).update({ ativo: false });
    try {
      const r = await request(ctx.app)
        .post('/api/clientes')
        .set('Authorization', `Bearer ${token}`)
        .send({ nome: 'Sem acesso' });
      expect(r.status).toBe(403);
    } finally {
      await ctx.plataforma('membros').where({ usuario_id: ana.id, espaco_id: ctx.espacoId }).update({ ativo: true });
    }
  });

  it('limita a 60 requisições por minuto por token', async () => {
    const { token } = (await criar(ctx.admin, 'Rajada')).body;
    let ultimo = 0;
    for (let i = 0; i < 61; i++) {
      ultimo = (await request(ctx.app).post('/api/clientes').set('Authorization', `Bearer ${token}`).send({})).status;
    }
    expect(ultimo).toBe(429);
  });
});
