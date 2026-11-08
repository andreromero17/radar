// =============================================================================
// Motor do CRUD genérico: consulta (busca, filtros, período, ordenação, totais),
// gravação (validação, senhas, relações, hooks, log) e lixeira.
// As rotas (routes/crud.ts) só checam permissão e chamam estas funções, o que
// permite reaproveitar a mesma lógica em ações em lote e exportação.
// =============================================================================
import type { Knex } from 'knex';
import { getEntity, validateEntity, type AuthUser, type EntityDef, type FieldDef, type Row } from '@frame/shared';
import { hashPassword } from '../auth/password';
import { count, toDbValue, type Db } from '../db/knex';
import { hooks } from '../hooks';
import { badRequest, HttpError } from '../utils/http';
import { generateCode, nowLocal } from '../utils/time';
import { addLog, diffRecord, type Actor } from './logs';

/** Quem está operando (usuário logado) */
export interface OpCtx {
  db: Db;
  user: AuthUser;
  sessionId?: string;
  ip?: string;
}

export type Query = Record<string, unknown>;

const actorOf = (c: OpCtx): Actor => ({ id: c.user.id, nome: c.user.nome, ip: c.ip });
const RANGE_TYPES = new Set(['date', 'datetime', 'number', 'money', 'percent']);
const JSON_TYPES = new Set(['permissions', 'multiselect']);
export const TRASH_COLUMN = 'excluido_em';

/** Campos que podem ser usados em busca, filtro, ordenação e exportação (nunca senha) */
export const queryable = (ent: EntityDef) => ent.fields.filter((f) => f.type !== 'password');

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const values = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).map(str).filter((x): x is string => x !== '');

/** O que sai da API: sem senhas, com JSON já convertido */
export function present(ent: EntityDef, row: Row | undefined): Row | undefined {
  if (!row) return row;
  const out: Row = { ...row };
  for (const f of ent.fields) {
    if (f.type === 'password') delete out[f.name];
    if (JSON_TYPES.has(f.type) && typeof out[f.name] === 'string') {
      try {
        out[f.name] = JSON.parse(out[f.name] as string);
      } catch {
        out[f.name] = f.type === 'multiselect' ? [] : {};
      }
    }
  }
  return out;
}

/** O que vai para o banco */
function serialize(db: Db, ent: EntityDef, data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const f = ent.fields.find((x) => x.name === k);
    out[k] = f && JSON_TYPES.has(f.type) && v != null ? JSON.stringify(v) : toDbValue(db, v);
  }
  return out;
}

/** SELECT com o "nome" de cada relação: cliente_id → cliente_id__label */
function selectWithLabels(db: Db, table: string, ent: EntityDef) {
  const qb = db(table).select(`${table}.*`);
  ent.fields
    .filter((f) => f.type === 'relation' && f.entity)
    .forEach((f, i) => {
      const rel = getEntity(f.entity)!;
      qb.leftJoin(`${f.entity} as j${i}`, `j${i}.id`, `${table}.${f.name}`).select(
        `j${i}.${rel.labelField} as ${f.name}__label`,
      );
    });
  return qb;
}

/**
 * Aplica busca e filtros vindos da URL:
 *   q=texto                    busca nos campos `search`
 *   campo=valor                igual (repetível: campo=a&campo=b → "a ou b"; multiselect: contém)
 *   campo__de / campo__ate     intervalo (datas e números)
 *   campo__contem=texto        texto contém
 *   lixeira=1                  só os registros na lixeira
 */
