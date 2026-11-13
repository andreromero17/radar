import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TERMOS_VERSAO } from '@frame/shared';
import { hashPassword } from '../src/auth/password';
import { createEntityTable } from '../src/db/diff';
import { abrirEspaco, adicionarMembro, criarEspaco } from '../src/espacos';
import { apagarEspacosExcluidos, limparCadastrosPendentes } from '../src/services/conta';
import { nowLocal } from '../src/utils/time';
import { fixtureEntities } from './fixtures';
import { makeTestApp, type TestCtx } from './helpers';

// Fase 5D: cadastro (fechado → convite para testar; aberto → confirmação de e-mail), termos, meus dados,
// excluir conta e feedback
let ctx: TestCtx;
const SENHA = 'senhaBoa123';
const tokenDo = (caminho: string) => {
  const m = ctx.mailer.sent.at(-1)!;
  return new RegExp(`${caminho}([A-Za-z0-9_-]+)`).exec(m.text)![1];
};

beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => ctx.db.destroy());

const cadastro = (dados: Record<string, unknown>) =>
  request
    .agent(ctx.app)
    .post('/api/auth/cadastro')
    .send({ nome: 'Pessoa', senha: SENHA, aceite: true, ...dados });

describe('cadastro fechado: só com convite para testar', () => {
  it('sem convite, recusa', async () => {
    const r = await cadastro({ email: 'qualquer@x.com' });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CADASTRO_FECHADO');
    expect((await request(ctx.app).get('/api/settings/publicas')).body.cadastro_aberto).toBe(false);
  });

  it('administrador convida; a pessoa cria a conta e já entra no próprio espaço, como dona', async () => {
    expect((await ctx.operador.post('/api/plataforma/convites').send({ email: 'beta@x.com' })).status).toBe(403);
    await ctx.admin.post('/api/plataforma/convites').send({ email: ' Beta@X.com ' }).expect(201);
    expect(ctx.mailer.sent.at(-1)!.to).toBe('beta@x.com');
    const token = tokenDo('/cadastro\\?convite=');
    expect((await request(ctx.app).get(`/api/auth/cadastro/convite/${token}`)).body).toEqual({ email: 'beta@x.com' });

    expect((await cadastro({ email: 'outro@x.com', convite: token })).status).toBe(422);
    expect((await cadastro({ email: 'beta@x.com', convite: token, aceite: false })).status).toBe(422);
    const a = request.agent(ctx.app);
    const r = await a.post('/api/auth/cadastro').send({
      nome: 'Beta Tester',
      email: 'beta@x.com',
      senha: SENHA,
      aceite: true,
      convite: token,
      espaco: 'Minha casa',
    });
    expect(r.status).toBe(200);
    const me = (await a.get('/api/auth/me')).body;
    expect(me).toMatchObject({ email: 'beta@x.com', perfil: 'Membro', admin: false });
    expect(me.espaco).toMatchObject({ nome: 'Minha casa', papel: 'dono' });
    const u = await ctx.plataforma('usuarios').where({ email: 'beta@x.com' }).first('termos_versao', 'confirmar_email');
    expect(u.termos_versao).toBe(TERMOS_VERSAO);
    expect(!!u.confirmar_email).toBe(false);
    // convite vale uma vez; e-mail que já tem conta não recebe convite
    expect((await cadastro({ email: 'beta@x.com', convite: token })).status).toBe(400);
    expect((await ctx.admin.post('/api/plataforma/convites').send({ email: 'beta@x.com' })).status).toBe(409);
    const lista = (await ctx.admin.get('/api/plataforma/convites')).body;
    expect(lista[0]).toMatchObject({ email: 'beta@x.com', usado_por: 'Beta Tester' });
  });

  it('convite cancelado não serve', async () => {
    await ctx.admin.post('/api/plataforma/convites').send({ email: 'cancel@x.com' }).expect(201);
    const token = tokenDo('/cadastro\\?convite=');
    const id = (await ctx.admin.get('/api/plataforma/convites')).body.find(
      (c: { email: string }) => c.email === 'cancel@x.com',
    ).id;
    await ctx.admin.delete(`/api/plataforma/convites/${id}`).expect(204);
    expect((await request(ctx.app).get(`/api/auth/cadastro/convite/${token}`)).status).toBe(400);
  });
});

