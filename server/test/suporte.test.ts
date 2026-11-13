import { inserir } from '../src/db/knex';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { base32, codigoDoPasso, conferirCodigo, passoAtual } from '../src/auth/totp';
import { createEntityTable } from '../src/db/diff';
import { abrirEspaco, criarEspaco } from '../src/espacos';
import { configurarDoisFatores } from '../src/services/doisFatores';
import { nowLocal } from '../src/utils/time';
import { fixtureEntities } from './fixtures';
import { makeTestApp, type TestCtx } from './helpers';

// Fase 5C: verificação em duas etapas, painel da plataforma e acesso de suporte com consentimento do dono
let ctx: TestCtx;
const SENHA = 'senhaBoa123';

async function conta(nome: string, email: string, perfilNome = 'Membro') {
  const perfil = await ctx.plataforma('perfis').where({ nome: perfilNome }).first('id');
  const id = await inserir(ctx.plataforma('usuarios'), {
    nome,
    email,
    perfil_id: perfil.id,
    senha: await hashPassword(SENHA),
    ativo: 1,
    trocar_senha: 0,
    criado_em: nowLocal(),
  });
  return Number(id);
}

beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => ctx.db.destroy());

describe('TOTP (RFC 6238)', () => {
  it('bate com o vetor de teste da RFC e tolera um passo de relógio', () => {
    const segredo = base32(Buffer.from('12345678901234567890'));
    expect(segredo).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(codigoDoPasso(segredo, 1)).toBe('287082'); // T = 59 s
    expect(codigoDoPasso(segredo, 37037036)).toBe('081804'); // T = 1111111109 s
    const agora = 1111111109 * 1000;
    expect(conferirCodigo(segredo, '081804', null, agora)).toBe(37037036);
    expect(conferirCodigo(segredo, '081804', 37037036, agora)).toBeNull(); // já usado
    expect(conferirCodigo(segredo, '000000', null, agora)).toBeNull();
  });
});

