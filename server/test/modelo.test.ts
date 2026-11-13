import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { inserir, type Db } from '../src/db/knex';
import { abrirEspaco, adicionarMembro, criarEspaco, espacoModelo, registrarCopiaDoModelo } from '../src/espacos';
import { nowLocal } from '../src/utils/time';
import { makeTestApp, type TestCtx } from './helpers';

// Frame 0.22.0: espaço MODELO. Espaços novos recebem dele o que o sistema registrar; o dono de um espaço que já
// existe traz as novidades quando quiser. O frame não sabe O QUE copiar: aqui uma biblioteca de teste.
async function garantirTabela(db: Db) {
  if (!(await db.schema.hasTable('biblioteca_teste')))
    await db.schema.createTable('biblioteca_teste', (t) => {
      t.increments('id');
      t.text('nome').notNullable();
      t.text('logo');
    });
}
registrarCopiaDoModelo({
  nome: 'Biblioteca de teste',
  async copiar(destino, modelo) {
    await garantirTabela(destino);
    let n = 0;
    for (const r of await modelo('biblioteca_teste').select('nome', 'logo')) {
      const tem = await destino('biblioteca_teste').where({ nome: r.nome }).first('id', 'logo');
      if (!tem) {
        await destino('biblioteca_teste').insert(r);
        n++;
      } else if (!tem.logo && r.logo) {
        await destino('biblioteca_teste').where({ id: tem.id }).update({ logo: r.logo });
        n++;
      }
    }
    return n;
  },
});

let ctx: TestCtx;
let ze: request.Agent;
let zeId: number;
let espacoZe: number;

async function novoUsuario(nome: string, email: string) {
  const perfil = await ctx.plataforma('perfis').where({ nome: 'Membro' }).first('id');
  return inserir(ctx.plataforma('usuarios'), {
    nome,
    email,
    perfil_id: perfil.id,
    senha: await hashPassword('senha12345'),
    ativo: 1,
    trocar_senha: 0,
    criado_em: nowLocal(),
  });
}
const entrar = async (email: string) => {
  const a = request.agent(ctx.app);
  await a.post('/api/auth/login').send({ email, senha: 'senha12345' }).expect(200);
  return a;
};

beforeAll(async () => {
  ctx = await makeTestApp();
  // o espaço de teste (do admin) é o que vira modelo: biblioteca com logo
  await garantirTabela(ctx.db);
  await ctx.db('biblioteca_teste').insert([
    { nome: 'Banco A', logo: 'data:image/png;base64,AAA' },
    { nome: 'Banco B', logo: 'data:image/png;base64,BBB' },
  ]);
  zeId = await novoUsuario('Zé Dono', 'ze@dono.com');
  espacoZe = await criarEspaco({ nome: 'Espaço do Zé', donoId: zeId }); // antes do modelo: nada copiado
  ze = await entrar('ze@dono.com');
});
afterAll(() => ctx.db.destroy());

describe('espaço modelo', () => {
  it('só o administrador marca o modelo; aparece na Plataforma', async () => {
    expect(await espacoModelo()).toBeNull();
    await ze.put(`/api/plataforma/espacos/${ctx.espacoId}/modelo`).send({ modelo: true }).expect(403);
    await ctx.admin.put(`/api/plataforma/espacos/${ctx.espacoId}/modelo`).send({ modelo: true }).expect(200);
    expect(await espacoModelo()).toBe(ctx.espacoId);
    const p = (await ctx.admin.get('/api/plataforma')).body.espacos as { id: number; modelo: boolean }[];
    expect(p.find((e) => e.id === ctx.espacoId)!.modelo).toBe(true);
    expect(p.filter((e) => e.modelo)).toHaveLength(1);
  });

  it('espaço novo nasce com o que o modelo tem', async () => {
    const outro = await novoUsuario('Ana Nova', 'ana@nova.com');
    const id = await criarEspaco({ nome: 'Espaço da Ana', donoId: outro });
    const db = await abrirEspaco(id);
    expect((await db('biblioteca_teste').orderBy('nome').pluck('nome')) as string[]).toEqual(['Banco A', 'Banco B']);
  });

  it('dono de espaço que já existia traz as novidades; não sobrescreve o que é dele', async () => {
    const db = await abrirEspaco(espacoZe);
    await garantirTabela(db);
    await db('biblioteca_teste').insert({ nome: 'Banco A', logo: 'data:image/png;base64,MEU' });
    expect((await ze.get('/api/espaco/modelo')).body.disponivel).toBe(true);
    const r = await ze.post('/api/espaco/modelo').send({}).expect(200);
    expect(r.body.total).toBe(1); // só o Banco B
    expect((await db('biblioteca_teste').where({ nome: 'Banco A' }).first('logo')).logo).toContain('MEU');
    expect(await db('biblioteca_teste').where({ nome: 'Banco B' }).first()).toBeTruthy();
    // de novo: nada a fazer
    expect((await ze.post('/api/espaco/modelo').send({}).expect(200)).body.total).toBe(0);
    // registrado no log do espaço
    expect(await db('logs').where({ acao: 'trazido do modelo' }).first()).toBeTruthy();
  });

  it('editor e leitor não trazem (só o dono)', async () => {
    for (const [nome, email, papel] of [
      ['Edu Editor', 'edu@ed.com', 'editor'],
      ['Léo Leitor', 'leo@le.com', 'leitor'],
    ] as const) {
      const id = await novoUsuario(nome, email);
      await adicionarMembro(espacoZe, id, papel);
      const a = await entrar(email);
      await a.post('/api/espaco/modelo').send({}).expect(403);
    }
  });

  it('no próprio modelo não há o que trazer', async () => {
    expect((await ctx.admin.get('/api/espaco/modelo')).body.disponivel).toBe(false);
    await ctx.admin.post('/api/espaco/modelo').send({}).expect(404);
  });

  it('só um modelo; espaço desativado não vira modelo e deixa de valer', async () => {
    await ctx.admin.put(`/api/plataforma/espacos/${espacoZe}/modelo`).send({ modelo: true }).expect(200);
    expect(await espacoModelo()).toBe(espacoZe);
    await ctx.admin.put(`/api/plataforma/espacos/${espacoZe}`).send({ ativo: false }).expect(200);
    expect(await espacoModelo()).toBeNull();
    await ctx.admin.put(`/api/plataforma/espacos/${ctx.espacoId}`).send({ ativo: false });
    const r = await ctx.admin.put(`/api/plataforma/espacos/${espacoZe}/modelo`).send({ modelo: true });
    expect(r.status).toBe(409);
  });
});
