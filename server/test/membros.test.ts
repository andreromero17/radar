import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mainEntities } from '@frame/shared';
import { hashPassword } from '../src/auth/password';
import { adicionarMembro, criarEspaco } from '../src/espacos';
import { nowLocal } from '../src/utils/time';
import { makeTestApp, type TestCtx } from './helpers';

// Fase 5B: papéis no espaço (dono/editor/leitor), membros, convites e espaços do usuário
let ctx: TestCtx;
let perfilMembro: number;
const SENHA = 'senhaBoa123';

async function criarConta(nome: string, email: string, perfil = perfilMembro) {
  const [id] = await ctx.plataforma('usuarios').insert({
    nome,
    email,
    perfil_id: perfil,
    senha: await hashPassword(SENHA),
    ativo: 1,
    trocar_senha: 0,
    criado_em: nowLocal(),
  });
  return Number(id);
}

/** Token do último convite enviado (o link vai só no e-mail) */
const ultimoToken = () => {
  const m = ctx.mailer.sent.at(-1)!;
  return /\/convite\/([A-Za-z0-9_-]+)/.exec(m.text)![1];
};

beforeAll(async () => {
  ctx = await makeTestApp();
  perfilMembro = (await ctx.plataforma('perfis').where({ nome: 'Membro' }).first('id')).id;
});
afterAll(() => ctx.db.destroy());

describe('papéis no espaço', () => {
  let leitor: request.Agent;
  let editor: request.Agent;
  let dono: request.Agent;
  beforeAll(async () => {
    for (const [email, papel] of [
      ['leitor@x.com', 'leitor'],
      ['editor@x.com', 'editor'],
      ['dono2@x.com', 'dono'],
    ] as const)
      await adicionarMembro(ctx.espacoId, await criarConta(papel, email), papel);
    leitor = await ctx.login('leitor@x.com', SENHA);
    editor = await ctx.login('editor@x.com', SENHA);
    dono = await ctx.login('dono2@x.com', SENHA);
  });

  it('leitor vê tudo e não altera nada', async () => {
    expect((await leitor.get('/api/clientes')).status).toBe(200);
    for (const [ent] of mainEntities()) {
      expect((await leitor.post(`/api/${ent}`).send({})).status, `POST ${ent}`).toBe(403);
      expect((await leitor.put(`/api/${ent}/1`).send({})).status, `PUT ${ent}`).toBe(403);
      expect((await leitor.delete(`/api/${ent}/1`)).status, `DELETE ${ent}`).toBe(403);
      expect((await leitor.post(`/api/${ent}/lote`).send({ ids: [1], acao: 'excluir' })).status).toBe(403);
    }
    expect((await leitor.post('/api/clientes/1/anexos?nome=a.txt').send('x')).status).toBe(403);
    expect((await leitor.post('/api/clientes/importar').send('x')).status).toBe(403);
    expect((await leitor.put('/api/settings/app').send({})).status).toBe(403);
    expect((await leitor.get('/api/backup/info')).status).toBe(403);
    expect((await leitor.get('/api/membros')).status).toBe(200);
    expect((await leitor.post('/api/membros/convites').send({ email: 'a@b.com', papel: 'leitor' })).status).toBe(403);
    const me = (await leitor.get('/api/auth/me')).body;
    expect(me.espaco.papel).toBe('leitor');
  });

  it('editor com perfil completo altera os dados, mas não backup, configurações nem membros', async () => {
    const r = await editor.post('/api/clientes').send({ nome: 'Do editor', email: 'ed@x.com', ativo: true });
    expect(r.status).toBe(201);
    expect((await editor.delete(`/api/clientes/${r.body.id}`)).status).toBe(204);
    expect((await editor.get('/api/backup/info')).status).toBe(403);
    expect((await editor.put('/api/settings/app').send({})).status).toBe(403);
    expect((await editor.put('/api/membros/1').send({ papel: 'leitor' })).status).toBe(403);
    expect((await editor.get('/api/membros')).body.convites).toEqual([]);
    // usuários e perfis são da plataforma: o perfil "Membro" não dá nada lá
    expect((await editor.post('/api/usuarios').send({})).status).toBe(403);
  });

  it('dono (sem ser administrador) gerencia o espaço, mas não a identidade visual', async () => {
    expect((await dono.get('/api/backup/info')).status).toBe(200);
    expect((await dono.put('/api/settings/app').send({})).status).toBe(200);
    expect((await dono.put('/api/settings').send({ nome_sistema: 'Hack' })).status).toBe(403);
    expect((await dono.post('/api/perfis').send({ nome: 'X' })).status).toBe(403);
    expect((await dono.get('/api/membros')).body.pode_gerenciar).toBe(true);
  });

  it('editor com perfil restrito segue o perfil (Ana: operador não exclui cliente)', async () => {
    expect((await ctx.operador.delete('/api/clientes/1')).status).toBe(403);
    expect((await ctx.operador.get('/api/auth/me')).body.espaco.papel).toBe('editor');
  });
});

