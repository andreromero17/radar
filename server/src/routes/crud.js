import { Router } from 'express';
import { db, log } from '../db.js';
import { entities } from '../entities.js';
import { protocolo } from '../seed.js';

/**
 * CRUD genérico para qualquer entidade de entities.js
 *   GET    /api/:entity            lista (q, page, pageSize, sort, dir, filtros por campo)
 *   GET    /api/:entity/:id        detalhe
 *   POST   /api/:entity            cria
 *   PUT    /api/:entity/:id        atualiza
 *   DELETE /api/:entity/:id        exclui
 */
const router = Router();

function resolve(req, res) {
  const ent = entities[req.params.entity];
  if (!ent) {
    res.status(404).json({ error: 'Entidade não encontrada' });
    return null;
  }
  return ent;
}

function normalize(ent, body, isCreate) {
  const data = {};
  const errors = {};
  for (const f of ent.fields) {
    if (f.readonly || f.auto) continue;
    let v = body[f.name];
    if (v === undefined) {
      if (!isCreate) continue;
      v = f.default ?? null;
    }
    if (v === '') v = null;
    if (f.type === 'boolean') v = v ? 1 : 0;
    if (['number', 'money', 'relation'].includes(f.type) && v != null) {
      v = Number(v);
      if (Number.isNaN(v)) errors[f.name] = 'Valor numérico inválido';
    }
    if (f.required && v == null) errors[f.name] = `${f.label} é obrigatório`;
    if (f.type === 'select' && v != null && !f.options.includes(v)) errors[f.name] = 'Opção inválida';
    if (f.type === 'email' && v && !/^\S+@\S+\.\S+$/.test(v)) errors[f.name] = 'E-mail inválido';
    data[f.name] = v;
  }
  if (isCreate) {
    for (const f of ent.fields) if (f.auto === 'protocol') data[f.name] = protocolo();
  }
  return { data, errors };
}

function selectBase(table, ent) {
  const selects = [`${table}.*`];
  const joins = [];
  ent.fields
    .filter((f) => f.type === 'relation')
    .forEach((f, i) => {
      const rel = entities[f.entity];
      joins.push(`LEFT JOIN ${f.entity} j${i} ON j${i}.id = ${table}.${f.name}`);
      selects.push(`j${i}.${rel.labelField} AS ${f.name}__label`);
    });
  return { selects: selects.join(', '), joins: joins.join(' ') };
}

router.get('/:entity', (req, res) => {
  const ent = resolve(req, res);
  if (!ent) return;
  const t = req.params.entity;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Math.max(1, Number(req.query.pageSize) || 10));

  const where = [];
  const params = {};
  if (req.query.q) {
    const cols = ent.fields.filter((f) => f.search).map((f) => `${t}.${f.name} LIKE @q`);
    if (cols.length) {
      where.push(`(${cols.join(' OR ')})`);
      params.q = `%${req.query.q}%`;
    }
  }
  for (const f of ent.fields) {
    if (req.query[f.name] !== undefined && req.query[f.name] !== '') {
      where.push(`${t}.${f.name} = @f_${f.name}`);
      params[`f_${f.name}`] = req.query[f.name];
    }
  }

  const sortable = ['id', 'criado_em', ...ent.fields.map((f) => f.name)];
  const sort = sortable.includes(req.query.sort) ? req.query.sort : 'id';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { selects, joins } = selectBase(t, ent);

  const total = db.prepare(`SELECT COUNT(*) n FROM ${t} ${w}`).get(params).n;
  const rows = db
    .prepare(`SELECT ${selects} FROM ${t} ${joins} ${w} ORDER BY ${t}.${sort} ${dir} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  res.json({ rows, total, page, pageSize });
});

router.get('/:entity/:id', (req, res) => {
  const ent = resolve(req, res);
  if (!ent) return;
  const t = req.params.entity;
  const { selects, joins } = selectBase(t, ent);
  const row = db.prepare(`SELECT ${selects} FROM ${t} ${joins} WHERE ${t}.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Registro não encontrado' });
  res.json(row);
});

router.post('/:entity', (req, res) => {
  const ent = resolve(req, res);
  if (!ent) return;
  const { data, errors } = normalize(ent, req.body || {}, true);
  if (Object.keys(errors).length) return res.status(422).json({ error: 'Verifique os campos', errors });
  const cols = Object.keys(data);
  const info = db
    .prepare(`INSERT INTO ${req.params.entity} (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`)
    .run(data);
  log(req.params.entity, info.lastInsertRowid, 'criação', data[ent.labelField] ?? '');
  res.status(201).json(db.prepare(`SELECT * FROM ${req.params.entity} WHERE id = ?`).get(info.lastInsertRowid));
});

router.put('/:entity/:id', (req, res) => {
  const ent = resolve(req, res);
  if (!ent) return;
  const t = req.params.entity;
  const current = db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Registro não encontrado' });
  const { data, errors } = normalize(ent, req.body || {}, false);
  if (Object.keys(errors).length) return res.status(422).json({ error: 'Verifique os campos', errors });
  const cols = Object.keys(data);
  if (cols.length) {
    db.prepare(
      `UPDATE ${t} SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, atualizado_em = datetime('now','localtime') WHERE id = @id`,
    ).run({ ...data, id: current.id });
  }
  log(t, current.id, 'alteração', data[ent.labelField] ?? current[ent.labelField] ?? '');
  res.json(db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(current.id));
});

router.delete('/:entity/:id', (req, res) => {
  const ent = resolve(req, res);
  if (!ent) return;
  const t = req.params.entity;
  const current = db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Registro não encontrado' });
  db.prepare(`DELETE FROM ${t} WHERE id = ?`).run(current.id);
  log(t, current.id, 'exclusão', current[ent.labelField] ?? '');
  res.status(204).end();
});

export default router;
