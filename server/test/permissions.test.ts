import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestApp, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => ctx.db.destroy());

describe('permissões por perfil', () => {
  it('Leitura só consulta', async () => {
    expect((await ctx.leitura.get('/api/chamados')).status).toBe(200);
    expect((await ctx.leitura.post('/api/chamados').send({ assunto: 'X', cliente_id: 1 })).status).toBe(403);
    expect((await ctx.leitura.put('/api/chamados/1').send({ assunto: 'Y' })).status).toBe(403);
    expect((await ctx.leitura.delete('/api/chamados/1')).status).toBe(403);
  });

  it('Operador trabalha em clientes e chamados, mas não exclui clientes', async () => {
    expect((await ctx.operador.post('/api/clientes').send({ nome: 'Novo' })).status).toBe(201);
    expect((await ctx.operador.delete('/api/clientes/5')).status).toBe(403);
    expect((await ctx.operador.delete('/api/chamados/40')).status).toBe(204);
  });

  it('áreas do sistema respeitam a matriz', async () => {
    expect((await ctx.operador.get('/api/usuarios')).status).toBe(403);
    expect((await ctx.operador.get('/api/logs')).status).toBe(403);
    expect((await ctx.operador.get('/api/backup/info')).status).toBe(403);
    expect((await ctx.operador.put('/api/settings').send({ nome_sistema: 'Hack' })).status).toBe(403);
    expect((await ctx.operador.get('/api/settings')).status).toBe(200); // leitura liberada (rodapé, tema)
    expect((await ctx.admin.get('/api/logs')).status).toBe(200);
  });

  it('opções de relação liberadas para quem está logado (só id e nome)', async () => {
    const res = await ctx.leitura.get('/api/usuarios/opcoes');
    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({ value: expect.any(Number), label: expect.any(String) });
    expect(JSON.stringify(res.body)).not.toContain('scrypt');
  });

  it('mudança de permissão vale na hora, sem novo login', async () => {
    const leitura = await ctx.db('perfis').where({ nome: 'Leitura' }).first();
    await ctx.admin
      .put(`/api/perfis/${leitura.id}`)
      .send({ permissoes: { clientes: ['ver', 'criar'], chamados: ['ver'] } })
      .expect(200);
    expect((await ctx.leitura.post('/api/clientes').send({ nome: 'Agora pode' })).status).toBe(201);
    await ctx.admin
      .put(`/api/perfis/${leitura.id}`)
      .send({ permissoes: { clientes: ['ver'], chamados: ['ver'] } })
      .expect(200);
  });
});

