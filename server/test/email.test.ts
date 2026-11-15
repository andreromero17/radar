import pino from 'pino';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createMailer, EmailNaoEnviado } from '../src/services/mailer';
import { makeTestApp, type TestCtx } from './helpers';

// Falha no servidor de e-mail (ex.: senha do Gmail recusada) não pode virar "Erro interno" sem explicação
let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});
afterEach(() => {
  ctx.mailer.falhar = false;
});
afterAll(() => ctx.db.destroy());

describe('falha ao enviar e-mail', () => {
  it('o mailer SMTP transforma a falha em EmailNaoEnviado (502, EMAIL_FALHOU) e registra o motivo no log', async () => {
    const linhas: string[] = [];
    const logger = pino({ level: 'error' }, { write: (l: string) => linhas.push(l) });
    const mailer = createMailer(
      { SMTP_HOST: '127.0.0.1', SMTP_PORT: 1, smtpSecure: false, SMTP_FROM: 'x <x@x.com>' },
      logger,
    );
    const err = await mailer.send({ to: 'a@b.com', subject: 'Teste', text: 'oi' }).catch((e) => e);
    expect(err).toBeInstanceOf(EmailNaoEnviado);
    expect(err.status).toBe(502);
    expect(err.code).toBe('EMAIL_FALHOU');
    expect(linhas.join('')).toContain('falha ao enviar e-mail');
  });

  it('convite para o espaço: 502 com mensagem clara, convite fica pendente e o Reenviar funciona depois', async () => {
    ctx.mailer.falhar = true;
    const r = await ctx.admin.post('/api/membros/convites').send({ email: 'sem@email.com', papel: 'leitor' });
    expect(r.status).toBe(502);
    expect(r.body.code).toBe('EMAIL_FALHOU');
    expect(r.body.error).toContain('O convite foi registrado');
    const lista = (await ctx.admin.get('/api/membros')).body.convites as { id: number; email: string }[];
    const convite = lista.find((c) => c.email === 'sem@email.com')!;
    expect(convite).toBeTruthy();

    ctx.mailer.falhar = false;
    await ctx.admin.post(`/api/membros/convites/${convite.id}/reenviar`).send({}).expect(200);
    expect(ctx.mailer.sent.at(-1)?.to).toBe('sem@email.com');
  });

  it('reenviar com falha: 502 com a mensagem do e-mail', async () => {
    await ctx.admin.post('/api/membros/convites').send({ email: 'outro@email.com', papel: 'leitor' }).expect(201);
    const id = ((await ctx.admin.get('/api/membros')).body.convites as { id: number; email: string }[]).find(
      (c) => c.email === 'outro@email.com',
    )!.id;
    ctx.mailer.falhar = true;
    const r = await ctx.admin.post(`/api/membros/convites/${id}/reenviar`).send({});
    expect(r.status).toBe(502);
    expect(r.body.error).toContain('Não foi possível enviar o e-mail');
  });

  it('convite da plataforma: 502 com mensagem clara e o convite registrado', async () => {
    ctx.mailer.falhar = true;
    const r = await ctx.admin.post('/api/plataforma/convites').send({ email: 'beta@teste.com' });
    expect(r.status).toBe(502);
    expect(r.body.error).toContain('O convite foi registrado');
    expect(await ctx.plataforma('convites_plataforma').where({ email: 'beta@teste.com' }).first()).toBeTruthy();
  });

  it('esqueci a senha: com falha no e-mail a resposta continua igual (não revela quem é cadastrado)', async () => {
    ctx.mailer.falhar = true;
    const r1 = await request(ctx.app).post('/api/auth/esqueci').send({ email: 'ana@sistema.com' });
    const r2 = await request(ctx.app).post('/api/auth/esqueci').send({ email: 'ninguem@sistema.com' });
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual(r2.body);
    const log = await ctx.plataforma('logs').where({ entidade: 'auth' }).orderBy('id', 'desc').first('acao');
    expect(log.acao).toBe('redefinição solicitada (e-mail não enviado)');
  });
});