describe('membros', () => {
  let ze: request.Agent;
  let zeId: number;
  beforeAll(async () => {
    zeId = await criarConta('Zé', 'ze@membro.com');
    await adicionarMembro(ctx.espacoId, zeId, 'editor');
    ze = await ctx.login('ze@membro.com', SENHA);
  });

  it('lista membros com papel', async () => {
    const r = await ctx.admin.get('/api/membros');
    expect(r.status).toBe(200);
    expect(r.body.membros.find((m: { email: string }) => m.email === 'ze@membro.com')).toMatchObject({
      papel: 'editor',
      ativo: true,
    });
  });

  it('dono muda o papel e o efeito é imediato', async () => {
    expect((await ctx.admin.put(`/api/membros/${zeId}`).send({ papel: 'leitor' })).body.papel).toBe('leitor');
    expect((await ze.post('/api/clientes').send({ nome: 'Z', ativo: true })).status).toBe(403);
    await ctx.admin.put(`/api/membros/${zeId}`).send({ papel: 'editor' }).expect(200);
    expect((await ze.post('/api/clientes').send({ nome: 'Z', email: 'z@z.com', ativo: true })).status).toBe(201);
  });

  it('inativado perde o acesso na hora; reativado volta', async () => {
    await ctx.admin.put(`/api/membros/${zeId}`).send({ ativo: false }).expect(200);
    const r = await ze.get('/api/clientes');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('SEM_ESPACO');
    await ctx.admin.put(`/api/membros/${zeId}`).send({ ativo: true }).expect(200);
    expect((await ze.get('/api/clientes')).status).toBe(200);
  });

  it('todo espaço tem ao menos um dono ativo', async () => {
    const admin = await ctx.plataforma('usuarios').where({ email: 'admin@sistema.com' }).first('id');
    // há outro dono (dono2): o admin pode virar editor; mas não dá para tirar os dois
    const dono2 = await ctx.plataforma('usuarios').where({ email: 'dono2@x.com' }).first('id');
    await ctx.admin.put(`/api/membros/${dono2.id}`).send({ papel: 'editor' }).expect(200);
    expect((await ctx.admin.put(`/api/membros/${admin.id}`).send({ papel: 'leitor' })).status).toBe(409);
    expect((await ctx.admin.put(`/api/membros/${admin.id}`).send({ ativo: false })).status).toBe(409);
    expect((await ctx.admin.delete(`/api/membros/${admin.id}`)).status).toBe(409);
    expect((await ctx.admin.post('/api/membros/sair')).status).toBe(409);
    await ctx.admin.put(`/api/membros/${dono2.id}`).send({ papel: 'dono' }).expect(200);
  });

  it('removido some da lista e a cópia no espaço fica inativa (os registros antigos mantêm o nome)', async () => {
    await ctx.db('notificacoes').insert({
      usuario_id: zeId,
      tipo: 't',
      chave: 'k',
      nivel: 'info',
      titulo: 'Aviso do Zé',
      criada_em: nowLocal(),
    });
    await ctx.db('preferencias').insert({ usuario_id: zeId, chave: 'painel', valor: '{}', atualizado_em: nowLocal() });
    await ctx.admin.delete(`/api/membros/${zeId}`).expect(204);
    // avisos e preferências dele neste espaço saem junto
    expect(await ctx.db('notificacoes').where({ usuario_id: zeId }).first()).toBeUndefined();
    expect(await ctx.db('preferencias').where({ usuario_id: zeId }).first()).toBeUndefined();
    expect((await ze.get('/api/clientes')).status).toBe(403);
    const lista = (await ctx.admin.get('/api/membros')).body.membros;
    expect(lista.some((m: { usuario_id: number }) => m.usuario_id === zeId)).toBe(false);
    expect(!!(await ctx.db('usuarios').where({ id: zeId }).first('ativo')).ativo).toBe(false);
    expect((await ctx.admin.put(`/api/membros/${zeId}`).send({ papel: 'leitor' })).status).toBe(404);
  });

  it('membro comum pode sair do espaço', async () => {
    const id = await criarConta('Sai', 'sai@x.com');
    await adicionarMembro(ctx.espacoId, id, 'leitor');
    const sai = await ctx.login('sai@x.com', SENHA);
    expect((await sai.post('/api/membros/sair')).status).toBe(200);
    expect((await sai.get('/api/clientes')).body.code).toBe('SEM_ESPACO');
  });

  it('o dono de outro espaço não mexe nos membros deste', async () => {
    const outroId = await criarConta('Outro dono', 'outro@x.com');
    await criarEspaco({ nome: 'Do outro', donoId: outroId });
    const outro = await ctx.login('outro@x.com', SENHA);
    const ana = await ctx.plataforma('usuarios').where({ email: 'ana@sistema.com' }).first('id');
    expect((await outro.put(`/api/membros/${ana.id}`).send({ papel: 'leitor' })).status).toBe(404);
    expect((await outro.delete(`/api/membros/${ana.id}`)).status).toBe(404);
    const lista = (await outro.get('/api/membros')).body.membros;
    expect(lista.map((m: { email: string }) => m.email)).toEqual(['outro@x.com']);
  });
});

