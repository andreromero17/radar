import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appSettings } from '@frame/shared';
import { getAppSetting } from '../src/services/settings';
import { makeTestApp, type TestCtx } from './helpers';

// v0.11.0: configurações próprias do sistema derivado (app/settings.ts)
let ctx: TestCtx;
// o sistema derivado pode ter as suas: o teste acrescenta e depois tira só as dele
const antes = appSettings.length;
beforeAll(async () => {
  appSettings.push(
    {
      chave: 'regime',
      label: 'Regime',
      type: 'select',
      default: 'fatura',
      options: [
        { value: 'compra', label: 'Compra' },
        { value: 'fatura', label: 'Fatura' },
      ],
    },
    { chave: 'avisar', label: 'Avisar', type: 'boolean', default: false },
    { chave: 'dias', label: 'Dias', type: 'number', default: 5, min: 1, max: 30 },
  );
  ctx = await makeTestApp();
});
afterAll(async () => {
  appSettings.splice(antes);
  await ctx.db.destroy();
});

describe('configurações do sistema derivado', () => {
  it('padrões, gravação parcial e validação', async () => {
    expect((await ctx.admin.get('/api/settings/app')).body).toMatchObject({ regime: 'fatura', avisar: false, dias: 5 });
    const ruim = await ctx.admin.put('/api/settings/app').send({ regime: 'outro', dias: 99 });
    expect(ruim.status).toBe(422);
    expect(Object.keys(ruim.body.errors)).toEqual(expect.arrayContaining(['regime', 'dias']));
    const ok = await ctx.admin.put('/api/settings/app').send({ regime: 'compra', avisar: true });
    expect(ok.body).toMatchObject({ regime: 'compra', avisar: true, dias: 5 });
    expect(await getAppSetting(ctx.db, 'regime')).toBe('compra');
    expect(await getAppSetting<boolean>(ctx.db, 'avisar')).toBe(true);
  });

  it('qualquer logado lê; só quem edita configurações grava; restaurar padrão volta tudo', async () => {
    expect((await ctx.leitura.get('/api/settings/app')).status).toBe(200);
    expect((await ctx.leitura.put('/api/settings/app').send({ dias: 7 })).status).toBe(403);
    await ctx.admin.delete('/api/settings');
    expect((await ctx.admin.get('/api/settings/app')).body.regime).toBe('fatura');
  });
});
