import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestApp, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => ctx.db.destroy());

describe('CRUD genérico', () => {
  it('lista com paginação e total', async () => {
    const res = await ctx.admin.get('/api/chamados?pageSize=5&page=2');
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(5);
    expect(res.body.total).toBe(40);
    expect(res.body.page).toBe(2);
  });

  it('traz o nome das relações (campo__label)', async () => {
    const res = await ctx.admin.get('/api/chamados/1');
    expect(res.status).toBe(200);
    expect(res.body.cliente_id__label).toBe('Cliente Teste Hugo');
  });

  it('busca textual e filtros por campo', async () => {
    const busca = await ctx.admin.get('/api/clientes?q=padaria');
    expect(busca.body.rows.map((r: { nome: string }) => r.nome)).toEqual(['Padaria Bom Dia']);

    const filtro = await ctx.admin.get('/api/chamados?status=Aberto&pageSize=100');
    expect(filtro.body.total).toBeGreaterThan(0);
    expect(filtro.body.rows.every((r: { status: string }) => r.status === 'Aberto')).toBe(true);

    const ativos = await ctx.admin.get('/api/clientes?ativo=1');
    expect(ativos.body.total).toBe(4);
  });

  it('ignora ordenação por coluna desconhecida (sem SQL injection)', async () => {
    const res = await ctx.admin.get('/api/clientes?sort=nome;drop table clientes&dir=asc');
    expect(res.status).toBe(200);
    expect((await ctx.admin.get('/api/clientes')).body.total).toBe(5);
  });

  it('valida na criação e devolve erros por campo (422)', async () => {
    const res = await ctx.admin.post('/api/clientes').send({ email: 'invalido' });
    expect(res.status).toBe(422);
    expect(res.body.errors).toEqual({ nome: 'Nome é obrigatório', email: 'E-mail inválido' });
  });

  it('cria aplicando padrões, gera protocolo e registra log', async () => {
    const res = await ctx.admin.post('/api/chamados').send({ assunto: 'Teste', cliente_id: '2' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ assunto: 'Teste', cliente_id: 2, status: 'Aberto', prioridade: 'Média' });
    expect(res.body.protocolo).toMatch(/^CH\d{8}-[0-9A-F]{5}$/);

    const log = await ctx.db('logs').orderBy('id', 'desc').first();
    expect(log).toMatchObject({ entidade: 'chamados', acao: 'criação', registro_id: res.body.id });
  });

  it('atualiza parcialmente sem apagar outros campos', async () => {
    const res = await ctx.admin.put('/api/clientes/1').send({ telefone: '(51) 1234-5678', ativo: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nome: 'Cliente Teste Hugo', telefone: '(51) 1234-5678', ativo: false });
    expect(res.body.atualizado_em).toBeTruthy();
  });

  it('rejeita opção inválida em select', async () => {
    const res = await ctx.admin.put('/api/chamados/1').send({ status: 'Inventado' });
    expect(res.status).toBe(422);
    expect(res.body.errors.status).toBe('Opção inválida');
  });

  it('exclui e passa a responder 404', async () => {
    const criado = await ctx.admin
      .post('/api/usuarios')
      .send({ nome: 'Temp', email: 'temp@x.com', perfil_id: 3, senha: 'temp1234' });
    expect((await ctx.admin.delete(`/api/usuarios/${criado.body.id}`)).status).toBe(204);
    expect((await ctx.admin.get(`/api/usuarios/${criado.body.id}`)).status).toBe(404);
  });

  it('responde 404 para entidade desconhecida e 400 para JSON inválido', async () => {
    expect((await ctx.admin.get('/api/inexistente')).status).toBe(404);
    const bad = await ctx.admin.post('/api/clientes').set('Content-Type', 'application/json').send('{ruim');
    expect(bad.status).toBe(400);
  });
});