export function applyFilters(db: Db, qb: Knex.QueryBuilder, table: string, ent: EntityDef, query: Query) {
  const col = (f: FieldDef) => `${table}.${f.name}`;
  const fields = queryable(ent);

  if (ent.lixeira) {
    if (query.lixeira === '1' || query.lixeira === 'true') qb.whereNotNull(`${table}.${TRASH_COLUMN}`);
    else qb.whereNull(`${table}.${TRASH_COLUMN}`);
  }

  const term = str(query.q);
  const searchable = fields.filter((f) => f.search);
  if (term && searchable.length) qb.where((w) => searchable.forEach((f) => w.orWhere(col(f), 'like', `%${term}%`)));

  for (const f of fields) {
    const eq = values(query[f.name]);
    if (eq.length) {
      if (f.type === 'boolean') qb.where(col(f), toDbValue(db, eq[0] === '1' || eq[0] === 'true'));
      else if (f.type === 'multiselect')
        qb.where((w) => eq.forEach((v) => w.orWhere(col(f), 'like', `%${JSON.stringify(v)}%`)));
      else if (eq.length > 1) qb.whereIn(col(f), eq);
      else qb.where(col(f), eq[0]);
    }

    if (RANGE_TYPES.has(f.type)) {
      const isNum = !['date', 'datetime'].includes(f.type);
      const de = str(query[`${f.name}__de`]);
      const ate = str(query[`${f.name}__ate`]);
      if (de)
        qb.where(col(f), '>=', isNum ? Number(de) : f.type === 'datetime' && de.length === 10 ? `${de} 00:00:00` : de);
      if (ate)
        qb.where(
          col(f),
          '<=',
          isNum ? Number(ate) : f.type === 'datetime' && ate.length === 10 ? `${ate} 23:59:59` : ate,
        );
    }

    const contem = str(query[`${f.name}__contem`]);
    if (contem) qb.where(col(f), 'like', `%${contem}%`);
  }
  return qb;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  /** Sem paginação (exportação) — respeita o limite */
  all?: boolean;
  limit?: number;
}

/** Lista com filtros, ordenação, paginação e totais das colunas com `total: 'sum'` */
export async function listRecords(db: Db, table: string, ent: EntityDef, query: Query, opts: ListOptions = {}) {
  const page = Math.max(1, opts.page ?? (Number(query.page) || 1));
  const pageSize = Math.min(1000, Math.max(1, opts.pageSize ?? (Number(query.pageSize) || 10)));
  const fields = queryable(ent);

  const sortable = ['id', 'criado_em', 'atualizado_em', ...fields.map((f) => f.name)];
  const sortField = sortable.includes(str(query.sort)) ? str(query.sort) : (ent.defaultSort?.field ?? 'id');
  const dir = query.dir === 'asc' || query.dir === 'desc' ? query.dir : (ent.defaultSort?.dir ?? 'desc');
  const sortDef = fields.find((f) => f.name === sortField);
  // relação ordena pelo nome do registro relacionado, não pelo id
  const orderCol = sortDef?.type === 'relation' ? `${sortField}__label` : `${table}.${sortField}`;

  const total = await count(applyFilters(db, db(table), table, ent, query));

  const totals: Record<string, number> = {};
  const summed = fields.filter((f) => f.total === 'sum');
  if (summed.length) {
    const qb = applyFilters(db, db(table), table, ent, query);
    summed.forEach((f) => qb.sum({ [f.name]: `${table}.${f.name}` }));
    const row = (await qb.first()) as Record<string, number | string | null> | undefined;
    for (const f of summed) totals[f.name] = Math.round(Number(row?.[f.name] ?? 0) * 100) / 100;
  }

  const qb = applyFilters(db, selectWithLabels(db, table, ent), table, ent, query)
    .orderBy(orderCol, dir)
    .orderBy(`${table}.id`, dir);
  if (opts.all) qb.limit(opts.limit ?? 50_000);
  else qb.limit(pageSize).offset((page - 1) * pageSize);
  const rows = ((await qb) as Row[]).map((r) => present(ent, r)!);

  return { rows, total, page, pageSize, ...(summed.length && { totais: totals }) };
}

export async function getRecord(db: Db, table: string, ent: EntityDef, id: number) {
  const row = await selectWithLabels(db, table, ent).where(`${table}.id`, id).first();
  if (!row) throw new HttpError(404, 'Registro não encontrado');
  return present(ent, row)!;
}

async function findRaw(db: Db, table: string, id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Registro não encontrado');
  const row = (await db(table).where({ id }).first()) as Row | undefined;
  if (!row) throw new HttpError(404, 'Registro não encontrado');
  return row;
}

