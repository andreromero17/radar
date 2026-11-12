import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeLogs } from '../src/services/logs';
import { makeTestApp, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => ctx.db.destroy());

describe('Dashboard, logs e backup', () => {
  it('resumo do dashboard traz o total de cada cadastro que o usuário pode ver', async () => {
    const admin = (await ctx.admin.get('/api/dashboard/resumo')).body.totais;
    expect(admin).toEqual(
      expect.arrayContaining([
        { entidade: 'chamados', total: 40 },
        { entidade: 'clientes', total: 5 },
        { entidade: 'usuarios', total: 4 },
      ]),
    );
    const leitura = (await ctx.leitura.get('/api/dashboard/resumo')).body.totais;
    expect(leitura.map((t: { entidade: string }) => t.entidade).sort()).toEqual(['chamados', 'clientes']);
  });

  it('health informa a versão', async () => {
    const { body } = await ctx.admin.get('/api/health');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.commit).toBeTruthy();
  });

  it('logs do espaço paginados, mais recentes primeiro (login fica no log da plataforma)', async () => {
    await ctx.operador.post('/api/clientes').send({ nome: 'Cliente do log', email: 'log@x.com' });
    const { body } = await ctx.admin.get('/api/logs?pageSize=1');
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.rows[0]).toMatchObject({ entidade: 'clientes', acao: 'criação', usuario: 'Ana Souza' });
    expect(body.rows.some((r: { acao: string }) => r.acao === 'login')).toBe(false);
    expect(await ctx.plataforma('logs').where({ acao: 'login' }).first()).toBeTruthy();
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
});
