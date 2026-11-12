import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { entities } from '@frame/shared';
import { createApp } from '../src/app';
import { hashPassword } from '../src/auth/password';
import { createEntityTable } from '../src/db/diff';
import { createDb } from '../src/db/knex';
import { migracoesDe, migrateLatest } from '../src/db/migrator';
import { seed } from '../src/db/seed';
import { abrirEspaco, adicionarMembro, configurarEspacos, criarEspaco, fecharEspacos } from '../src/espacos';
import { converterInstalacaoUnica, precisaConverter } from '../src/espacos/conversao';
import { memoryMailer } from '../src/services/mailer';
import { registerAlerta, verificarAlertas } from '../src/services/notificacoes';
import { conjuntosInfo, fontesRegistradas } from '../src/services/paineis';
import { nowLocal } from '../src/utils/time';
import { fixtureEntities, seedFixtures, seedFixtureUsuarios } from './fixtures';
import { makeTestApp, type TestCtx } from './helpers';

// Fase 5A: cada espaço no próprio banco. NENHUMA rota pode mostrar dado de outro espaço.
let ctx: TestCtx;
let ze: request.Agent;
let zeId: number;
let espacoB: number;
/** Textos que só existem no espaço A (fixtures) — não podem aparecer em nada do espaço B */
const DO_ESPACO_A = ['Padaria Bom Dia', 'Construtora Horizonte', 'Cliente Teste Hugo', 'ana@sistema.com', 'Bruno Lima'];

beforeAll(async () => {
  ctx = await makeTestApp();
  // espaço B: outro dono (administrador, vê tudo), com dados próprios
  const perfilAdmin = await ctx.plataforma('perfis').whereIn('admin', [1, true]).first('id');
  [zeId] = await ctx.plataforma('usuarios').insert({
    nome: 'Zé Assinante',
    email: 'ze@outro.com',
    perfil_id: perfilAdmin.id,
    senha: await hashPassword('senhaZe123'),
    ativo: 1,
    trocar_senha: 0,
    criado_em: nowLocal(),
  });
  espacoB = await criarEspaco({ nome: 'Holding do Zé', tipo: 'holding', donoId: zeId });
  const dbB = await abrirEspaco(espacoB);
  for (const [t, ent] of Object.entries(fixtureEntities)) await createEntityTable(dbB, t, ent);
  await dbB('clientes').insert({ nome: 'Segredo do Zé', email: 'segredo@ze.com', ativo: 1, criado_em: nowLocal() });
  ze = request.agent(ctx.app);
  await ze.post('/api/auth/login').send({ email: 'ze@outro.com', senha: 'senhaZe123' }).expect(200);
});
afterAll(() => ctx.db.destroy());

const semDadosDeA = (texto: string, onde: string) => {
  for (const m of DO_ESPACO_A) expect(texto.includes(m), `${onde} vazou "${m}"`).toBe(false);
};

