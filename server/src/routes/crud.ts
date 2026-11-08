import { Router, type Request, type Response } from 'express';
import type { Knex } from 'knex';
import { getEntity, validateEntity, type EntityDef, type ListResponse, type Row } from '@frame/shared';
import { count, toDbValue, type Db } from '../db/knex';
import { addLog } from '../services/logs';
import { nowLocal, protocolo } from '../utils/time';

/**
 * CRUD genérico para qualquer entidade de shared/src/entities.ts
 *   GET    /api/:entity            lista (q, page, pageSize, sort, dir, filtros por campo)
 *   GET    /api/:entity/:id        detalhe
 *   POST   /api/:entity            cria
 *   PUT    /api/:entity/:id        atualiza (parcial)
 *   DELETE /api/:entity/:id        exclui
 */
export function crudRouter(db: Db) {
  const router = Router();

  const resolve = (req: Request, res: Response): [string, EntityDef] | null => {
    const name = String(req.params.entity);
    const ent = getEntity(name);
    if (!ent) {
      res.status(404).json({ error: 'Entidade não encontrada' });
      return null;
    }
    return [name, ent];
  };

  const idParam = (req: Request) => {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

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

  const toDb = (data: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toDbValue(db, v)]));

  router.get('/:entity', async (req, res) => {
    const r = resolve(req, res);
    if (!r) return;
    const [table, ent] = r;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(1000, Math.max(1, Number(req.query.pageSize) || 10));

    const where = (qb: Knex.QueryBuilder) => {
      const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const searchable = ent.fields.filter((f) => f.search);
      if (term && searchable.length) {
        qb.where((w) => searchable.forEach((f) => w.orWhere(`${table}.${f.name}`, 'like', `%${term}%`)));
      }
      for (const f of ent.fields) {
        const v = req.query[f.name];
        if (typeof v !== 'string' || v === '') continue;
        qb.where(`${table}.${f.name}`, f.type === 'boolean' ? toDbValue(db, v === '1' || v === 'true') : v);
      }
      return qb;
    };

    const sortable = ['id', 'criado_em', ...ent.fields.map((f) => f.name)];
    const sort = sortable.includes(String(req.query.sort)) ? String(req.query.sort) : 'id';
    const dir = req.query.dir === 'asc' ? 'asc' : 'desc';

    const total = await count(where(db(table)));
    const rows = (await where(selectWithLabels(table, ent))
      .orderBy(`${table}.${sort}`, dir)
      .limit(pageSize)
      .offset((page - 1) * pageSize)) as Row[];

    res.json({ rows, total, page, pageSize } satisfies ListResponse);
  });

  router.get('/:entity/:id', async (req, res) => {
    const r = resolve(req, res);
    if (!r) return;
    const [table, ent] = r;
    const id = idParam(req);
    const row = id && (await selectWithLabels(table, ent).where(`${table}.id`, id).first());
    if (!row) return res.status(404).json({ error: 'Registro não encontrado' });
    res.json(row);
  });

  router.post('/:entity', async (req, res) => {
    const r = resolve(req, res);
    if (!r) return;
    const [table, ent] = r;
    const v = validateEntity(ent, req.body ?? {}, 'create');
    if (!v.ok) return res.status(422).json({ error: 'Verifique os campos', errors: v.errors });

    const data: Record<string, unknown> = { ...v.data, criado_em: nowLocal() };
    for (const f of ent.fields) if (f.auto === 'protocol') data[f.name] = protocolo();

    const [inserted] = await db(table).insert(toDb(data)).returning('id');
    const id = typeof inserted === 'object' ? inserted.id : inserted;
    await addLog(db, { entidade: table, registro_id: id, acao: 'criação', detalhe: String(data[ent.labelField] ?? '') });
    res.status(201).json(await db(table).where({ id }).first());
  });

  router.put('/:entity/:id', async (req, res) => {
    const r = resolve(req, res);
    if (!r) return;
    const [table, ent] = r;
    const id = idParam(req);
    const current = id && ((await db(table).where({ id }).first()) as Row | undefined);
    if (!current) return res.status(404).json({ error: 'Registro não encontrado' });

    const v = validateEntity(ent, req.body ?? {}, 'update');
    if (!v.ok) return res.status(422).json({ error: 'Verifique os campos', errors: v.errors });

    if (Object.keys(v.data).length) {
      await db(table)
        .where({ id: current.id })
        .update(toDb({ ...v.data, atualizado_em: nowLocal() }));
    }
    await addLog(db, {
      entidade: table,
      registro_id: current.id,
      acao: 'alteração',
      detalhe: String(v.data[ent.labelField] ?? current[ent.labelField] ?? ''),
    });
    res.json(await db(table).where({ id: current.id }).first());
  });

  router.delete('/:entity/:id', async (req, res) => {
    const r = resolve(req, res);
    if (!r) return;
    const [table, ent] = r;
    const id = idParam(req);
    const current = id && ((await db(table).where({ id }).first()) as Row | undefined);
    if (!current) return res.status(404).json({ error: 'Registro não encontrado' });
    await db(table).where({ id: current.id }).del();
    await addLog(db, {
      entidade: table,
      registro_id: current.id,
      acao: 'exclusão',
      detalhe: String(current[ent.labelField] ?? ''),
    });
    res.status(204).end();
  });

  return router;
}
