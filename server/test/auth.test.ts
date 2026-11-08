import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, randomPassword, verifyPassword } from '../src/auth/password';
import { RateLimiter } from '../src/auth/rateLimit';
import { APP_URL, makeTestApp, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => ctx.db.destroy());

const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');

describe('senhas', () => {
  it('hash e verificação', async () => {
    const h = await hashPassword('segredo123');
    expect(h).toMatch(/^scrypt\$\d+\$8\$1\$/);
    expect(h).not.toContain('segredo123');
    expect(await verifyPassword('segredo123', h)).toBe(true);
    expect(await verifyPassword('errado123', h)).toBe(false);
    expect(await verifyPassword('qualquer', null)).toBe(false);
  });

  it('senha aleatória atende à política', () => {
    for (let i = 0; i < 20; i++) expect(randomPassword()).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{12}$/);
  });
});

describe('login e sessão', () => {
  it('rotas protegidas exigem login', async () => {
    expect((await request(ctx.app).get('/api/clientes')).status).toBe(401);
    expect((await request(ctx.app).get('/api/meta')).status).toBe(401);
    expect((await request(ctx.app).get('/api/settings')).status).toBe(401);
  });

  it('rotas públicas funcionam sem login', async () => {
    expect((await request(ctx.app).get('/api/health')).status).toBe(200);
    const pub = await request(ctx.app).get('/api/settings/publicas');
    expect(Object.keys(pub.body).sort()).toEqual([
      'cor_primaria',
      'cor_secundaria',
      'estilo_menu',
      'icone',
      'logo',
      'nome_sistema',
    ]);
    expect(pub.body).not.toHaveProperty('url_ajuda');
  });

  it('login cria cookie httpOnly e devolve o usuário com permissões', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: ' ANA@sistema.com ', senha: 'senha123' });
    expect(res.status).toBe(200);
    expect(cookieOf(res)).toMatch(/sid=.+HttpOnly.*SameSite=Lax/i);
    expect(cookieOf(res)).not.toMatch(/Max-Age/i); // sem "lembrar de mim": cookie de sessão
    expect(res.body).toMatchObject({ email: 'ana@sistema.com', perfil: 'Operador', admin: false });
    expect(res.body.permissoes.chamados).toEqual(['ver', 'criar', 'editar', 'excluir']);
    expect(res.body).not.toHaveProperty('senha');
  });

  it('"lembrar de mim" gera cookie persistente', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'ana@sistema.com', senha: 'senha123', lembrar: true });
    expect(cookieOf(res)).toMatch(/Max-Age=2592000/);
  });

  it('erro genérico para e-mail inexistente e senha errada (não revela quem existe)', async () => {
    const a = await request(ctx.app).post('/api/auth/login').send({ email: 'ninguem@x.com', senha: 'x' });
    const b = await request(ctx.app).post('/api/auth/login').send({ email: 'ana@sistema.com', senha: 'errada' });
    expect(a.status).toBe(401);
    expect(b.body).toEqual(a.body);
  });

  it('usuário inativo não entra', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'carla@sistema.com', senha: 'senha123' });
    expect(res.status).toBe(403);
  });

  it('logout invalida a sessão no servidor', async () => {
    const agent = await ctx.login('ana@sistema.com', 'senha123');
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('cookie forjado ou sessão vencida não autenticam', async () => {
    expect((await request(ctx.app).get('/api/auth/me').set('Cookie', 'sid=inventado')).status).toBe(401);
    const agent = await ctx.login('ana@sistema.com', 'senha123');
    await ctx.db('sessoes').where({ usuario_id: 2 }).update({ expira_em: '2000-01-01 00:00:00' });
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('desativar o usuário derruba as sessões dele', async () => {
    const agent = await ctx.login('ana@sistema.com', 'senha123');
    await ctx.admin.put('/api/usuarios/2').send({ ativo: false }).expect(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    await ctx.admin.put('/api/usuarios/2').send({ ativo: true }).expect(200);
  });

  it('registra login e falha de login no log, com IP', async () => {
    const falhas = await ctx.db('logs').where({ acao: 'login falhou' });
    expect(falhas.length).toBeGreaterThan(0);
    const login = await ctx.db('logs').where({ acao: 'login' }).orderBy('id', 'desc').first();
    expect(login.usuario_id).toBeTruthy();
    expect(login.ip).toBeTruthy();
  });
});

describe('limite de tentativas', () => {
  it('bloqueia após 5 senhas erradas para o mesmo e-mail', async () => {
    const tentar = () => request(ctx.app).post('/api/auth/login').send({ email: 'bruno@sistema.com', senha: 'errada' });
    for (let i = 0; i < 5; i++) expect((await tentar()).status).toBe(401);
    const bloqueado = await tentar();
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error).toMatch(/Muitas tentativas/);
    // nem a senha certa passa durante o bloqueio
    const certa = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'bruno@sistema.com', senha: 'senha123' });
    expect(certa.status).toBe(429);
  });

  it('janela do limitador expira', () => {
    const rl = new RateLimiter(2, 1);
    rl.hit('x');
    expect(rl.hit('x')).toBeGreaterThan(0);
    return new Promise<void>((r) =>
      setTimeout(() => {
        expect(rl.blockedFor('x')).toBe(0);
        r();
      }, 5),
    );
  });
});

