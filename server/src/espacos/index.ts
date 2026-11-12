// =============================================================================
// Espaços (Fase 5A): cada espaço (as finanças de um assinante: pessoal, holding,
// empresa...) tem o PRÓPRIO banco. A plataforma guarda usuários, sessões,
// identidade, espaços e membros. Isolamento pela estrutura: o código do sistema
// recebe `db` e esse `db` aponta sempre para o banco do espaço da sessão
// (AsyncLocalStorage), nunca para outro.
//
//   configurarEspacos({ plataforma, dir })   no boot (ou nos testes, dir: null = memória)
//   abrirEspaco(id)                          banco do espaço (aberto sob demanda, migrado, em cache)
//   comEspaco(id, fn)                        roda `fn` com o espaço ativo (manutenção, scripts)
//   dbEspaco                                 `db` do espaço ATIVO (proxy) — o que os routers usam
// =============================================================================
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import type { Knex } from 'knex';
import { createDb, toDbValue, type Db } from '../db/knex';
import { migrateLatest, migrationStatus } from '../db/migrator';
import { nowLocal } from '../utils/time';
import { HttpError } from '../utils/http';

export type Papel = 'dono' | 'editor' | 'leitor';
export const PAPEIS: Papel[] = ['dono', 'editor', 'leitor'];

export interface EspacoInfo {
  id: number;
  nome: string;
  tipo: string;
  papel: Papel;
}

interface Opcoes {
  plataforma: Db;
  /** Pasta dos bancos (data/espacos); null = bancos em memória (testes) */
  dir: string | null;
  /** Aplica migrações pendentes ao abrir (dev e testes). Em produção: false → espaço desatualizado não abre */
  autoMigrar: boolean;
  /** Quantos bancos manter abertos (os menos usados fecham) */
  maxAbertos?: number;
}

let cfg: Opcoes | null = null;
const abertos = new Map<number, { db: Db; usado: number }>();
const abrindo = new Map<number, Promise<Db>>();

export function configurarEspacos(opts: Opcoes) {
  cfg = opts;
  // nova plataforma (boot ou outro teste): esquece os bancos abertos da anterior
  abertos.clear();
  abrindo.clear();
}

const conf = () => {
  if (!cfg) throw new Error('Espaços não configurados (configurarEspacos no boot)');
  return cfg;
};

export const plataformaDb = () => conf().plataforma;

/** Arquivo do banco de um espaço (null em memória) */
export const arquivoEspaco = (id: number) => (conf().dir ? path.join(conf().dir!, `${id}.db`) : null);

/** Banco do espaço: abre (criando o arquivo e migrando, se preciso), guarda em cache e devolve */
export async function abrirEspaco(id: number): Promise<Db> {
  const c = abertos.get(id);
  if (c) {
    c.usado = Date.now();
    return c.db;
  }
  const p = abrindo.get(id);
  if (p) return p;
  const promessa = (async () => {
    const existe = await conf().plataforma('espacos').where({ id }).first('id');
    if (!existe) throw new HttpError(404, 'Espaço não encontrado');
    const arquivo = arquivoEspaco(id);
    if (arquivo) fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    const db = createDb(arquivo ?? ':memory:');
    try {
      if (conf().autoMigrar) await migrateLatest(db, 'espaco');
      else {
        const { pending } = await migrationStatus(db, 'espaco');
        if (pending.length) throw new HttpError(503, 'Este espaço está sendo atualizado. Tente de novo em instantes.');
      }
      await sincronizarUsuarios(id, db);
    } catch (err) {
      await db.destroy();
      throw err;
    }
    abertos.set(id, { db, usado: Date.now() });
    await fecharExcedentes();
    return db;
  })();
  abrindo.set(id, promessa);
  try {
    return await promessa;
  } finally {
    abrindo.delete(id);
  }
}

