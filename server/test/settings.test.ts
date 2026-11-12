import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@frame/shared';
import { makeTestApp, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => ctx.db.destroy());

describe('Configurações', () => {
  it('retorna os padrões num banco novo', async () => {
    expect((await ctx.admin.get('/api/settings')).body).toEqual(DEFAULT_SETTINGS);
  });

  it('valida e devolve erros por campo', async () => {
    const res = await ctx.admin
      .put('/api/settings')
      .send({ nome_sistema: '', cor_primaria: 'red', dias_logs: -1, logo: 'http://x.png' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.errors).sort()).toEqual(['cor_primaria', 'dias_logs', 'logo', 'nome_sistema']);
  });

  it('salva parcialmente e persiste', async () => {
    const res = await ctx.admin.put('/api/settings').send({ nome_sistema: '  Finanças  ', dias_logs: '30' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      nome_sistema: 'Finanças',
      dias_logs: 30,
      cor_primaria: DEFAULT_SETTINGS.cor_primaria,
    });
    expect((await ctx.admin.get('/api/settings')).body.nome_sistema).toBe('Finanças');
  });

  it('restaura o padrão', async () => {
    const res = await ctx.admin.delete('/api/settings');
    expect(res.body).toEqual(DEFAULT_SETTINGS);
  });
});

describe('log das configurações', () => {
  it('registra só os campos que mudaram, com antes e depois', async () => {
    const atual = (await ctx.admin.get('/api/settings')).body;
    await ctx.admin
      .put('/api/settings')
      .send({ ...atual, cor_primaria: '#10b981' })
      .expect(200);
    const log = (await ctx.admin.get('/api/logs?origem=plataforma&entidade=sistema')).body.rows[0];
    expect(log.alteracoes).toEqual({ cor_primaria: { de: atual.cor_primaria, para: '#10b981' } });
  });

  it('salvar sem mudanças não gera log', async () => {
    const antes = (await ctx.admin.get('/api/logs?entidade=sistema')).body.total;
    const atual = (await ctx.admin.get('/api/settings')).body;
    await ctx.admin.put('/api/settings').send(atual).expect(200);
    expect((await ctx.admin.get('/api/logs?entidade=sistema')).body.total).toBe(antes);
  });
});