describe('troca de senha', () => {
  it('exige a senha atual e aplica a política', async () => {
    const agent = await ctx.login('admin@sistema.com', 'admin123');
    const errada = await agent.put('/api/auth/senha').send({ atual: 'xxx', nova: 'nova12345' });
    expect(errada.body.errors).toEqual({ atual: 'Senha atual incorreta' });
    const fraca = await agent.put('/api/auth/senha').send({ atual: 'admin123', nova: 'curta' });
    expect(fraca.body.errors.nova).toBe('Mínimo de 8 caracteres');
  });

  it('troca, mantém a sessão atual e derruba as outras', async () => {
    const a = await ctx.login('ana@sistema.com', 'senha123');
    const b = await ctx.login('ana@sistema.com', 'senha123');
    const res = await a.put('/api/auth/senha').send({ atual: 'senha123', nova: 'outra1234' });
    expect(res.status).toBe(200);
    expect((await a.get('/api/auth/me')).status).toBe(200);
    expect((await b.get('/api/auth/me')).status).toBe(401);
    await ctx.login('ana@sistema.com', 'outra1234');
    await a.put('/api/auth/senha').send({ atual: 'outra1234', nova: 'senha123' }).expect(200);
  });

  it('troca obrigatória bloqueia o sistema até definir nova senha', async () => {
    await ctx.admin.put('/api/usuarios/2').send({ senha: 'provisoria1', trocar_senha: true }).expect(200);
    const agent = await ctx.login('ana@sistema.com', 'provisoria1');
    const bloqueado = await agent.get('/api/clientes');
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.body.code).toBe('TROCAR_SENHA');
    expect((await agent.get('/api/auth/me')).body.trocar_senha).toBe(true);

    await agent.put('/api/auth/senha').send({ atual: 'provisoria1', nova: 'senha123' }).expect(200);
    expect((await agent.get('/api/clientes')).status).toBe(200);
  });
});

describe('esqueci minha senha', () => {
  const tokenDo = (text: string) => /token=([\w-]+)/.exec(text)?.[1] ?? '';

  it('responde igual para e-mail existente e inexistente; só o existente recebe e-mail', async () => {
    ctx.mailer.sent.length = 0;
    const a = await request(ctx.app).post('/api/auth/esqueci').send({ email: 'ninguem@x.com' });
    const b = await request(ctx.app).post('/api/auth/esqueci').send({ email: 'bruno@sistema.com' });
    expect(a.body).toEqual(b.body);
    expect(ctx.mailer.sent).toHaveLength(1);
    expect(ctx.mailer.sent[0].to).toBe('bruno@sistema.com');
    expect(ctx.mailer.sent[0].text).toContain(`${APP_URL}/redefinir-senha?token=`);
  });

  it('o link redefine a senha uma única vez e derruba sessões abertas', async () => {
    const sessao = await ctx.login('admin@sistema.com', 'admin123');
    ctx.mailer.sent.length = 0;
    await request(ctx.app).post('/api/auth/esqueci').send({ email: 'admin@sistema.com' });
    const token = tokenDo(ctx.mailer.sent[0].text);

    const valida = await request(ctx.app).post('/api/auth/redefinir/validar').send({ token });
    expect(valida.body).toEqual({ ok: true, nome: 'Usuário Administrador' });

    const fraca = await request(ctx.app).post('/api/auth/redefinir').send({ token, senha: '123' });
    expect(fraca.status).toBe(422);
    await request(ctx.app).post('/api/auth/redefinir').send({ token, senha: 'novaSenha1' }).expect(200);
    expect((await sessao.get('/api/auth/me')).status).toBe(401);

    const reuso = await request(ctx.app).post('/api/auth/redefinir').send({ token, senha: 'outraSenha1' });
    expect(reuso.status).toBe(400);
    await ctx.login('admin@sistema.com', 'novaSenha1');

    // volta a senha original para os demais testes
    await ctx
      .db('usuarios')
      .where({ email: 'admin@sistema.com' })
      .update({ senha: await hashPassword('admin123') });
  });

  it('link vencido não funciona', async () => {
    ctx.mailer.sent.length = 0;
    await request(ctx.app).post('/api/auth/esqueci').send({ email: 'ana@sistema.com' });
    const token = tokenDo(ctx.mailer.sent[0].text);
    await ctx.db('tokens_senha').update({ expira_em: '2000-01-01 00:00:00' });
    expect((await request(ctx.app).post('/api/auth/redefinir').send({ token, senha: 'novaSenha1' })).status).toBe(400);
  });
});