describe('convites', () => {
  it('pessoa nova: convite → link → cria a conta → entra como leitor', async () => {
    const r = await ctx.admin.post('/api/membros/convites').send({ email: ' Nova@Pessoa.com ', papel: 'leitor' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ email: 'nova@pessoa.com', papel: 'leitor', expirado: false });
    const mail = ctx.mailer.sent.at(-1)!;
    expect(mail.to).toBe('nova@pessoa.com');
    const token = ultimoToken();
    // o token não fica no banco (só o hash)
    expect(JSON.stringify(await ctx.plataforma('convites').select())).not.toContain(token);

    const anon = request.agent(ctx.app);
    const info = await anon.get(`/api/auth/convites/${token}`);
    expect(info.body).toMatchObject({
      espaco: 'Espaço de teste',
      papel: 'leitor',
      tem_conta: false,
      logado_como: null,
    });
    expect(
      (await anon.post(`/api/auth/convites/${token}/aceitar`).send({ nome: 'N', senha: '1', aceite: true })).status,
    ).toBe(422);
    const ok = await anon
      .post(`/api/auth/convites/${token}/aceitar`)
      .send({ nome: 'Nova Pessoa', senha: SENHA, aceite: true });
    expect(ok.status).toBe(200);
    const me = (await anon.get('/api/auth/me')).body;
    expect(me).toMatchObject({ email: 'nova@pessoa.com', perfil: 'Membro', admin: false });
    expect(me.espaco).toMatchObject({ id: ctx.espacoId, papel: 'leitor' });
    expect((await anon.get('/api/clientes')).status).toBe(200);
    expect((await anon.post('/api/clientes').send({ nome: 'x' })).status).toBe(403);
    // uma vez só
    expect((await request(ctx.app).get(`/api/auth/convites/${token}`)).status).toBe(400);
    expect(
      (
        await request(ctx.app)
          .post(`/api/auth/convites/${token}/aceitar`)
          .send({ nome: 'Outro', senha: SENHA, aceite: true })
      ).status,
    ).toBe(400);
    // aparece no log do espaço
    const logs = (await ctx.admin.get('/api/logs?pageSize=50')).body.rows.map((l: { acao: string }) => l.acao);
    expect(logs).toEqual(expect.arrayContaining(['convite enviado', 'convite aceito']));
  });

  it('quem já tem conta precisa entrar com ela — e só ela aceita', async () => {
    const id = await criarConta('Já tenho', 'tenho@conta.com');
    await criarEspaco({ nome: 'Meu', donoId: id });
    await ctx.admin.post('/api/membros/convites').send({ email: 'tenho@conta.com', papel: 'editor' }).expect(201);
    const token = ultimoToken();
    const anon = request.agent(ctx.app);
    expect((await anon.get(`/api/auth/convites/${token}`)).body.tem_conta).toBe(true);
    const sem = await anon
      .post(`/api/auth/convites/${token}/aceitar`)
      .send({ nome: 'Fulano', senha: SENHA, aceite: true });
    expect(sem.status).toBe(401);
    expect(sem.body.code).toBe('CONVITE_LOGIN');
    // outra pessoa logada não aceita por ela
    expect((await ctx.operador.post(`/api/auth/convites/${token}/aceitar`)).status).toBe(403);
    const eu = await ctx.login('tenho@conta.com', SENHA);
    expect((await eu.get(`/api/auth/convites/${token}`)).body.logado_como.email).toBe('tenho@conta.com');
    expect((await eu.post(`/api/auth/convites/${token}/aceitar`)).body.espaco_id).toBe(ctx.espacoId);
    const me = (await eu.get('/api/auth/me')).body;
    expect(me.espaco).toMatchObject({ id: ctx.espacoId, papel: 'editor' });
    expect(me.espacos).toHaveLength(2);
  });

  it('cancelado, reenviado (link antigo para de valer) e expirado', async () => {
    const c = (await ctx.admin.post('/api/membros/convites').send({ email: 'c@x.com', papel: 'leitor' })).body;
    const antigo = ultimoToken();
    await ctx.admin.post(`/api/membros/convites/${c.id}/reenviar`).expect(200);
    const novo = ultimoToken();
    expect(novo).not.toBe(antigo);
    expect((await request(ctx.app).get(`/api/auth/convites/${antigo}`)).status).toBe(400);
    expect((await request(ctx.app).get(`/api/auth/convites/${novo}`)).status).toBe(200);
    await ctx.plataforma('convites').where({ id: c.id }).update({ expira_em: '2000-01-01 00:00:00' });
    expect((await request(ctx.app).get(`/api/auth/convites/${novo}`)).status).toBe(400);
    const lista = (await ctx.admin.get('/api/membros')).body.convites;
    expect(lista.find((x: { id: number }) => x.id === c.id).expirado).toBe(true);
    await ctx.admin.delete(`/api/membros/convites/${c.id}`).expect(204);
    expect((await ctx.admin.get('/api/membros')).body.convites.some((x: { id: number }) => x.id === c.id)).toBe(false);
  });

  it('convidar quem já participa é recusado; convite novo substitui o anterior', async () => {
    expect(
      (await ctx.admin.post('/api/membros/convites').send({ email: 'ana@sistema.com', papel: 'leitor' })).status,
    ).toBe(409);
    await ctx.admin.post('/api/membros/convites').send({ email: 'dup@x.com', papel: 'leitor' }).expect(201);
    const primeiro = ultimoToken();
    await ctx.admin.post('/api/membros/convites').send({ email: 'dup@x.com', papel: 'editor' }).expect(201);
    expect((await request(ctx.app).get(`/api/auth/convites/${primeiro}`)).status).toBe(400);
    const pend = (await ctx.admin.get('/api/membros')).body.convites.filter(
      (x: { email: string }) => x.email === 'dup@x.com',
    );
    expect(pend).toHaveLength(1);
    expect(pend[0].papel).toBe('editor');
    expect((await ctx.admin.post('/api/membros/convites').send({ email: 'xx', papel: 'chefe' })).status).toBe(422);
  });

  it('token inventado: 400, e muitas tentativas bloqueiam o IP', async () => {
    let ultimo = 0;
    for (let i = 0; i < 35; i++) ultimo = (await request(ctx.app).get(`/api/auth/convites/inventado${i}`)).status;
    expect(ultimo).toBe(429);
  });
});