/** Relações apontam para registros existentes (e compatíveis com o campo do qual dependem) */
async function checkRelations(db: Db, ent: EntityDef, data: Record<string, unknown>, current?: Row) {
  const errors: Record<string, string> = {};
  for (const f of ent.fields) {
    if (f.type !== 'relation' || !f.entity) continue;
    const touched = f.name in data || (f.dependsOn && f.dependsOn.field in data);
    const id = f.name in data ? data[f.name] : current?.[f.name];
    if (!touched || id == null) continue;
    const target = getEntity(f.entity);
    const rel = await db(f.entity).where({ id }).first();
    if (!rel || (target?.lixeira && rel[TRASH_COLUMN] && f.name in data)) {
      errors[f.name] = 'Registro selecionado não existe';
      continue;
    }
    if (f.dependsOn) {
      const parent = f.dependsOn.field in data ? data[f.dependsOn.field] : current?.[f.dependsOn.field];
      const param = f.dependsOn.param ?? f.dependsOn.field;
      if (parent != null && String(rel[param]) !== String(parent)) {
        const parentLabel = ent.fields.find((x) => x.name === f.dependsOn!.field)?.label ?? f.dependsOn.field;
        errors[f.name] = `Não combina com o campo ${parentLabel}`;
      }
    }
  }
  if (Object.keys(errors).length) throw badRequest('Verifique os campos', errors);
}

/** Valida, gera hash das senhas, confere relações e roda o hook beforeSave */
async function prepare(
  c: OpCtx,
  table: string,
  ent: EntityDef,
  body: unknown,
  mode: 'create' | 'update',
  current?: Row,
) {
  const v = validateEntity(ent, (body ?? {}) as Record<string, unknown>, mode);
  if (!v.ok) throw badRequest('Verifique os campos', v.errors);
  const data = v.data;
  for (const f of ent.fields) {
    if (f.type !== 'password') continue;
    if (data[f.name]) data[f.name] = await hashPassword(String(data[f.name]));
    else delete data[f.name];
  }
  await checkRelations(c.db, ent, data, current);
  const ctx = { db: c.db, actor: c.user, sessionId: c.sessionId, mode, current };
  await hooks[table]?.beforeSave?.(data, ctx);
  return { data, ctx };
}

export async function createRecord(c: OpCtx, table: string, ent: EntityDef, body: unknown) {
  const { data, ctx } = await prepare(c, table, ent, body, 'create');
  const record: Record<string, unknown> = { ...data, criado_em: nowLocal() };
  for (const f of ent.fields) if (f.auto === 'code') record[f.name] = generateCode(f.prefix);

  const [inserted] = await c
    .db(table)
    .insert(serialize(c.db, ent, record))
    .returning('id');
  const id = typeof inserted === 'object' ? inserted.id : inserted;
  const row = (await c.db(table).where({ id }).first()) as Row;
  await hooks[table]?.afterSave?.(row, data, ctx);
  await addLog(
    c.db,
    {
      entidade: table,
      registro_id: id,
      acao: 'criação',
      detalhe: String(record[ent.labelField] ?? ''),
      alteracoes: diffRecord(ent, null, record),
    },
    actorOf(c),
  );
  return present(ent, row)!;
}

export async function updateRecord(c: OpCtx, table: string, ent: EntityDef, id: number, body: unknown) {
  const current = await findRaw(c.db, table, id);
  if (ent.lixeira && current[TRASH_COLUMN])
    throw new HttpError(409, 'Registro está na lixeira. Restaure antes de editar.');
  const { data, ctx } = await prepare(c, table, ent, body, 'update', current);

  const alteracoes = diffRecord(ent, current, data);
  if (Object.keys(alteracoes).length) {
    await c
      .db(table)
      .where({ id })
      .update(serialize(c.db, ent, { ...data, atualizado_em: nowLocal() }));
  }
  const row = (await c.db(table).where({ id }).first()) as Row;
  await hooks[table]?.afterSave?.(row, data, ctx);
  if (Object.keys(alteracoes).length) {
    await addLog(
      c.db,
      { entidade: table, registro_id: id, acao: 'alteração', detalhe: String(row[ent.labelField] ?? ''), alteracoes },
      actorOf(c),
    );
  }
  return present(ent, row)!;
}