async function fecharExcedentes() {
  const max = conf().maxAbertos ?? 100;
  if (!conf().dir || abertos.size <= max) return; // em memória fechar = perder os dados
  const ordem = [...abertos.entries()].sort((a, b) => a[1].usado - b[1].usado);
  for (const [id, { db }] of ordem.slice(0, abertos.size - max)) {
    abertos.delete(id);
    await db.destroy();
  }
}

export async function fecharEspacos() {
  for (const { db } of abertos.values()) await db.destroy();
  abertos.clear();
}

// ---------------------------------------------------------------- contexto da requisição

interface Contexto {
  espacoId: number;
  db: Db;
  papel?: Papel;
}
const als = new AsyncLocalStorage<Contexto>();

/** Espaço ativo (id, banco, papel do usuário) — erro se não houver */
export function espacoAtivo(): Contexto {
  const c = als.getStore();
  if (!c) throw new HttpError(500, 'Nenhum espaço ativo nesta operação');
  return c;
}
export const espacoAtivoOuNulo = () => als.getStore() ?? null;

/** Roda `fn` com o espaço ativo (todo `dbEspaco` dentro dela aponta para ele) */
export async function comEspaco<T>(id: number, fn: (db: Db) => Promise<T>, papel?: Papel): Promise<T> {
  const db = await abrirEspaco(id);
  return als.run({ espacoId: id, db, papel }, () => fn(db));
}

/** Para o middleware: entra no contexto e segue a requisição */
export const entrarNoEspaco = (ctx: Contexto, next: () => void) => als.run(ctx, next);

/**
 * `db` do espaço ATIVO. É um proxy: cada uso pega o banco do contexto da requisição. Sem espaço ativo, dá erro
 * em vez de cair em outro banco — é isso que garante que uma consulta nunca alcance outro espaço.
 */
export const dbEspaco: Db = new Proxy(function () {} as unknown as Db, {
  apply(_alvo, thisArg, args) {
    return Reflect.apply(espacoAtivo().db as unknown as (...a: unknown[]) => unknown, thisArg, args);
  },
  get(_alvo, prop) {
    const db = espacoAtivo().db as unknown as Record<string | symbol, unknown>;
    const v = db[prop];
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(db) : v;
  },
}) as Db;

// ---------------------------------------------------------------- espaços e membros (plataforma)

/** Espaços ativos em que o usuário é membro ativo, com o papel */
export async function espacosDoUsuario(usuarioId: number): Promise<EspacoInfo[]> {
  const p = conf().plataforma;
  return (await p('membros as m')
    .join('espacos as e', 'e.id', 'm.espaco_id')
    .where('m.usuario_id', usuarioId)
    .whereIn('m.ativo', [1, true])
    .whereIn('e.ativo', [1, true])
    .orderBy('e.id')
    .select('e.id', 'e.nome', 'e.tipo', 'm.papel')) as EspacoInfo[];
}

export async function idsEspacosAtivos(): Promise<number[]> {
  return (await conf().plataforma('espacos').whereIn('ativo', [1, true]).orderBy('id').select('id')).map((r) =>
    Number(r.id),
  );
}

/** Ids dos membros ativos de um espaço */
export async function membrosAtivos(espacoId: number): Promise<number[]> {
  return (
    await conf()
      .plataforma('membros as m')
      .join('usuarios as u', 'u.id', 'm.usuario_id')
      .where('m.espaco_id', espacoId)
      .whereIn('m.ativo', [1, true])
      .whereIn('u.ativo', [1, true])
      .select('m.usuario_id')
  ).map((r) => Number(r.usuario_id));
}

/** Cria um espaço com o dono (e já abre o banco dele, migrado) */
export async function criarEspaco(dados: { nome: string; tipo?: string; donoId: number }): Promise<number> {
  const p = conf().plataforma;
  const agora = nowLocal();
  const [id] = await p('espacos').insert({
    nome: dados.nome,
    tipo: dados.tipo ?? 'pessoal',
    dono_id: dados.donoId,
    ativo: toDbValue(p, true),
    criado_em: agora,
  });
  await adicionarMembro(Number(id), dados.donoId, 'dono');
  await abrirEspaco(Number(id));
  return Number(id);
}