describe('cadastro aberto: confirmação de e-mail', () => {
  beforeAll(async () => {
    await ctx.admin.put('/api/settings').send({ cadastro_aberto: true }).expect(200);
  });
  afterAll(async () => {
    await ctx.admin.put('/api/settings').send({ cadastro_aberto: false }).expect(200);
  });

  it('cria pendente; só entra depois de confirmar; o link cria o espaço e já entra', async () => {
    const r = await cadastro({ email: 'aberto@x.com', espaco: 'Casa' });
    expect(r.body).toEqual({ entrou: false, email: 'aberto@x.com' });
    expect(r.headers['set-cookie']).toBeUndefined();
    const login = await request(ctx.app).post('/api/auth/login').send({ email: 'aberto@x.com', senha: SENHA });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('EMAIL_NAO_CONFIRMADO');

    const token = tokenDo('/confirmar-email\\?token=');
    const a = request.agent(ctx.app);
    const ok = await a.post('/api/auth/cadastro/confirmar').send({ token });
    expect(ok.status).toBe(200);
    expect(ok.body.espaco).toMatchObject({ nome: 'Casa', papel: 'dono' });
    expect((await request(ctx.app).post('/api/auth/cadastro/confirmar').send({ token })).status).toBe(400);
    await ctx.login('aberto@x.com', SENHA);
  });

  it('e-mail que já tem conta: mesma resposta (não revela) e aviso por e-mail', async () => {
    const r = await cadastro({ email: 'ana@sistema.com' });
    expect(r.body).toEqual({ entrou: false, email: 'ana@sistema.com' });
    expect(ctx.mailer.sent.at(-1)!.text).toMatch(/já existe/);
    expect((await ctx.login('ana@sistema.com', 'senha123')).constructor).toBeTruthy(); // senha dela não mudou
  });

  it('cadastro que nunca confirmou sai depois de 7 dias', async () => {
    await cadastro({ email: 'esquecido@x.com' }).expect(200);
    await ctx.plataforma('usuarios').where({ email: 'esquecido@x.com' }).update({ criado_em: '2000-01-01 00:00:00' });
    expect(await limparCadastrosPendentes()).toBe(1);
    expect(await ctx.plataforma('usuarios').where({ email: 'esquecido@x.com' }).first()).toBeUndefined();
  });
});