describe('verificação em duas etapas', () => {
  let eu: request.Agent;
  let segredo = '';
  let recuperacao: string[] = [];
  const codigo = (desloc = 0) => codigoDoPasso(segredo, passoAtual() + desloc);

  beforeAll(async () => {
    await conta('Duas Etapas', 'duas@x.com');
    eu = await ctx.login('duas@x.com', SENHA);
  });

  it('configura: confirma a senha, QR, primeiro código, 8 códigos de recuperação', async () => {
    expect((await eu.post('/api/auth/2fa/iniciar').send({ senha: 'errada' })).status).toBe(422);
    const ini = await eu.post('/api/auth/2fa/iniciar').send({ senha: SENHA });
    expect(ini.status).toBe(200);
    expect(ini.body.qr).toContain('<svg');
    expect(ini.body.uri).toMatch(/^otpauth:\/\/totp\//);
    segredo = ini.body.segredo;
    expect((await eu.post('/api/auth/2fa/ativar').send({ codigo: '000000' })).status).toBe(422);
    const ok = await eu.post('/api/auth/2fa/ativar').send({ codigo: codigo() });
    expect(ok.status).toBe(200);
    recuperacao = ok.body.codigos;
    expect(recuperacao).toHaveLength(8);
    expect(ok.body.usuario.dois_fatores).toBe(true);
    expect((await eu.get('/api/auth/2fa')).body).toMatchObject({ ativo: true, codigos_restantes: 8 });
  });

  it('o segredo nunca sai da API', async () => {
    const lista = JSON.stringify((await ctx.admin.get('/api/usuarios?pageSize=100')).body);
    expect(lista).not.toContain('segredo');
    expect(lista).not.toContain(segredo);
    const u = await ctx.plataforma('usuarios').where({ email: 'duas@x.com' }).first('id');
    expect(JSON.stringify((await ctx.admin.get(`/api/usuarios/${u.id}`)).body)).not.toContain(segredo);
    expect(JSON.stringify((await ctx.admin.get('/api/plataforma')).body)).not.toContain(segredo);
  });

  it('login: a senha só abre o desafio; a sessão vem com o código (e o mesmo código não vale de novo)', async () => {
    const a = request.agent(ctx.app);
    const r = await a.post('/api/auth/login').send({ email: 'duas@x.com', senha: SENHA });
    expect(r.body).toEqual({ segundo_fator: true, desafio: expect.any(String) });
    expect(r.headers['set-cookie']).toBeUndefined();
    expect((await a.get('/api/auth/me')).status).toBe(401);
    expect((await a.post('/api/auth/2fa/entrar').send({ desafio: r.body.desafio, codigo: '111111' })).status).toBe(422);
    const c = codigo(1);
    const ok = await a.post('/api/auth/2fa/entrar').send({ desafio: r.body.desafio, codigo: c });
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe('duas@x.com');
    expect((await a.get('/api/auth/me')).status).toBe(200);
    // desafio usado não serve de novo; código usado não serve noutro login
    expect((await a.post('/api/auth/2fa/entrar').send({ desafio: r.body.desafio, codigo: c })).body.code).toBe(
      'DESAFIO_EXPIRADO',
    );
    const r2 = await request(ctx.app).post('/api/auth/login').send({ email: 'duas@x.com', senha: SENHA });
    expect(
      (await request(ctx.app).post('/api/auth/2fa/entrar').send({ desafio: r2.body.desafio, codigo: c })).status,
    ).toBe(422);
  });

  it('código de recuperação entra uma vez só', async () => {
    const entrar = async () => {
      const r = await request(ctx.app).post('/api/auth/login').send({ email: 'duas@x.com', senha: SENHA });
      return request(ctx.app)
        .post('/api/auth/2fa/entrar')
        .send({ desafio: r.body.desafio, codigo: recuperacao[0].toLowerCase() });
    };
    expect((await entrar()).status).toBe(200);
    expect((await entrar()).status).toBe(422);
    expect((await eu.get('/api/auth/2fa')).body.codigos_restantes).toBe(7);
  });

  it('5 códigos errados derrubam o desafio', async () => {
    const r = await request(ctx.app).post('/api/auth/login').send({ email: 'duas@x.com', senha: SENHA });
    let res: request.Response | undefined;
    for (let i = 0; i < 5; i++)
      res = await request(ctx.app)
        .post('/api/auth/2fa/entrar')
        .send({ desafio: r.body.desafio, codigo: '12345' + i });
    expect(res!.body.code).toBe('DESAFIO_EXPIRADO');
  });

  it('desligar pede senha e código', async () => {
    expect((await eu.post('/api/auth/2fa/desativar').send({ senha: SENHA, codigo: '000000' })).status).toBe(422);
    const ok = await eu.post('/api/auth/2fa/desativar').send({ senha: SENHA, codigo: recuperacao[1] });
    expect(ok.status).toBe(200);
    expect(ok.body.dois_fatores).toBe(false);
    const direto = await request(ctx.app).post('/api/auth/login').send({ email: 'duas@x.com', senha: SENHA });
    expect(direto.body.segundo_fator).toBeUndefined(); // login direto de novo
  });

  describe('obrigatória para administrador', () => {
    afterEach(() => configurarDoisFatores({ exigirParaAdmin: false }));

    it('sem configurar, o administrador só acessa a configuração; depois, tudo', async () => {
      configurarDoisFatores({ exigirParaAdmin: true });
      const id = await conta('Admin Novo', 'admin2@x.com', 'Administrador');
      await criarEspaco({ nome: 'Do admin 2', donoId: id });
      const a = await ctx.login('admin2@x.com', SENHA);
      const bloqueado = await a.get('/api/membros');
      expect(bloqueado.status).toBe(403);
      expect(bloqueado.body.code).toBe('CONFIGURAR_2FA');
      expect((await a.get('/api/auth/me')).body.exige_2fa).toBe(true);
      const ini = await a.post('/api/auth/2fa/iniciar').send({ senha: SENHA });
      await a
        .post('/api/auth/2fa/ativar')
        .send({ codigo: codigoDoPasso(ini.body.segredo, passoAtual()) })
        .expect(200);
      expect((await a.get('/api/membros')).status).toBe(200);
      // e não pode desligar
      expect((await a.post('/api/auth/2fa/desativar').send({ senha: SENHA, codigo: '1' })).status).toBe(403);
    });
  });
});

describe('painel da plataforma', () => {
  it('só administrador; só metadados, nada de dentro dos espaços', async () => {
    expect((await ctx.operador.get('/api/plataforma')).status).toBe(403);
    const r = await ctx.admin.get('/api/plataforma');
    expect(r.status).toBe(200);
    expect(r.body.totais.espacos).toBeGreaterThan(0);
    expect(r.body.espacos[0]).toMatchObject({ nome: 'Espaço de teste', membros: expect.any(Number) });
    const texto = JSON.stringify(r.body);
    for (const dado of ['Padaria Bom Dia', 'Construtora Horizonte', 'Cliente Teste Hugo'])
      expect(texto).not.toContain(dado);
  });

  it('desativa e reativa conta (não a própria); desliga o 2FA de alguém', async () => {
    const id = await conta('Desativável', 'desat@x.com');
    await criarEspaco({ nome: 'Do desativável', donoId: id });
    const a = await ctx.login('desat@x.com', SENHA);
    await ctx.admin.put(`/api/plataforma/usuarios/${id}`).send({ ativo: false }).expect(200);
    expect((await a.get('/api/auth/me')).status).toBe(401);
    expect((await ctx.login('desat@x.com', SENHA).catch((e) => e)) instanceof Error).toBe(true);
    await ctx.admin.put(`/api/plataforma/usuarios/${id}`).send({ ativo: true }).expect(200);
    const admin = await ctx.plataforma('usuarios').where({ email: 'admin@sistema.com' }).first('id');
    expect((await ctx.admin.put(`/api/plataforma/usuarios/${admin.id}`).send({ ativo: false })).status).toBe(409);
    await ctx.admin.post(`/api/plataforma/usuarios/${id}/2fa`).expect(200);
  });

  it('espaço desativado: ninguém entra; reativado volta', async () => {
    const id = await conta('Dono E', 'donoe@x.com');
    const esp = await criarEspaco({ nome: 'Espaço E', donoId: id });
    const a = await ctx.login('donoe@x.com', SENHA);
    expect((await a.get('/api/membros')).status).toBe(200);
    await ctx.admin.put(`/api/plataforma/espacos/${esp}`).send({ ativo: false }).expect(200);
    expect((await a.get('/api/membros')).body.code).toBe('SEM_ESPACO');
    await ctx.admin.put(`/api/plataforma/espacos/${esp}`).send({ ativo: true }).expect(200);
    expect((await a.get('/api/membros')).status).toBe(200);
  });
});

describe('acesso de suporte', () => {
  let ze: request.Agent;
  let espacoB: number;

  beforeAll(async () => {
    const zeId = await conta('Zé Dono', 'ze@suporte.com');
    espacoB = await criarEspaco({ nome: 'Casa do Zé', donoId: zeId });
    const dbB = await abrirEspaco(espacoB);
    for (const [t, ent] of Object.entries(fixtureEntities)) await createEntityTable(dbB, t, ent);
    await dbB('clientes').insert({ nome: 'Segredo do Zé', email: 's@ze.com', ativo: 1, criado_em: nowLocal() });
    ze = await ctx.login('ze@suporte.com', SENHA);
  });

  const nomesClientes = async (a: request.Agent) =>
    ((await a.get('/api/clientes?pageSize=100')).body.rows ?? []).map((r: { nome: string }) => r.nome);

  it('sem liberação do dono, o administrador não entra', async () => {
    const r = await ctx.admin.post(`/api/plataforma/suporte/${espacoB}`);
    expect(r.status).toBe(403);
    expect(await nomesClientes(ctx.admin)).not.toContain('Segredo do Zé');
  });

  it('só o dono libera; não-administrador não entra mesmo com liberação', async () => {
    expect((await ctx.operador.post('/api/suporte').send({ horas: 24, papel: 'leitor' })).status).toBe(403);
    expect((await ze.post('/api/suporte').send({ horas: 5, papel: 'leitor' })).status).toBe(422);
    const l = await ze.post('/api/suporte').send({ horas: 24, papel: 'leitor' });
    expect(l.status).toBe(201);
    expect(l.body.papel).toBe('leitor');
    expect((await ctx.operador.post(`/api/plataforma/suporte/${espacoB}`)).status).toBe(403);
  });

  it('com liberação: entra como leitor, vê, não altera, aparece como suporte e fica no log do dono', async () => {
    const r = await ctx.admin.post(`/api/plataforma/suporte/${espacoB}`);
    expect(r.status).toBe(200);
    const me = (await ctx.admin.get('/api/auth/me')).body;
    expect(me.espaco).toMatchObject({ id: espacoB, papel: 'leitor', suporte: { ate: expect.any(String) } });
    expect(me.nome).toMatch(/\(suporte\)$/);
    expect(await nomesClientes(ctx.admin)).toEqual(['Segredo do Zé']);
    expect((await ctx.admin.post('/api/clientes').send({ nome: 'x' })).status).toBe(403);
    expect((await ctx.admin.get('/api/backup/info')).status).toBe(403);
    expect((await ctx.admin.post('/api/suporte').send({ horas: 168, papel: 'editor' })).status).toBe(403);
    // não virou membro
    expect((await ze.get('/api/membros')).body.membros.map((m: { email: string }) => m.email)).toEqual([
      'ze@suporte.com',
    ]);
    const hist = (await ze.get('/api/suporte')).body.historico;
    expect(hist[0]).toMatchObject({ acao: 'suporte entrou', usuario: 'Usuário Administrador (suporte)' });
  });

  it('o dono revoga e o suporte sai na hora', async () => {
    await ze.delete('/api/suporte').expect(204);
    const me = (await ctx.admin.get('/api/auth/me')).body;
    expect(me.espaco.suporte).toBeUndefined();
    expect(me.espaco.id).toBe(ctx.espacoId);
    expect(await nomesClientes(ctx.admin)).not.toContain('Segredo do Zé');
    expect((await ctx.admin.post(`/api/plataforma/suporte/${espacoB}`)).status).toBe(403);
  });

  it('como editor, o que o suporte grava sai no log com "(suporte)"; sair volta ao espaço próprio', async () => {
    await ze.post('/api/suporte').send({ horas: 72, papel: 'editor' }).expect(201);
    await ctx.admin.post(`/api/plataforma/suporte/${espacoB}`).expect(200);
    const c = await ctx.admin.post('/api/clientes').send({ nome: 'Ajuste do suporte', email: 'aj@x.com', ativo: true });
    expect(c.status).toBe(201);
    const logs = (await ze.get('/api/logs?pageSize=50')).body.rows;
    expect(logs.find((l: { detalhe: string }) => l.detalhe === 'Ajuste do suporte')?.usuario).toBe(
      'Usuário Administrador (suporte)',
    );
    await ctx.admin.post('/api/plataforma/suporte/sair').expect(200);
    expect((await ctx.admin.get('/api/auth/me')).body.espaco.id).toBe(ctx.espacoId);
    expect((await ze.get('/api/suporte')).body.historico[0].acao).toBe('suporte saiu');
  });

  it('prazo vencido: a sessão de suporte cai sozinha', async () => {
    await ctx.admin.post(`/api/plataforma/suporte/${espacoB}`).expect(200);
    await ctx.plataforma('acessos_suporte').where({ espaco_id: espacoB }).update({ expira_em: '2000-01-01 00:00:00' });
    expect(await nomesClientes(ctx.admin)).not.toContain('Segredo do Zé');
    expect((await ctx.admin.get('/api/auth/me')).body.espaco.id).toBe(ctx.espacoId);
  });

  it('o painel mostra quais espaços liberaram o suporte', async () => {
    await ze.post('/api/suporte').send({ horas: 24, papel: 'leitor' }).expect(201);
    const e = (await ctx.admin.get('/api/plataforma')).body.espacos.find((x: { id: number }) => x.id === espacoB);
    expect(e.suporte).toMatchObject({ papel: 'leitor', liberado_por: 'Zé Dono' });
    // membro do espaço não entra "como suporte": usa o seletor
    expect((await ctx.admin.post(`/api/plataforma/suporte/${ctx.espacoId}`)).status).toBe(409);
  });
});