describe('proteções HTTP', () => {
  it('bloqueia escrita vinda de outra origem (CSRF)', async () => {
    const admin = await ctx.login('admin@sistema.com', 'admin123');
    const res = await admin.post('/api/clientes').set('Origin', 'https://site-malicioso.com').send({ nome: 'X' });
    expect(res.status).toBe(403);
    const ok = await admin.post('/api/clientes').set('Origin', APP_URL).send({ nome: 'Origem ok' });
    expect(ok.status).toBe(201);
  });

  it('envia cabeçalhos de segurança', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('HTTPS', () => {
  it('sem HTTPS não força upgrade nem HSTS', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});

describe('meu perfil', () => {
  it('altera o próprio nome e registra no log', async () => {
    const ana = await ctx.login('ana@sistema.com', 'senha123');
    const res = await ana.put('/api/auth/perfil').send({ nome: '  Ana S. Souza ' });
    expect(res.body.nome).toBe('Ana S. Souza');
    const log = await ctx.db('logs').where({ entidade: 'usuarios', registro_id: 2 }).orderBy('id', 'desc').first();
    expect(JSON.parse(log.alteracoes).nome.para).toBe('Ana S. Souza');
    expect((await ana.put('/api/auth/perfil').send({ nome: '' })).status).toBe(422);
    await ana.put('/api/auth/perfil').send({ nome: 'Ana Souza' }).expect(200);
  });

  it('lista as próprias sessões, marca a atual e não expõe o token', async () => {
    const a = await ctx.login('ana@sistema.com', 'senha123');
    await ctx.login('ana@sistema.com', 'senha123');
    const { body } = await a.get('/api/auth/sessoes');
    expect(body.length).toBeGreaterThanOrEqual(2);
    expect(body.filter((s: { atual: boolean }) => s.atual)).toHaveLength(1);
    expect(body[0].id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('encerra uma sessão específica e "todas as outras"', async () => {
    const a = await ctx.login('ana@sistema.com', 'senha123');
    const b = await ctx.login('ana@sistema.com', 'senha123');
    const c = await ctx.login('ana@sistema.com', 'senha123');
    const sessoes = (await a.get('/api/auth/sessoes')).body as { id: string; atual: boolean }[];
    const daB = (await b.get('/api/auth/sessoes')).body.find((s: { atual: boolean }) => s.atual).id;
    await a.delete(`/api/auth/sessoes/${daB}`).expect(204);
    expect((await b.get('/api/auth/me')).status).toBe(401);
    expect(sessoes.length).toBeGreaterThan(2);

    const r = await a.delete('/api/auth/sessoes');
    expect(r.body.encerradas).toBeGreaterThan(0);
    expect((await c.get('/api/auth/me')).status).toBe(401);
    expect((await a.get('/api/auth/me')).status).toBe(200);
  });

  it('não encerra sessão de outro usuário', async () => {
    const admin = await ctx.login('admin@sistema.com', 'admin123');
    const doAdmin = (await admin.get('/api/auth/sessoes')).body[0].id;
    const ana = await ctx.login('ana@sistema.com', 'senha123');
    expect((await ana.delete(`/api/auth/sessoes/${doAdmin}`)).status).toBe(404);
    expect((await admin.get('/api/auth/me')).status).toBe(200);
  });
});

describe('limite por IP', () => {
  it('logins bem-sucedidos não contam para o bloqueio do IP', async () => {
    for (let i = 0; i < 35; i++) await ctx.login('admin@sistema.com', 'admin123');
  });
});
