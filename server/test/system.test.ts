import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeLogs } from '../src/services/logs';
import { makeTestApp, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => ctx.db.destroy());

describe('Dashboard, logs e backup', () => {
  it('dashboard com contagens coerentes', async () => {
    const { body } = await ctx.admin.get('/api/dashboard');
    const somaStatus = body.porStatus.reduce((s: number, p: { total: number }) => s + p.total, 0);
    expect(somaStatus).toBe(40);
    expect(body.cards.abertos + body.cards.concluidos).toBe(40);
    expect(body.cards.clientesAtivos).toBe(4);
    expect(body.ultimos).toHaveLength(6);
  });

  it('logs paginados, mais recentes primeiro', async () => {
    const { body } = await ctx.admin.get('/api/logs?pageSize=1');
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.rows[0].acao).toBe('login');
    expect(body.rows[0].usuario).toBe('Bruno Lima');
  });

  it('limpeza remove só logs mais antigos que o limite', async () => {
    await ctx.db('logs').insert([
      { entidade: 'x', acao: 'antigo', criado_em: '2020-01-01 00:00:00' },
      { entidade: 'x', acao: 'recente', criado_em: '2999-01-01 00:00:00' },
    ]);
    expect(await purgeLogs(ctx.db, 30)).toBe(1);
    expect(await purgeLogs(ctx.db, 0)).toBe(0); // 0 = nunca excluir
    expect(await ctx.db('logs').where('acao', 'recente').first()).toBeTruthy();
  });

  it('informações de backup listam as tabelas', async () => {
    const { body } = await ctx.admin.get('/api/backup/info');
    expect(body.tabelas.map((t: { tabela: string }) => t.tabela)).toEqual(
      expect.arrayContaining(['clientes', 'chamados', 'logs', 'configuracoes']),
    );
  });

  it('health check', async () => {
    expect((await ctx.admin.get('/api/health')).body).toEqual({ ok: true });
  });
});