describe('isolamento entre espaços', () => {
  it('cada sessão fica no próprio espaço', async () => {
    expect((await ze.get('/api/auth/me')).body.espaco).toMatchObject({
      id: espacoB,
      nome: 'Holding do Zé',
      papel: 'dono',
    });
    expect((await ctx.admin.get('/api/auth/me')).body.espaco.id).toBe(ctx.espacoId);
    expect((await ze.get('/api/clientes')).body.rows.map((r: { nome: string }) => r.nome)).toEqual(['Segredo do Zé']);
    expect(JSON.stringify((await ctx.admin.get('/api/clientes?pageSize=100')).body)).not.toContain('Segredo do Zé');
  });

  it('nenhuma rota de leitura do espaço B traz dado do espaço A', async () => {
    const rotas = [
      '/api/logs?pageSize=200',
      '/api/dashboard/resumo',
      '/api/backup/info',
      '/api/settings/app',
      '/api/notificacoes?verificar=1&limite=200',
      '/api/relatorios',
      '/api/preferencias/painel:inicio',
    ];
    for (const ent of Object.keys(entities))
      rotas.push(
        `/api/${ent}?pageSize=1000`,
        `/api/${ent}/opcoes?todos=1`,
        `/api/${ent}/exportar`,
        `/api/${ent}?lixeira=1`,
      );
    for (const f of fontesRegistradas()) rotas.push(`/api/dados/${f}?de=2000-01-01&ate=2099-12-31`);
    for (const c of conjuntosInfo(() => true))
      rotas.push(`/api/relatorios/${c.nome}?de=2026-01-01&ate=2026-12-31&f_tipo=`);
    for (const r of rotas) {
      const res = await ze.get(r);
      expect(res.status, r).toBeLessThan(500);
      semDadosDeA(res.text ?? JSON.stringify(res.body), r);
    }
  });

  it('usuários: só os membros do espaço; id de outro espaço = 404', async () => {
    const lista = (await ze.get('/api/usuarios?pageSize=100')).body.rows.map((u: { email: string }) => u.email);
    expect(lista).toEqual(['ze@outro.com']);
    const opcoes = (await ze.get('/api/usuarios/opcoes?todos=1')).body.map((o: { label: string }) => o.label);
    expect(opcoes).toEqual(['Zé Assinante']);
    const ana = await ctx.plataforma('usuarios').where({ email: 'ana@sistema.com' }).first('id');
    expect((await ze.get(`/api/usuarios/${ana.id}`)).status).toBe(404);
    expect((await ze.put(`/api/usuarios/${ana.id}`).send({ nome: 'Hackeada' })).status).toBe(404);
    expect((await ze.delete(`/api/usuarios/${ana.id}`)).status).toBe(404);
    const lote = await ze.post('/api/usuarios/lote').send({ acao: 'editar', ids: [ana.id], dados: { ativo: false } });
    expect(lote.body.ok ?? 0).toBe(0);
    expect((await ctx.plataforma('usuarios').where({ id: ana.id }).first('nome', 'ativo')).nome).toBe('Ana Souza');
  });

  it('gravações ficam no próprio banco; não dá para trocar para espaço alheio', async () => {
    await ze.post('/api/clientes').send({ nome: 'Novo do Zé', email: 'n@ze.com' }).expect(201);
    expect(await ctx.db('clientes').where({ nome: 'Novo do Zé' }).first()).toBeUndefined();
    expect((await ze.post('/api/auth/espaco').send({ id: ctx.espacoId })).status).toBe(404);
    expect((await ctx.admin.post('/api/auth/espaco').send({ id: espacoB })).status).toBe(404);
  });

  it('membro com mais de um espaço troca e enxerga só o espaço em uso', async () => {
    await adicionarMembro(
      espacoB,
      (await ctx.plataforma('usuarios').where({ email: 'admin@sistema.com' }).first('id')).id,
      'leitor',
    );
    const me = (await ctx.admin.get('/api/auth/me')).body;
    expect(me.espacos.map((e: { id: number }) => e.id)).toEqual([ctx.espacoId, espacoB]);
    await ctx.admin.post('/api/auth/espaco').send({ id: espacoB }).expect(200);
    const nomes = (await ctx.admin.get('/api/clientes?pageSize=100')).body.rows.map((r: { nome: string }) => r.nome);
    expect(nomes).toContain('Segredo do Zé');
    expect(nomes).not.toContain('Padaria Bom Dia');
    await ctx.admin.post('/api/auth/espaco').send({ id: ctx.espacoId }).expect(200);
    expect((await ctx.admin.get('/api/clientes?pageSize=100')).text).toContain('Padaria Bom Dia');
  });

  it('membro desativado perde o acesso na hora (sessão aberta inclusive)', async () => {
    const ana = await ctx.plataforma('usuarios').where({ email: 'ana@sistema.com' }).first('id');
    expect((await ctx.operador.get('/api/clientes')).status).toBe(200);
    await ctx.plataforma('membros').where({ espaco_id: ctx.espacoId, usuario_id: ana.id }).update({ ativo: 0 });
    const r = await ctx.operador.get('/api/clientes');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('SEM_ESPACO');
    await ctx.plataforma('membros').where({ espaco_id: ctx.espacoId, usuario_id: ana.id }).update({ ativo: 1 });
  });

  it('alertas de um espaço só notificam os membros dele', async () => {
    registerAlerta('teste.clientes', {
      rotulo: 'Clientes',
      descricao: 'teste',
      gerar: async (db) =>
        ((await db('clientes').select('id', 'nome')) as { id: number; nome: string }[]).map((c) => ({
          chave: String(c.id),
          titulo: c.nome,
        })),
    });
    const r = await verificarAlertas(await abrirEspaco(espacoB));
    const ids = [...r.novas.keys()];
    expect(ids).toContain(zeId);
    const ana = await ctx.plataforma('usuarios').where({ email: 'ana@sistema.com' }).first('id');
    expect(ids).not.toContain(ana.id);
    for (const l of r.novas.values()) semDadosDeA(JSON.stringify(l), 'alerta');
  });

  it('o banco do espaço não guarda senha nem sessão', async () => {
    const dbB = await abrirEspaco(espacoB);
    expect(await dbB('usuarios').whereNot('senha', '!').first()).toBeUndefined();
    expect(await dbB('sessoes').first()).toBeUndefined();
    expect(await ctx.db('usuarios').whereNot('senha', '!').first()).toBeUndefined();
  });
});

