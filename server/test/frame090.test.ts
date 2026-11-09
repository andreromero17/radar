import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { entitySchema, type EntityDef } from '@frame/shared';
import { diffRecord } from '../src/services/logs';
import { tipoFonte } from '../src/services/fonte';
import { makeTestApp, type TestCtx } from './helpers';

// v0.9.0: campo imagem e fonte própria
let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => ctx.db.destroy());

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const ent: EntityDef = {
  label: 'X',
  singular: 'X',
  icon: 'box',
  labelField: 'nome',
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true },
    { name: 'logo', label: 'Logo', type: 'image' },
  ],
};

describe('campo imagem', () => {
  const v = (logo: unknown) => entitySchema(ent).safeParse({ nome: 'a', logo });

  it('aceita data URL de imagem, vazio = sem imagem', () => {
    expect(v(PNG).success).toBe(true);
    expect(v('').data).toMatchObject({ logo: null });
  });

  it('recusa outro conteúdo e imagem grande', () => {
    expect(v('data:text/html;base64,PGgxPg==').success).toBe(false);
    expect(v('https://exemplo.com/logo.png').success).toBe(false);
    expect(v(`data:image/png;base64,${'A'.repeat(210 * 1024)}`).success).toBe(false);
  });

  it('no log, só a indicação (nunca o base64)', () => {
    expect(diffRecord(ent, { id: 1, nome: 'a', logo: null }, { logo: PNG })).toEqual({
      logo: { de: null, para: '(alterada)' },
    });
    expect(diffRecord(ent, null, { nome: 'a', logo: PNG })).toMatchObject({ logo: { para: '(imagem)' } });
    expect(JSON.stringify(diffRecord(ent, { id: 1, logo: PNG }, { logo: '' }))).not.toContain('base64');
  });
});

// cabeçalhos mínimos de cada formato
const WOFF2 = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(60, 1)]);
const TTF = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(60, 2)]);

describe('fonte própria', () => {
  const enviar = (peso: string, buf: Buffer, quem = ctx.admin) =>
    quem
      .post(`/api/settings/fonte/${peso}?arquivo=ABCOracle-Regular.woff2`)
      .set('Content-Type', 'application/octet-stream')
      .send(buf);

  it('reconhece o formato pelo conteúdo', () => {
    expect(tipoFonte(WOFF2)?.mime).toBe('font/woff2');
    expect(tipoFonte(TTF)?.mime).toBe('font/ttf');
    expect(tipoFonte(Buffer.from('<html>oi'))).toBeNull();
  });

  it('envia, serve publicamente com cache e liga a opção', async () => {
    const r = await enviar('regular', WOFF2);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ fonte_propria_arquivos: 'regular' });
    const pub = (await request(ctx.app).get('/api/settings/publicas')).body;
    expect(pub.fonte_propria_versao).toMatch(/^\d+$/);
    expect(pub).not.toHaveProperty('fonte_arquivo_regular');
    const f = await request(ctx.app).get('/api/settings/fonte/regular').buffer(true);
    expect(f.status).toBe(200);
    expect(f.headers['content-type']).toBe('font/woff2');
    expect(f.headers['cache-control']).toContain('immutable');
    expect(
      (await ctx.admin.put('/api/settings').send({ fonte: 'propria', fonte_propria_nome: 'ABC Oracle' })).status,
    ).toBe(200);
    expect((await request(ctx.app).get('/api/settings/fonte/negrito')).status).toBe(404);
  });

  it('o cliente não altera os controles; o GET de configurações não traz o arquivo', async () => {
    const r = await ctx.admin.put('/api/settings').send({ fonte_propria_arquivos: 'x', fonte_propria_versao: '1' });
    expect((await ctx.admin.get('/api/settings')).body.fonte_propria_arquivos).toBe('regular');
    expect(JSON.stringify((await ctx.admin.get('/api/settings')).body)).not.toContain('base64');
    expect(r.status).toBe(200);
  });

  it('valida arquivo, peso e permissão', async () => {
    expect((await enviar('regular', Buffer.from('não é fonte'))).status).toBe(422);
    expect((await enviar('italico', WOFF2)).status).toBe(422);
    expect((await enviar('regular', WOFF2, ctx.leitura)).status).toBe(403);
  });

  it('remover o regular volta para a fonte do tema', async () => {
    const r = await ctx.admin.delete('/api/settings/fonte/regular');
    expect(r.body).toMatchObject({ fonte: 'tema', fonte_propria_arquivos: '' });
    expect((await request(ctx.app).get('/api/settings/fonte/regular')).status).toBe(404);
  });
});
