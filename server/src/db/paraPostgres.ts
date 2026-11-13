// =============================================================================
// Cópia SQLite → Postgres (Fase 6A): leva uma instalação em arquivos (plataforma + um arquivo por espaço) para um
// banco Postgres vazio (plataforma no schema `public`, cada espaço no `espaco_<id>`), com os MESMOS ids.
//
//   1. migra os bancos de origem (precisam estar com o mesmo esquema do código) e o destino
//   2. copia tabela por tabela, na ordem das chaves estrangeiras (auto-referências gravadas depois)
//   3. acerta as sequências de id e confere as contagens
//
// Os arquivos SQLite não são alterados: dá para repetir num banco vazio e voltar atrás trocando a configuração.
// Os anexos ficam onde estão (UPLOAD_DIR).
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { createDb, createPgDb, isPg, listarTabelas, nomeSchema, type Db } from './knex';
import { migrateLatest, type TipoBanco } from './migrator';

type Log = (msg: string) => void;
const LOTE = 500;
const IGNORAR = (t: string) => t.startsWith('knex_') || t === 'sqlite_sequence';

interface Fk {
  coluna: string;
  referencia: string;
}

/** Chaves estrangeiras de cada tabela do schema (Postgres) */
async function chavesEstrangeiras(pg: Db): Promise<Map<string, Fk[]>> {
  const r = (await pg.raw(
    `select tc.table_name as tabela, kcu.column_name as coluna, ccu.table_name as referencia
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = current_schema()`,
  )) as { rows: { tabela: string; coluna: string; referencia: string }[] };
  const out = new Map<string, Fk[]>();
  for (const x of r.rows)
    out.set(x.tabela, [...(out.get(x.tabela) ?? []), { coluna: x.coluna, referencia: x.referencia }]);
  return out;
}

/** Ordem de cópia: quem é referenciado vem antes (auto-referência não conta) */
function ordenar(tabelas: string[], fks: Map<string, Fk[]>): string[] {
  const feitas = new Set<string>();
  const ordem: string[] = [];
  const visitar = (t: string, caminho: Set<string>) => {
    if (feitas.has(t) || caminho.has(t)) return;
    caminho.add(t);
    for (const fk of fks.get(t) ?? [])
      if (fk.referencia !== t && tabelas.includes(fk.referencia)) visitar(fk.referencia, caminho);
    feitas.add(t);
    ordem.push(t);
  };
  for (const t of [...tabelas].sort()) visitar(t, new Set());
  return ordem;
}

async function colunas(db: Db, tabela: string): Promise<string[]> {
  return Object.keys(await db(tabela).columnInfo());
}