describe('conversão da instalação antiga (um banco só)', () => {
  it('backup, dados no espaço 1, plataforma limpa, mesmos logins', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-conv-'));
    const arquivo = path.join(pasta, 'app.db');
    const dirEspacos = path.join(pasta, 'espacos');
    // banco "antigo": núcleo + sistema no mesmo arquivo
    const antigo = createDb(arquivo);
    await migrateLatest(antigo, 'espaco');
    await seed(antigo);
    await seedFixtureUsuarios(antigo);
    for (const [t, ent] of Object.entries(fixtureEntities)) await createEntityTable(antigo, t, ent);
    await seedFixtures(antigo);
    await antigo('logs').insert({ entidade: 'clientes', acao: 'criação', criado_em: nowLocal() });
    await antigo.destroy();

    expect(await precisaConverter(arquivo)).toBe(true);
    expect(await converterInstalacaoUnica(arquivo, dirEspacos)).toBe(true);
    expect(await converterInstalacaoUnica(arquivo, dirEspacos)).toBe(false); // uma vez só
    expect(fs.readdirSync(pasta).some((f) => f.startsWith('backup-antes-dos-espacos-'))).toBe(true);

    const plat = createDb(arquivo);
    expect(await plat.schema.hasTable('clientes')).toBe(false);
    expect(await plat('logs').where({ entidade: 'clientes' }).first()).toBeUndefined();
    const nomes = (await plat('knex_migrations').pluck('name')) as string[];
    expect(nomes.every((n) => migracoesDe('plataforma').some((m) => m.name === n))).toBe(true);
    expect(await plat('espacos').where({ id: 1 }).first('nome')).toEqual({ nome: 'Pessoal' });
    expect(Number((await plat('membros').count({ n: '*' }).first())?.n)).toBe(
      Number((await plat('usuarios').count({ n: '*' }).first())?.n),
    );

    configurarEspacos({ plataforma: plat, dir: dirEspacos, autoMigrar: true });
    const e1 = await abrirEspaco(1);
    expect(Number((await e1('clientes').count({ n: '*' }).first())?.n)).toBe(5);
    expect(await e1('logs').where({ entidade: 'clientes' }).first()).toBeTruthy();
    expect(await e1('usuarios').whereNot('senha', '!').first()).toBeUndefined();

    const app = createApp({
      db: plat,
      logger: pino({ level: 'silent' }),
      mailer: memoryMailer(),
      appUrl: 'http://localhost:5173',
      webDist: '/nao-existe',
    });
    const a = request.agent(app);
    await a.post('/api/auth/login').send({ email: 'admin@sistema.com', senha: 'admin123' }).expect(200);
    expect((await a.get('/api/clientes?pageSize=100')).body.total).toBe(5);
    await fecharEspacos();
    await plat.destroy();
    fs.rmSync(pasta, { recursive: true, force: true });
    configurarEspacos({ plataforma: ctx.plataforma, dir: null, autoMigrar: true });
  });
});