/**
 * Exclui. Com lixeira: a primeira exclusão só marca `excluido_em`; `definitivo`
 * apaga de vez (só para quem já está na lixeira). Sem lixeira: apaga direto.
 */
export async function removeRecord(c: OpCtx, table: string, ent: EntityDef, id: number, definitivo = false) {
  const current = await findRaw(c.db, table, id);
  const naLixeira = !!(ent.lixeira && current[TRASH_COLUMN]);
  const label = String(current[ent.labelField] ?? '');

  if (ent.lixeira && !definitivo) {
    if (naLixeira) throw new HttpError(409, 'Registro já está na lixeira');
    await hooks[table]?.beforeDelete?.(current, { db: c.db, actor: c.user, sessionId: c.sessionId });
    await c
      .db(table)
      .where({ id })
      .update({ [TRASH_COLUMN]: nowLocal() });
    await addLog(c.db, { entidade: table, registro_id: id, acao: 'enviado à lixeira', detalhe: label }, actorOf(c));
    return 'lixeira' as const;
  }
  if (ent.lixeira && !naLixeira) throw new HttpError(409, 'Envie para a lixeira antes de excluir definitivamente');
  if (!ent.lixeira) await hooks[table]?.beforeDelete?.(current, { db: c.db, actor: c.user, sessionId: c.sessionId });

  await c.db(table).where({ id }).del();
  await addLog(
    c.db,
    {
      entidade: table,
      registro_id: id,
      acao: ent.lixeira ? 'exclusão definitiva' : 'exclusão',
      detalhe: label,
      alteracoes: diffRecord(ent, current, null),
    },
    actorOf(c),
  );
  return 'excluido' as const;
}

export async function restoreRecord(c: OpCtx, table: string, ent: EntityDef, id: number) {
  if (!ent.lixeira) throw new HttpError(400, 'Esta entidade não usa lixeira');
  const current = await findRaw(c.db, table, id);
  if (!current[TRASH_COLUMN]) throw new HttpError(409, 'Registro não está na lixeira');
  await c
    .db(table)
    .where({ id })
    .update({ [TRASH_COLUMN]: null });
  await addLog(
    c.db,
    { entidade: table, registro_id: id, acao: 'restauração', detalhe: String(current[ent.labelField] ?? '') },
    actorOf(c),
  );
  return getRecord(c.db, table, ent, id);
}

/** Opções de select (id + nome), com filtros de igualdade (selects dependentes) */
export async function relationOptions(db: Db, table: string, ent: EntityDef, query: Query) {
  const qb = db(table).select('id', `${ent.labelField} as label`);
  if (ent.lixeira) qb.whereNull(TRASH_COLUMN);
  for (const f of queryable(ent)) {
    const v = values(query[f.name]);
    if (v.length) qb.whereIn(f.name, f.type === 'boolean' ? v.map((x) => toDbValue(db, x === '1' || x === 'true')) : v);
  }
  // inclui o valor atual do formulário mesmo que esteja filtrado/na lixeira
  const incluir = Number(query.incluir);
  if (incluir > 0) qb.orWhere('id', incluir);
  const rows = await qb.orderBy(ent.labelField, 'asc').limit(5000);
  return rows.map((r) => ({ value: r.id as number, label: String(r.label ?? r.id) }));
}

/** Esvazia da lixeira o que está lá há mais de `dias` (0 = nunca). Retorna quantos apagou. */
export async function purgeTrash(db: Db, entities: Record<string, EntityDef>, dias: number) {
  if (!dias) return 0;
  const limite = nowLocal(new Date(Date.now() - dias * 86_400_000));
  let n = 0;
  for (const [table, ent] of Object.entries(entities)) {
    if (!ent.lixeira) continue;
    n += await db(table).whereNotNull(TRASH_COLUMN).where(TRASH_COLUMN, '<', limite).del();
  }
  return n;
}
