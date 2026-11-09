import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, { Router, type Request } from 'express';
import {
  entities,
  mainEntities,
  settingsUpdateSchema,
  appSettingsSchema,
  type AppSettings,
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
import { getAppSettings, getSettings, resetSettings, saveAppSettings, saveSettings } from '../services/settings';
import { pesoValido, removerFonte, salvarFonte } from '../services/fonte';
import { badRequest } from '../utils/http';

/** Rotas do sistema: metadados, configurações, dashboard, logs e backup (todas exigem login). */
export function systemRouter(db: Db, opts: { dbFile: string }) {
  const router = Router();
  const actor = (req: Request): Actor => ({ id: userOf(req).id, nome: userOf(req).nome, ip: req.ip });

  router.get('/meta', (_req, res) => {
    res.json({ entities });
  });

  // ---------- Configurações ----------
  // configurações próprias do sistema derivado (app/settings.ts): leitura para qualquer usuário logado
  router.get('/settings/app', async (_req, res) => {
    res.json(await getAppSettings(db));
  });
  router.put('/settings/app', requirePermission('configuracoes', 'editar'), async (req, res) => {
    const parsed = appSettingsSchema()
      .partial()
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(422).json({ error: 'Verifique os campos', errors: toFieldErrors(parsed.error) });
    }
    res.json(await saveAppSettings(db, parsed.data as AppSettings, actor(req)));
  });

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

  // fonte própria: arquivo cru no corpo (?arquivo=nome.woff2); a leitura é pública (app.ts)
  const rawFonte = express.raw({ type: () => true, limit: '1mb' });
  router.post('/settings/fonte/:peso', requirePermission('configuracoes', 'editar'), rawFonte, async (req, res) => {
    if (!pesoValido(req.params.peso)) throw badRequest('Peso inválido (regular ou negrito)');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Envie o arquivo da fonte');
    const nome = typeof req.query.arquivo === 'string' ? req.query.arquivo : '';
    await salvarFonte(db, req.params.peso, req.body, nome, actor(req));
    res.json(await getSettings(db));
  });
  router.delete('/settings/fonte/:peso', requirePermission('configuracoes', 'editar'), async (req, res) => {
    if (!pesoValido(req.params.peso)) throw badRequest('Peso inválido (regular ou negrito)');
    await removerFonte(db, req.params.peso, actor(req));
    res.json(await getSettings(db));
  });

  // ---------- Dashboard ----------
  // Resumo genérico: total de registros de cada cadastro que o usuário pode ver.
  // Cada sistema pode criar o seu próprio painel em server/src/app/routes.ts.
  router.get('/dashboard/resumo', async (req, res) => {
    const user = userOf(req);
    const totais = [];
    for (const [entidade, ent] of mainEntities()) {
      if (!can(user, entidade, 'ver')) continue;
      const q = db(entidade);
      if (ent.lixeira) q.whereNull('excluido_em'); // fora da lixeira
      totais.push({ entidade, total: await count(q) });
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
