import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR, DB_PATH } from '../db.js';
import { entities, STATUS_CHAMADO } from '../entities.js';
import { getSettings, resetSettings, saveSettings, validateSettings } from '../settings.js';

/** Rotas do sistema: metadados, dashboard, logs e backup. */
const router = Router();

router.get('/meta', (_req, res) => res.json({ entities }));

router.get('/settings', (_req, res) => res.json(getSettings()));

router.put('/settings', (req, res) => {
  const { data, errors } = validateSettings(req.body || {});
  if (Object.keys(errors).length) return res.status(422).json({ error: 'Verifique os campos', errors });
  saveSettings(data);
  res.json(getSettings());
});

router.delete('/settings', (_req, res) => {
  resetSettings();
  res.json(getSettings());
});

router.get('/dashboard', (_req, res) => {
  const ATIVOS = "status NOT IN ('Resolvido','Fechado')";
  const count = (sql) => db.prepare(`SELECT COUNT(*) n FROM ${sql}`).get().n;

  res.json({
    cards: {
      abertos: count(`chamados WHERE ${ATIVOS}`),
      urgentes: count(`chamados WHERE prioridade = 'Urgente' AND ${ATIVOS}`),
      aguardando: count(`chamados WHERE status = 'Aguardando cliente'`),
      emAtendimento: count(`chamados WHERE status = 'Em atendimento'`),
      concluidos: count(`chamados WHERE status IN ('Resolvido','Fechado')`),
      semResponsavel: count(`chamados WHERE responsavel_id IS NULL AND ${ATIVOS}`),
      clientesAtivos: count(`clientes WHERE ativo = 1`),
      noMes: count(`chamados WHERE strftime('%Y-%m', criado_em) = strftime('%Y-%m','now','localtime')`),
    },
    porStatus: STATUS_CHAMADO.map((status) => ({
      status,
      total: db.prepare('SELECT COUNT(*) n FROM chamados WHERE status = ?').get(status).n,
    })),
    ultimos: db
      .prepare(
        `SELECT c.id, c.protocolo, c.assunto, c.status, cl.nome AS cliente
         FROM chamados c LEFT JOIN clientes cl ON cl.id = c.cliente_id
         ORDER BY c.id DESC LIMIT 6`,
      )
      .all(),
  });
});

router.get('/logs', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 15));
  const total = db.prepare('SELECT COUNT(*) n FROM logs').get().n;
  const rows = db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT ? OFFSET ?').all(pageSize, (page - 1) * pageSize);
  res.json({ rows, total, page, pageSize });
});

router.get('/backup/info', (_req, res) => {
  const stat = fs.statSync(DB_PATH);
  const tabelas = [...Object.keys(entities), 'logs', 'configuracoes'].map((t) => ({
    tabela: t,
    registros: db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n,
  }));
  res.json({ arquivo: path.basename(DB_PATH), tamanho: stat.size, modificado: stat.mtime, tabelas });
});

router.get('/backup', async (_req, res, next) => {
  try {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const file = path.join(DATA_DIR, `backup-${stamp}.db`);
    await db.backup(file);
    db.prepare("INSERT INTO logs (entidade, acao, detalhe) VALUES ('sistema','backup',?)").run(path.basename(file));
    res.download(file, () => fs.unlink(file, () => {}));
  } catch (e) {
    next(e);
  }
});

export default router;