describe('usuários', () => {
  it('senha nunca sai da API (lista, detalhe, criação)', async () => {
    const lista = await ctx.admin.get('/api/usuarios?pageSize=100');
    const detalhe = await ctx.admin.get('/api/usuarios/1');
    const criado = await ctx.admin
      .post('/api/usuarios')
      .send({ nome: 'Zé', email: 'ze@x.com', perfil_id: 2, senha: 'senhaZe123' });
    for (const body of [lista.body, detalhe.body, criado.body])
      expect(JSON.stringify(body)).not.toMatch(/"senha"|scrypt/);
  });

  it('não permite filtrar/ordenar pelo hash da senha', async () => {
    const res = await ctx.admin.get('/api/usuarios?senha=scrypt&sort=senha');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(1); // filtro ignorado
  });

  it('cria com senha obrigatória e política aplicada; e-mail único', async () => {
    const sem = await ctx.admin.post('/api/usuarios').send({ nome: 'A', email: 'a@x.com', perfil_id: 2 });
    expect(sem.body.errors.senha).toBe('Senha é obrigatória');
    const fraca = await ctx.admin
      .post('/api/usuarios')
      .send({ nome: 'A', email: 'a@x.com', perfil_id: 2, senha: 'abc' });
    expect(fraca.body.errors.senha).toBe('Mínimo de 8 caracteres');
    const dup = await ctx.admin
      .post('/api/usuarios')
      .send({ nome: 'A', email: 'ANA@sistema.com', perfil_id: 2, senha: 'senha1234' });
    expect(dup.body.errors.email).toBe('E-mail já cadastrado');
  });

  it('editar sem informar senha mantém a senha atual', async () => {
    await ctx.admin.put('/api/usuarios/3').send({ nome: 'Bruno L.', senha: '' }).expect(200);
    await ctx.login('bruno@sistema.com', 'senha123');
  });

  it('sistema nunca fica sem administrador ativo', async () => {
    const operador = await ctx.db('perfis').where({ nome: 'Operador' }).first();
    const rebaixar = await ctx.admin.put('/api/usuarios/1').send({ perfil_id: operador.id });
    expect(rebaixar.status).toBe(409);
    const desativarProprio = await ctx.admin.put('/api/usuarios/1').send({ ativo: false });
    expect(desativarProprio.status).toBe(422);
    expect((await ctx.admin.delete('/api/usuarios/1')).status).toBe(409);
    const admin = await ctx.db('perfis').where({ nome: 'Administrador' }).first();
    expect((await ctx.admin.put(`/api/perfis/${admin.id}`).send({ admin: false })).status).toBe(409);
  });

  it('quem não é admin não promove ninguém a admin (nem a si mesmo)', async () => {
    const perfilOp = await ctx.db('perfis').where({ nome: 'Operador' }).first();
    await ctx.admin
      .put(`/api/perfis/${perfilOp.id}`)
      .send({ permissoes: { clientes: ['ver'], chamados: ['ver'], usuarios: ['ver', 'criar', 'editar'] } })
      .expect(200);
    const admin = await ctx.db('perfis').where({ nome: 'Administrador' }).first();

    const promover = await ctx.operador.put('/api/usuarios/2').send({ perfil_id: admin.id });
    expect(promover.status).toBe(403);
    const editarAdmin = await ctx.operador.put('/api/usuarios/1').send({ nome: 'Hackeado' });
    expect(editarAdmin.status).toBe(403);
    const criarAdmin = await ctx.operador
      .post('/api/usuarios')
      .send({ nome: 'X', email: 'x@x.com', perfil_id: admin.id, senha: 'senha1234' });
    expect(criarAdmin.status).toBe(403);
    // e não consegue mexer nos perfis (nem tendo "editar" marcado na matriz)
    const perfil = await ctx.operador.put(`/api/perfis/${perfilOp.id}`).send({ admin: true });
    expect(perfil.status).toBe(403);

    await ctx.admin
      .put(`/api/perfis/${perfilOp.id}`)
      .send({ permissoes: { clientes: ['ver', 'criar', 'editar'], chamados: ['ver', 'criar', 'editar', 'excluir'] } })
      .expect(200);
  });
});

describe('perfis', () => {
  it('permissões são normalizadas (recurso/ação inexistente é descartado)', async () => {
    const res = await ctx.admin.post('/api/perfis').send({
      nome: 'Financeiro',
      permissoes: { clientes: ['excluir', 'ver'], inventado: ['ver'], logs: ['ver', 'excluir'], perfis: ['editar'] },
    });
    expect(res.status).toBe(201);
    expect(res.body.permissoes).toEqual({ clientes: ['ver', 'excluir'], logs: ['ver'] });
  });

  it('não exclui perfil em uso', async () => {
    const res = await ctx.admin.delete('/api/perfis/2');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/em uso/);
  });

  it('nome único (sem diferenciar maiúsculas)', async () => {
    const res = await ctx.admin.post('/api/perfis').send({ nome: 'leitura' });
    expect(res.body.errors.nome).toMatch(/Já existe/);
  });
});

describe('logs com diff', () => {
  it('registra quem alterou e o antes/depois de cada campo', async () => {
    await ctx.operador.put('/api/clientes/3').send({ telefone: '(51) 0000-0000', ativo: false }).expect(200);
    const { body } = await ctx.admin.get('/api/logs?entidade=clientes&registro_id=3');
    const log = body.rows[0];
    expect(log).toMatchObject({ acao: 'alteração', usuario: 'Ana Souza' });
    expect(log.alteracoes).toEqual({
      telefone: { de: '(51) 3333-4444', para: '(51) 0000-0000' },
      ativo: { de: true, para: false },
    });
  });

  it('não registra alteração quando nada mudou', async () => {
    const antes = (await ctx.admin.get('/api/logs?entidade=clientes')).body.total;
    const atual = (await ctx.admin.get('/api/clientes/3')).body;
    await ctx.admin.put('/api/clientes/3').send({ nome: atual.nome }).expect(200);
    expect((await ctx.admin.get('/api/logs?entidade=clientes')).body.total).toBe(antes);
  });

  it('senha aparece só como "alterada", nunca o valor', async () => {
    await ctx.admin.put('/api/usuarios/4').send({ senha: 'qualquer123' }).expect(200);
    const { body } = await ctx.admin.get('/api/logs?entidade=usuarios&registro_id=4');
    expect(body.rows[0].alteracoes.senha).toEqual({ de: '••••••', para: '(alterada)' });
    expect(JSON.stringify(body)).not.toContain('qualquer123');
  });
});
