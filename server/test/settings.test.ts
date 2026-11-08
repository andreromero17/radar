import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@frame/shared';
import { makeTestApp } from './helpers';

let ctx: Awaited<ReturnType<typeof makeTestApp>>;
beforeAll(async () => {
  ctx = await makeTestApp({ withSeed: false });
});
afterAll(() => ctx.db.destroy());

describe('Configurações', () => {
  it('retorna os padrões num banco novo', async () => {
    expect((await request(ctx.app).get('/api/settings')).body).toEqual(DEFAULT_SETTINGS);
  });

  it('valida e devolve erros por campo', async () => {
    const res = await request(ctx.app)
      .put('/api/settings')
      .send({ nome_sistema: '', cor_primaria: 'red', dias_logs: -1, logo: 'http://x.png' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.errors).sort()).toEqual(['cor_primaria', 'dias_logs', 'logo', 'nome_sistema']);
  });

  it('salva parcialmente e persiste', async () => {
    const res = await request(ctx.app).put('/api/settings').send({ nome_sistema: '  Finanças  ', dias_logs: '30' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      nome_sistema: 'Finanças',
      dias_logs: 30,
      cor_primaria: DEFAULT_SETTINGS.cor_primaria,
    });
    expect((await request(ctx.app).get('/api/settings')).body.nome_sistema).toBe('Finanças');
  });

  it('restaura o padrão', async () => {
    const res = await request(ctx.app).delete('/api/settings');
    expect(res.body).toEqual(DEFAULT_SETTINGS);
  });
});
