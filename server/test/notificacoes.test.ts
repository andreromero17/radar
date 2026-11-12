import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryMailer } from '../src/services/mailer';
import { enviarResumos, purgeNotificacoes, registerAlerta, verificarAlertas } from '../src/services/notificacoes';
import { nowLocal } from '../src/utils/time';
import { makeTestApp, type TestCtx } from './helpers';

// Fase 4C: alertas → notificações por usuário (sem repetir), preferências, e-mail e limpeza
let ctx: TestCtx;
let avisos: { chave: string; titulo: string }[] = [];
let adminId: number;
let leituraId: number;

beforeAll(async () => {
  ctx = await makeTestApp();
  adminId = (await ctx.db('usuarios').where({ email: 'admin@sistema.com' }).first('id')).id;
  leituraId = (await ctx.db('usuarios').where({ email: 'bruno@sistema.com' }).first('id')).id;
  registerAlerta('teste.aberto', {
    rotulo: 'Aviso de teste',
    descricao: 'Qualquer usuário',
    nivel: 'aviso',
    icone: 'bell',
    gerar: async () => avisos.map((a) => ({ ...a, link: `/x/${a.chave}` })),
  });
  registerAlerta('teste.restrito', {
    rotulo: 'Só com backup',
    descricao: 'Exige permissão',
    perm: ['backup', 'ver'],
    gerar: async () => [{ chave: 'r1', titulo: 'Restrito' }],
  });
  registerAlerta('teste.quebrado', {
    rotulo: 'Quebrado',
    descricao: 'Lança erro',
    gerar: async () => {
      throw new Error('falhou');
    },
  });
});
afterAll(() => ctx.db.destroy());

describe('geração das notificações', () => {
  it('cria uma por usuário e chave; não repete; respeita permissão; alerta quebrado não derruba os outros', async () => {
    avisos = [
      { chave: 'a', titulo: 'Fatura vence amanhã' },
      { chave: 'b', titulo: 'Orçamento passou de 80%' },
    ];
    const r1 = await verificarAlertas(ctx.db);
    expect(r1.novas.get(adminId)?.map((n) => n.titulo)).toEqual([
      'Fatura vence amanhã',
      'Orçamento passou de 80%',
      'Restrito',
    ]);
    expect(r1.novas.get(leituraId)?.map((n) => n.tipo)).not.toContain('teste.restrito');
    const n = r1.novas.get(adminId)![0];
    expect(n).toMatchObject({ nivel: 'aviso', icone: 'bell', link: '/x/a', lida_em: null });

    const r2 = await verificarAlertas(ctx.db);
    expect(r2.total).toBe(0); // mesma chave não gera de novo

    avisos.push({ chave: 'c', titulo: 'Novo aviso' });
    const r3 = await verificarAlertas(ctx.db, { usuarioId: adminId });
    expect(r3.total).toBe(1);
    expect(r3.novas.get(adminId)?.[0].titulo).toBe('Novo aviso');
  });
});

describe('API', () => {
  it('lista as do usuário com contador; marca uma e todas como lidas', async () => {
    const r = await ctx.admin.get('/api/notificacoes');
    expect(r.status).toBe(200);
    expect(r.body.nao_lidas).toBe(4);
    expect(r.body.itens[0].titulo).toBe('Novo aviso'); // mais nova primeiro
    const id = r.body.itens[0].id;
    expect((await ctx.leitura.post(`/api/notificacoes/${id}/lida`)).status).toBe(404); // de outro usuário
    expect((await ctx.admin.post(`/api/notificacoes/${id}/lida`)).status).toBe(200);
    expect((await ctx.admin.get('/api/notificacoes')).body.nao_lidas).toBe(3);
    expect(
      (await ctx.admin.get('/api/notificacoes?nao_lidas=1')).body.itens.map((x: { id: number }) => x.id),
    ).not.toContain(id);
    expect((await ctx.admin.post('/api/notificacoes/lidas')).body.marcadas).toBe(3);
    expect((await ctx.admin.get('/api/notificacoes')).body.nao_lidas).toBe(0);
  });

  it('preferências: tipos que o usuário pode ver; desligado não gera mais', async () => {
    const p = (await ctx.leitura.get('/api/notificacoes/preferencias')).body;
    expect(p.tipos.map((t: { tipo: string }) => t.tipo)).toContain('teste.aberto');
    expect(p.tipos.map((t: { tipo: string }) => t.tipo)).not.toContain('teste.restrito');
    expect(p.pref).toEqual({ desligados: [], email: false });
    expect(p.email_disponivel).toBe(false);

    const put = await ctx.leitura
      .put('/api/notificacoes/preferencias')
      .send({ desligados: ['teste.aberto'], email: true });
    expect(put.status).toBe(200);
    avisos.push({ chave: 'd', titulo: 'Só para quem quer' });
    const r = await verificarAlertas(ctx.db);
    expect(r.novas.get(leituraId)).toBeUndefined();
    expect(r.novas.get(adminId)?.map((n) => n.titulo)).toEqual(['Só para quem quer']);
    expect((await ctx.leitura.put('/api/notificacoes/preferencias').send({ desligados: 'x' })).status).toBe(422);
  });
});

describe('e-mail e limpeza', () => {
  it('resumo por e-mail só para quem pediu; limpeza apaga lidas antigas', async () => {
    await ctx.admin.put('/api/notificacoes/preferencias').send({ desligados: [], email: true });
    avisos.push({ chave: 'e', titulo: 'Para o e-mail' });
    const { novas } = await verificarAlertas(ctx.db);
    const mailer = memoryMailer();
    expect(await enviarResumos(ctx.db, mailer, novas, 'https://app.exemplo/', 'Sistema')).toBe(1);
    expect(mailer.sent[0].to).toBe('admin@sistema.com');
    expect(mailer.sent[0].subject).toBe('Sistema: Para o e-mail');
    expect(mailer.sent[0].text).toContain('https://app.exemplo/x/e');

    const velha = nowLocal(new Date(Date.now() - 200 * 86_400_000));
    await ctx.db('notificacoes').where({ usuario_id: adminId }).update({ lida_em: velha });
    expect(await purgeNotificacoes(ctx.db, 90)).toBeGreaterThan(0);
    expect(await ctx.db('notificacoes').where({ usuario_id: adminId }).count({ n: '*' }).first()).toEqual({ n: 0 });
  });
});
