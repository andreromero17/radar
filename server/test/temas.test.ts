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
    const row = await ctx.db('usuarios').where({ id: u.id }).first();
    expect(row.aparencia).not.toBe('claro');
  });
});