describe('meus dados e exclusão da conta', () => {
  let eu: request.Agent;
  let euId: number;
  let meuEspaco: number;

  beforeAll(async () => {
    const perfil = await ctx.plataforma('perfis').where({ nome: 'Membro' }).first('id');
    [euId] = await ctx.plataforma('usuarios').insert({
      nome: 'Titular dos Dados',
      email: 'titular@x.com',
      perfil_id: perfil.id,
      senha: await hashPassword(SENHA),
      ativo: 1,
      trocar_senha: 0,
      criado_em: nowLocal(),
    });
    meuEspaco = await criarEspaco({ nome: 'Espaço do titular', donoId: euId });
    const db = await abrirEspaco(meuEspaco);
    for (const [t, ent] of Object.entries(fixtureEntities)) await createEntityTable(db, t, ent);
    await db('clientes').insert({ nome: 'Cliente do titular', email: 'c@t.com', ativo: 1, criado_em: nowLocal() });
    await adicionarMembro(ctx.espacoId, euId, 'editor'); // também participa do espaço de teste (de outra pessoa)
    eu = await ctx.login('titular@x.com', SENHA);
    await eu.post('/api/auth/espaco').send({ id: ctx.espacoId }).expect(200);
    await eu.post('/api/clientes').send({ nome: 'Criado pelo titular', email: 'ct@x.com', ativo: true }).expect(201);
  });

  it('baixa os dados: conta (sem senha), espaços; dados completos só onde é dono', async () => {
    expect((await eu.post('/api/auth/meus-dados').send({ senha: 'errada' })).status).toBe(422);
    const r = await eu.post('/api/auth/meus-dados').send({ senha: SENHA });
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/attachment; filename="meus-dados-/);
    expect(r.body.conta.email).toBe('titular@x.com');
    expect(JSON.stringify(r.body)).not.toMatch(/"senha"|segredo_/);
    const meu = r.body.espacos.find((e: { id: number }) => e.id === meuEspaco);
    expect(meu.dados.clientes.map((c: { nome: string }) => c.nome)).toEqual(['Cliente do titular']);
    const deOutro = r.body.espacos.find((e: { id: number }) => e.id === ctx.espacoId);
    expect(Object.keys(deOutro.dados).sort()).toEqual(['notificacoes', 'preferencias']);
    expect(JSON.stringify(deOutro)).not.toContain('Padaria Bom Dia');
  });

  it('prévia: o espaço de que é a única dona sai junto', async () => {
    const r = await eu.get('/api/auth/excluir-conta');
    expect(r.body.espacos).toEqual([{ id: meuEspaco, nome: 'Espaço do titular', membros: 0 }]);
  });

  it('exclui: conta some, espaço próprio guardado para apagar em 30 dias, nome some do espaço alheio', async () => {
    expect((await eu.post('/api/auth/excluir-conta').send({ senha: SENHA, confirmacao: 'sim' })).status).toBe(422);
    const r = await eu.post('/api/auth/excluir-conta').send({ senha: SENHA, confirmacao: 'EXCLUIR' });
    expect(r.status).toBe(200);
    expect(r.body.espacos_excluidos).toEqual(['Espaço do titular']);
    expect((await eu.get('/api/auth/me')).status).toBe(401);
    expect(await ctx.plataforma('usuarios').where({ id: euId }).first()).toBeUndefined();
    expect(await ctx.plataforma('espacos').where({ id: meuEspaco }).first()).toBeUndefined();
    expect(await ctx.plataforma('espacos_excluidos').where({ espaco_id: meuEspaco }).first()).toBeTruthy();
    // no espaço de teste: o cliente que criou continua, sem o nome dele
    const copia = await ctx.db('usuarios').where({ id: euId }).first('nome', 'email');
    expect(copia.nome).toBe('(conta excluída)');
    const logs = JSON.stringify(await ctx.db('logs').where({ usuario_id: euId }).select('usuario'));
    expect(logs).not.toContain('Titular');
    expect(JSON.stringify(await ctx.plataforma('logs').select('usuario', 'detalhe'))).not.toContain('titular@x.com');
    expect(ctx.mailer.sent.at(-1)!.to).toBe('titular@x.com');
    expect((await request(ctx.app).post('/api/auth/login').send({ email: 'titular@x.com', senha: SENHA })).status).toBe(
      401,
    );

    await ctx.plataforma('espacos_excluidos').update({ excluido_em: '2000-01-01 00:00:00' });
    expect(await apagarEspacosExcluidos()).toBeGreaterThan(0);
    expect((await ctx.plataforma('espacos_excluidos').where({ espaco_id: meuEspaco }).first()).apagado_em).toBeTruthy();
  });

  it('o único administrador não exclui a própria conta', async () => {
    const r = await ctx.admin.post('/api/auth/excluir-conta').send({ senha: 'admin123', confirmacao: 'EXCLUIR' });
    expect(r.status).toBe(409);
  });
});

describe('feedback', () => {
  it('qualquer pessoa logada envia; o administrador lê no painel e recebe e-mail', async () => {
    const r = await ctx.operador
      .post('/api/feedback')
      .send({ tipo: 'sugestao', mensagem: 'Poderia ter um filtro por tag', pagina: '/clientes', versao: '0.19.0' });
    expect(r.status).toBe(201);
    expect(ctx.mailer.sent.at(-1)!).toMatchObject({ to: 'admin@sistema.com', subject: 'Sugestão de Ana Souza' });
    expect((await ctx.operador.post('/api/feedback').send({ tipo: 'outro', mensagem: 'x' })).status).toBe(422);
    expect((await ctx.operador.get('/api/plataforma/feedbacks')).status).toBe(403);
    const lista = (await ctx.admin.get('/api/plataforma/feedbacks')).body;
    expect(lista[0]).toMatchObject({ nome: 'Ana Souza', tipo: 'sugestao', pagina: '/clientes', lido_em: null });
    await ctx.admin.put(`/api/plataforma/feedbacks/${lista[0].id}`).send({ lido: true }).expect(200);
    expect((await ctx.admin.get('/api/plataforma/feedbacks')).body[0].lido_em).toBeTruthy();
  });
});