export async function adicionarMembro(espacoId: number, usuarioId: number, papel: Papel) {
  const p = conf().plataforma;
  await p('membros')
    .insert({ espaco_id: espacoId, usuario_id: usuarioId, papel, ativo: toDbValue(p, true), criado_em: nowLocal() })
    .onConflict(['espaco_id', 'usuario_id'])
    .merge(['papel', 'ativo']);
  const aberto = abertos.get(espacoId);
  if (aberto) await sincronizarUsuarios(espacoId, aberto.db);
}

/**
 * O banco do espaço tem uma cópia LEVE dos usuários que são membros (id, nome, e-mail, ativo) — sem senha —
 * para os nomes nos logs/anexos e as chaves estrangeiras. Quem decide acesso é sempre a plataforma.
 */
export async function sincronizarUsuarios(espacoId: number, db: Db) {
  const p = conf().plataforma;
  const membros = (await p('membros as m')
    .join('usuarios as u', 'u.id', 'm.usuario_id')
    .where('m.espaco_id', espacoId)
    .select('u.id', 'u.nome', 'u.email', 'u.ativo', 'm.ativo as membro_ativo', 'u.criado_em')) as {
    id: number;
    nome: string;
    email: string;
    ativo: unknown;
    membro_ativo: unknown;
    criado_em: string;
  }[];
  const perfil = await db('perfis').orderBy('id').first('id');
  await db.transaction(async (trx: Knex.Transaction) => {
    for (const m of membros) {
      const linha = {
        nome: m.nome,
        email: m.email,
        ativo: toDbValue(db, !!m.ativo && !!m.membro_ativo),
      };
      const existe = await trx('usuarios').where({ id: m.id }).first('id');
      if (existe) await trx('usuarios').where({ id: m.id }).update(linha);
      else
        await trx('usuarios').insert({
          id: m.id,
          ...linha,
          perfil_id: perfil?.id,
          senha: '!',
          trocar_senha: toDbValue(db, false),
          criado_em: m.criado_em ?? nowLocal(),
        });
    }
    // nada de credencial no banco do espaço (o backup do espaço é baixável)
    await trx('usuarios').whereNot('senha', '!').update({ senha: '!' });
    await trx('sessoes').del();
    await trx('tokens_senha').del();
  });
}

/** Status de migração de todos os espaços (CLI) */
export async function migrarTodos(): Promise<{ id: number; aplicadas: string[] }[]> {
  const out = [];
  for (const id of await idsEspacosAtivos()) {
    const arquivo = arquivoEspaco(id);
    const db = abertos.get(id)?.db ?? createDb(arquivo ?? ':memory:');
    try {
      out.push({ id, aplicadas: await migrateLatest(db, 'espaco') });
    } finally {
      if (!abertos.has(id)) await db.destroy();
    }
  }
  return out;
}

/** Ids de todos os membros do espaço (ativos ou não): o escopo de "usuários" dentro dele */
export async function idsDosMembros(espacoId: number): Promise<number[]> {
  return (await conf().plataforma('membros').where({ espaco_id: espacoId }).select('usuario_id')).map((r) =>
    Number(r.usuario_id),
  );
}

/** Id do espaço dono de um banco já aberto (ou null) */
export function espacoDoBanco(db: Db): number | null {
  for (const [id, a] of abertos) if (a.db === db) return id;
  return null;
}

/** Atualiza a cópia leve do usuário nos espaços abertos em que ele é membro */
export async function atualizarCopias(usuarioId: number) {
  const ids = (await conf().plataforma('membros').where({ usuario_id: usuarioId }).select('espaco_id')).map((r) =>
    Number(r.espaco_id),
  );
  for (const id of ids) {
    const a = abertos.get(id);
    if (a) await sincronizarUsuarios(id, a.db);
  }
}
