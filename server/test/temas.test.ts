import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestApp, type TestCtx } from './helpers';

// v0.7.0: tema do sistema (administrador) e aparência claro/escuro (cada usuário)
let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => ctx.db.destroy());

describe('tema e aparência', () => {
  it('tema é configuração pública, validada', async () => {
    expect((await ctx.admin.put('/api/settings').send({ tema: 'minimalista' })).status).toBe(200);
    expect((await ctx.admin.get('/api/settings/publicas')).body.tema).toBe('minimalista');
    const bad = await ctx.admin.put('/api/settings').send({ tema: 'neon' });
    expect(bad.status).toBe(422);
    expect(bad.body.errors.tema).toBeTruthy();
  });

  it('cada usuário escolhe a própria aparência, sem precisar de permissão', async () => {
    expect((await ctx.leitura.get('/api/auth/me')).body.aparencia).toBe('sistema');
    const r = await ctx.leitura.put('/api/auth/perfil').send({ aparencia: 'escuro' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ aparencia: 'escuro' });
    expect((await ctx.leitura.get('/api/auth/me')).body.aparencia).toBe('escuro');
    expect((await ctx.admin.get('/api/auth/me')).body.aparencia).toBe('sistema'); // não afeta os outros
    expect((await ctx.leitura.put('/api/auth/perfil').send({ aparencia: 'roxo' })).status).toBe(422);
  });

  it('aparência não aparece no cadastro de usuários nem pode ser mudada por lá', async () => {
    const lista = await ctx.admin.get('/api/usuarios');
    expect(lista.body.rows[0]).not.toHaveProperty('senha');
    const u = lista.body.rows.find((x: { email: string }) => x.email !== 'admin@sistema.com');
    await ctx.admin.put(`/api/usuarios/${u.id}`).send({ aparencia: 'claro' });
    const row = await ctx.plataforma('usuarios').where({ id: u.id }).first();
    expect(row.aparencia).not.toBe('claro');
  });
});

// v0.8.0: fonte do sistema (administrador) e tamanho do texto (cada usuário)
describe('fonte e tamanho do texto', () => {
  it('fonte é configuração pública, validada; padrão = a do tema', async () => {
    expect((await ctx.admin.get('/api/settings/publicas')).body.fonte).toBe('tema');
    expect((await ctx.admin.put('/api/settings').send({ fonte: 'roboto' })).status).toBe(200);
    expect((await ctx.admin.get('/api/settings/publicas')).body.fonte).toBe('roboto');
    const bad = await ctx.admin.put('/api/settings').send({ fonte: 'Comic Sans' });
    expect(bad.status).toBe(422);
    expect(bad.body.errors.fonte).toBeTruthy();
    expect((await ctx.leitura.put('/api/settings').send({ fonte: 'lato' })).status).toBe(403);
  });

  it('cada usuário escolhe o tamanho do texto', async () => {
    expect((await ctx.leitura.get('/api/auth/me')).body.tamanho_texto).toBe('normal');
    const r = await ctx.leitura.put('/api/auth/perfil').send({ tamanho_texto: 'grande' });
    expect(r.status).toBe(200);
    expect(r.body.tamanho_texto).toBe('grande');
    expect((await ctx.leitura.get('/api/auth/me')).body).toMatchObject({
      tamanho_texto: 'grande',
      aparencia: 'escuro',
    });
    expect((await ctx.admin.get('/api/auth/me')).body.tamanho_texto).toBe('normal');
    expect((await ctx.leitura.put('/api/auth/perfil').send({ tamanho_texto: 'enorme' })).status).toBe(422);
    // pelo cadastro de usuários não muda
    const u = (await ctx.leitura.get('/api/auth/me')).body.id;
    await ctx.admin.put(`/api/usuarios/${u}`).send({ tamanho_texto: 'pequeno' });
    expect((await ctx.plataforma('usuarios').where({ id: u }).first()).tamanho_texto).toBe('grande');
  });
});
