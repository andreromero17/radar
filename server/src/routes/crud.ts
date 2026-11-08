import { Router, type Request } from 'express';
import type { Knex } from 'knex';
import { getEntity, validateEntity, type EntityDef, type ListResponse, type Row } from '@frame/shared';
import { assertCan, userOf } from '../auth/middleware';
import { hashPassword } from '../auth/password';
import { count, toDbValue, type Db } from '../db/knex';
import { hooks } from '../hooks';
import { addLog, diffRecord, type Actor } from '../services/logs';
import { badRequest, HttpError } from '../utils/http';
import { nowLocal, protocolo } from '../utils/time';

/**
 * CRUD genérico para qualquer entidade de shared/src/entities.ts
 *   GET    /api/:entity            lista (q, page, pageSize, sort, dir, filtros por campo)   [ver]
 *   GET    /api/:entity/opcoes     { value, label } para selects de relação               [logado]
 *   GET    /api/:entity/:id        detalhe                                                 [ver]
 *   POST   /api/:entity            cria                                                    [criar]
 *   PUT    /api/:entity/:id        atualiza (parcial)                                      [editar]
 *   DELETE /api/:entity/:id        exclui                                                  [excluir]
 * Regras específicas de cada entidade ficam em server/src/hooks/.
 */
export function crudRouter(db: Db) {
  const router = Router();

  const resolve = (req: Request): [string, EntityDef] => {
    const name = String(req.params.entity);
    const ent = getEntity(name);
    if (!ent) throw new HttpError(404, 'Entidade não encontrada');
    return [name, ent];
  };

  const idParam = (req: Request) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Registro não encontrado');
    return id;
  };

  const actorOf = (req: Request): Actor => ({ id: userOf(req).id, nome: userOf(req).nome, ip: req.ip });

  /** Campos que podem ser usados em busca, filtro e ordenação (nunca senha) */
  const queryable = (ent: EntityDef) => ent.fields.filter((f) => f.type !== 'password');

  /** SELECT com o "nome" de cada relação: cliente_id → cliente_id__label */
  const selectWithLabels = (table: string, ent: EntityDef) => {
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
  };

  /** O que sai da API: sem senhas, com JSON já convertido */
  const present = (ent: EntityDef, row: Row | undefined): Row | undefined => {
    if (!row) return row;
    const out: Row = { ...row };
    for (const f of ent.fields) {
      if (f.type === 'password') delete out[f.name];
      if (f.type === 'permissions' && typeof out[f.name] === 'string') out[f.name] = JSON.parse(out[f.name] as string);
    }
    return out;
  };

  /** O que vai para o banco */
  const serialize = (ent: EntityDef, data: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      const f = ent.fields.find((x) => x.name === k);
      out[k] = f?.type === 'permissions' && v != null ? JSON.stringify(v) : toDbValue(db, v);
    }
    return out;
  };

  /** Valida, gera hash das senhas e roda o hook beforeSave */
  async function prepare(req: Request, table: string, ent: EntityDef, mode: 'create' | 'update', current?: Row) {
    const v = validateEntity(ent, req.body ?? {}, mode);
    if (!v.ok) throw badRequest('Verifique os campos', v.errors);
    const data = v.data;
    for (const f of ent.fields) {
      if (f.type !== 'password') continue;
      if (data[f.name]) data[f.name] = await hashPassword(String(data[f.name]));
      else delete data[f.name];
    }
    const ctx = { db, actor: userOf(req), sessionId: req.auth?.sessionId, mode, current };
    await hooks[table]?.beforeSave?.(data, ctx);
    return { data, ctx };
  }

  router.get('/:entity', async (req, res) => {
    const [table, ent] = resolve(req);
    assertCan(req, table, 'ver');
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(1000, Math.max(1, Number(req.query.pageSize) || 10));
    const fields = queryable(ent);

    const where = (qb: Knex.QueryBuilder) => {
      const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const searchable = fields.filter((f) => f.search);
      if (term && searchable.length) {
        qb.where((w) => searchable.forEach((f) => w.orWhere(`${table}.${f.name}`, 'like', `%${term}%`)));
      }
      for (const f of fields) {
        const v = req.query[f.name];
        if (typeof v !== 'string' || v === '') continue;
        qb.where(`${table}.${f.name}`, f.type === 'boolean' ? toDbValue(db, v === '1' || v === 'true') : v);
      }
      return qb;
    };

    const sortable = ['id', 'criado_em', ...fields.map((f) => f.name)];
    const sort = sortable.includes(String(req.query.sort)) ? String(req.query.sort) : 'id';
    const dir = req.query.dir === 'asc' ? 'asc' : 'desc';

    const total = await count(where(db(table)));
    const rows = (await where(selectWithLabels(table, ent))
      .orderBy(`${table}.${sort}`, dir)
      .limit(pageSize)
      .offset((page - 1) * pageSize)) as Row[];

    res.json({ rows: rows.map((r) => present(ent, r)!), total, page, pageSize } satisfies ListResponse);
  });

  // Opções para selects de relação: só id + nome, liberado para qualquer usuário logado
  // (quem pode criar um chamado precisa escolher o cliente, mesmo sem acessar Clientes)
  router.get('/:entity/opcoes', async (req, res) => {
    const [table, ent] = resolve(req);
    const rows = await db(table).select('id', `${ent.labelField} as label`).orderBy(ent.labelField, 'asc').limit(5000);
    res.json(rows.map((r) => ({ value: r.id, label: String(r.label ?? r.id) })));
  });

  router.get('/:entity/:id', async (req, res) => {
    const [table, ent] = resolve(req);
    assertCan(req, table, 'ver');
    const row = await selectWithLabels(table, ent).where(`${table}.id`, idParam(req)).first();
    if (!row) throw new HttpError(404, 'Registro não encontrado');
    res.json(present(ent, row));
  });

  router.post('/:entity', async (req, res) => {
    const [table, ent] = resolve(req);
    assertCan(req, table, 'criar');
    const { data, ctx } = await prepare(req, table, ent, 'create');

    const record: Record<string, unknown> = { ...data, criado_em: nowLocal() };
    for (const f of ent.fields) if (f.auto === 'protocol') record[f.name] = protocolo();

    const [inserted] = await db(table).insert(serialize(ent, record)).returning('id');
    const id = typeof inserted === 'object' ? inserted.id : inserted;
    const row = (await db(table).where({ id }).first()) as Row;
    await hooks[table]?.afterSave?.(row, data, ctx);
    await addLog(
      db,
      {
        entidade: table,
        registro_id: id,
        acao: 'criação',
        detalhe: String(record[ent.labelField] ?? ''),
        alteracoes: diffRecord(ent, null, record),
      },
      actorOf(req),
    );
    res.status(201).json(present(ent, row));
  });

  router.put('/:entity/:id', async (req, res) => {
    const [table, ent] = resolve(req);
    assertCan(req, table, 'editar');
    const current = (await db(table)
      .where({ id: idParam(req) })
      .first()) as Row | undefined;
    if (!current) throw new HttpError(404, 'Registro não encontrado');
    const { data, ctx } = await prepare(req, table, ent, 'update', current);

    const alteracoes = diffRecord(ent, current, data);
    if (Object.keys(alteracoes).length) {
      await db(table)
        .where({ id: current.id })
        .update(serialize(ent, { ...data, atualizado_em: nowLocal() }));
    }
    const row = (await db(table).where({ id: current.id }).first()) as Row;
    await hooks[table]?.afterSave?.(row, data, ctx);
    if (Object.keys(alteracoes).length) {
      await addLog(
        db,
        {
          entidade: table,
          registro_id: current.id,
          acao: 'alteração',
          detalhe: String(row[ent.labelField] ?? ''),
          alteracoes,
        },
        actorOf(req),
      );
    }
    res.json(present(ent, row));
  });

  router.delete('/:entity/:id', async (req, res) => {
    const [table, ent] = resolve(req);
    assertCan(req, table, 'excluir');
    const current = (await db(table)
      .where({ id: idParam(req) })
      .first()) as Row | undefined;
    if (!current) throw new HttpError(404, 'Registro não encontrado');
    await hooks[table]?.beforeDelete?.(current, { db, actor: userOf(req), sessionId: req.auth?.sessionId });
    await db(table).where({ id: current.id }).del();
    await addLog(
      db,
      {
        entidade: table,
        registro_id: current.id,
        acao: 'exclusão',
        detalhe: String(current[ent.labelField] ?? ''),
        alteracoes: diffRecord(ent, current, null),
      },
      actorOf(req),
    );
    res.status(204).end();
  });

  return router;
}