describe('espaços do usuário', () => {
  it('dono cria um espaço novo e entra nele (vazio); quem só é convidado não cria', async () => {
    const id = await criarConta('Assinante', 'assinante@x.com');
    await criarEspaco({ nome: 'Pessoal do assinante', donoId: id });
    const a = await ctx.login('assinante@x.com', SENHA);
    const r = await a.post('/api/espacos').send({ nome: 'Empresa do assinante', tipo: 'empresa' });
    expect(r.status).toBe(201);
    const me = (await a.get('/api/auth/me')).body;
    expect(me.espaco).toMatchObject({ nome: 'Empresa do assinante', tipo: 'empresa', papel: 'dono' });
    // espaço novo, banco novo: só o registro da criação
    expect((await a.get('/api/logs')).body.rows.map((l: { acao: string }) => l.acao)).toEqual(['espaço criado']);
    await a.put('/api/espaco').send({ nome: 'Empresa X', tipo: 'empresa' }).expect(200);
    expect((await a.get('/api/auth/me')).body.espaco.nome).toBe('Empresa X');
    expect((await a.post('/api/espacos').send({ nome: '', tipo: 'outro' })).status).toBe(422);

    const conv = await criarConta('Só convidado', 'soconvidado@x.com');
    await adicionarMembro(ctx.espacoId, conv, 'editor');
    const c = await ctx.login('soconvidado@x.com', SENHA);
    expect((await c.post('/api/espacos').send({ nome: 'Meu', tipo: 'pessoal' })).status).toBe(403);
    expect((await c.get('/api/membros')).body.pode_criar_espaco).toBe(false);
  });
});
