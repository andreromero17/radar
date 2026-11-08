import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router, type Request } from 'express';
import {
  entities,
  settingsUpdateSchema,
  can,
  toFieldErrors,
  type DashboardSummary,
  type ListResponse,
  type LogRow,
} from '@frame/shared';
import { requirePermission, userOf } from '../auth/middleware';
import { count, type Db } from '../db/knex';
import { addLog, type Actor } from '../services/logs';
import { backupInfo, createBackup } from '../services/backup';
import { getSettings, resetSettings, saveSettings } from '../services/settings';

/** Rotas do sistema: metadados, configurações, dashboard, logs e backup (todas exigem login). */
export function systemRouter(db: Db, opts: { dbFile: string }) {
  const router = Router();
  const actor = (req: Request): Actor => ({ id: userOf(req).id, nome: userOf(req).nome, ip: req.ip });

  router.get('/meta', (_req, res) => {
    res.json({ entities });
  });

  // ---------- Configurações ----------
  router.get('/settings', async (_req, res) => {
    res.json(await getSettings(db));
  });

  router.put('/settings', requirePermission('configuracoes', 'editar'), async (req, res) => {
    const parsed = settingsUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(422).json({ error: 'Verifique os campos', errors: toFieldErrors(parsed.error) });
    }
    res.json(await saveSettings(db, parsed.data, actor(req)));
  });

  router.delete('/settings', requirePermission('configuracoes', 'editar'), async (req, res) => {
    res.json(await resetSettings(db, actor(req)));
  });

  // ---------- Dashboard ----------
  // Resumo genérico: total de registros de cada cadastro que o usuário pode ver.
  // Cada sistema pode criar o seu próprio painel em server/src/app/routes.ts.
  router.get('/dashboard/resumo', async (req, res) => {
    const user = userOf(req);
    const totais = [];
    for (const entidade of Object.keys(entities)) {
      if (can(user, entidade, 'ver')) totais.push({ entidade, total: await count(db(entidade)) });
    }
    res.json({ totais } satisfies DashboardSummary);
  });

  // ---------- Logs ----------
  router.get('/logs', requirePermission('logs', 'ver'), async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 15));
    const filtered = () => {
      const q = db('logs');
      if (typeof req.query.entidade === 'string' && req.query.entidade) q.where('entidade', req.query.entidade);
      if (typeof req.query.usuario_id === 'string' && req.query.usuario_id)
        q.where('usuario_id', Number(req.query.usuario_id));
      if (typeof req.query.registro_id === 'string' && req.query.registro_id)
        q.where('registro_id', Number(req.query.registro_id));
      return q;
    };
    const total = await count(filtered());
    const rows = (await filtered()
      .orderBy('id', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize)) as (Omit<LogRow, 'alteracoes'> & { alteracoes: string | null })[];
    res.json({
      rows: rows.map((r) => ({ ...r, alteracoes: r.alteracoes ? JSON.parse(r.alteracoes) : null })),
      total,
      page,
      pageSize,
    } satisfies ListResponse<LogRow>);
  });

  // ---------- Backup ----------
  router.get('/backup/info', requirePermission('backup', 'ver'), async (_req, res) => {
    res.json(await backupInfo(db, opts.dbFile));
  });

  router.get('/backup', requirePermission('backup', 'ver'), async (req, res) => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const file = path.join(os.tmpdir(), `backup-${stamp}.db`);
    await createBackup(db, file);
    await addLog(db, { entidade: 'sistema', acao: 'backup', detalhe: path.basename(file) }, actor(req));
    res.download(file, () => fs.unlink(file, () => {}));
  });

  return router;
}