/** Copia todas as tabelas de `origem` (SQLite) para `destino` (Postgres, schema já migrado). Devolve contagens */
export async function copiarBanco(origem: Db, destino: Db, log: Log = () => {}): Promise<Record<string, number>> {
  if (!isPg(destino)) throw new Error('O destino precisa ser Postgres');
  const tabelasOrigem = new Set((await listarTabelas(origem)).filter((t) => !IGNORAR(t)));
  const tabelasDestino = (await listarTabelas(destino)).filter((t) => !IGNORAR(t) && tabelasOrigem.has(t));
  const soNaOrigem = [...tabelasOrigem].filter((t) => !tabelasDestino.includes(t));
  if (soNaOrigem.length) log(`   (fora das migrações, não copiadas: ${soNaOrigem.join(', ')})`);
  const fks = await chavesEstrangeiras(destino);
  const ordem = ordenar(tabelasDestino, fks);

  // destino limpo (as migrações já inserem dados padrão, como perfis e categorias): os da origem valem
  if (ordem.length) await destino.raw(`truncate ${ordem.map(() => '??').join(', ')} restart identity cascade`, ordem);

  const contagens: Record<string, number> = {};
  for (const t of ordem) {
    const cols = await colunas(destino, t);
    const daOrigem = new Set(await colunas(origem, t));
    const comuns = cols.filter((c) => daOrigem.has(c));
    const autoRef = (fks.get(t) ?? []).filter((f) => f.referencia === t).map((f) => f.coluna);
    const temId = comuns.includes('id');
    let total = 0;
    const adiadas: { id: unknown; valores: Record<string, unknown> }[] = [];
    for (let offset = 0; ; offset += LOTE) {
      const q = origem(t).select(comuns).limit(LOTE).offset(offset);
      if (temId) q.orderBy('id');
      const linhas = (await q) as Record<string, unknown>[];
      if (!linhas.length) break;
      const prontas = linhas.map((l) => {
        const out = { ...l };
        // auto-referência (ex.: subcategoria → categoria pai): grava vazio e acerta depois
        if (autoRef.length && temId) {
          const valores: Record<string, unknown> = {};
          for (const c of autoRef)
            if (out[c] != null) {
              valores[c] = out[c];
              out[c] = null;
            }
          if (Object.keys(valores).length) adiadas.push({ id: out.id, valores });
        }
        return out;
      });
      await destino(t).insert(prontas);
      total += linhas.length;
    }
    for (const a of adiadas) await destino(t).where({ id: a.id }).update(a.valores);
    // ids gravados como vieram: a sequência continua depois do maior (tabelas com id texto não têm sequência)
    const seq = temId
      ? ((await destino.raw(`select pg_get_serial_sequence(?, 'id') as s`, [t])) as { rows: { s: string | null }[] })
          .rows[0]?.s
      : null;
    if (seq) {
      const max = Number((await destino(t).max({ m: 'id' }).first())?.m ?? 0);
      await destino.raw('select setval(?, ?, ?)', [seq, Math.max(max, 1), max > 0]);
    }
    contagens[t] = total;
    log(`   ${t}: ${total}`);
  }

  // conferência: mesma quantidade em cada tabela
  for (const t of ordem) {
    const [a, b] = await Promise.all([origem(t).count({ n: '*' }).first(), destino(t).count({ n: '*' }).first()]);
    if (Number(a?.n) !== Number(b?.n)) throw new Error(`Contagem diferente em ${t}: origem ${a?.n}, destino ${b?.n}`);
  }
  return contagens;
}

async function migrar(db: Db, tipo: TipoBanco) {
  await migrateLatest(db, tipo);
}

/**
 * Leva a instalação SQLite inteira para o Postgres. O destino precisa estar vazio (sem a tabela `espacos` no
 * public), a não ser com `substituir` (apaga o que houver lá antes).
 */
export async function copiarParaPostgres(opts: {
  plataformaSqlite: string;
  espacosDir: string;
  pgUrl: string;
  substituir?: boolean;
  log?: Log;
}) {
  const log = opts.log ?? (() => {});
  if (!fs.existsSync(opts.plataformaSqlite))
    throw new Error(`Não achei o banco da plataforma: ${opts.plataformaSqlite}`);
  const admin = createPgDb(opts.pgUrl, 'public', { max: 1 });
  const origemPlat = createDb(opts.plataformaSqlite);
  try {
    if (await admin.schema.hasTable('espacos')) {
      if (!opts.substituir)
        throw new Error('O Postgres de destino já tem dados (tabela espacos). Use um banco vazio ou --substituir.');
      const schemas = (await admin('information_schema.schemata')
        .where('schema_name', 'like', 'espaco\\_%')
        .pluck('schema_name')) as string[];
      for (const s of schemas) await admin.raw('drop schema ?? cascade', [s]);
      await admin.raw('drop schema public cascade');
      await admin.raw('create schema public');
    }

    log('Plataforma');
    await migrar(origemPlat, 'plataforma');
    await migrar(admin, 'plataforma');
    const resumo: Record<string, Record<string, number>> = { plataforma: await copiarBanco(origemPlat, admin, log) };

    const ids = ((await origemPlat('espacos').orderBy('id').pluck('id')) as number[]).map(Number);
    for (const id of ids) {
      const arquivo = path.join(opts.espacosDir, `${id}.db`);
      if (!fs.existsSync(arquivo)) {
        log(`Espaço ${id}: sem arquivo (${arquivo}) — pulado`);
        continue;
      }
      log(`Espaço ${id}`);
      const schema = nomeSchema(`espaco_${id}`);
      await admin.raw('create schema if not exists ??', [schema]);
      const origem = createDb(arquivo);
      const destino = createPgDb(opts.pgUrl, schema, { max: 1 });
      try {
        await migrar(origem, 'espaco');
        await migrar(destino, 'espaco');
        resumo[`espaco_${id}`] = await copiarBanco(origem, destino, log);
      } finally {
        await origem.destroy();
        await destino.destroy();
      }
    }
    return resumo;
  } finally {
    await origemPlat.destroy();
    await admin.destroy();
  }
}
