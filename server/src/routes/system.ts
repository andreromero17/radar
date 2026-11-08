import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import {
  entities,
  settingsUpdateSchema,
  STATUS_CHAMADO,
  toFieldErrors,
  type DashboardData,
  type ListResponse,
  type LogRow,
} from '@frame/shared';
import { count, type Db } from '../db/knex';
import { addLog } from '../services/logs';
import { backupInfo, createBackup } from '../services/backup';
import { getSettings, resetSettings, saveSettings } from '../services/settings';
import { monthPrefix } from '../utils/time';

/** Rotas do sistema: metadados, configurações, dashboard, logs e backup. */
export function systemRouter(db: Db, opts: { dbFile: string }) {
  const router = Router();

  router.get('/meta', (_req, res) => {
    res.json({ entities });
  });

  // ---------- Configurações ----------
  router.get('/settings', async (_req, res) => {
    res.json(await getSettings(db));
  });

  router.put('/settings', async (req, res) => {
    const parsed = settingsUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(422).json({ error: 'Verifique os campos', errors: toFieldErrors(parsed.error) });
    }
    res.json(await saveSettings(db, parsed.data));
  });

  router.delete('/settings', async (_req, res) => {
    res.json(await resetSettings(db));
  });

  // ---------- Dashboard ----------
  router.get('/dashboard', async (_req, res) => {
    const ativos = () => db('chamados').whereNotIn('status', ['Resolvido', 'Fechado']);
    const status = (s: string | string[]) => db('chamados').whereIn('status', Array.isArray(s) ? s : [s]);

    const data: DashboardData = {
      cards: {
        abertos: await count(ativos()),
        urgentes: await count(ativos().where('prioridade', 'Urgente')),
        aguardando: await count(status('Aguardando cliente')),
        emAtendimento: await count(status('Em atendimento')),
        concluidos: await count(status(['Resolvido', 'Fechado'])),
        semResponsavel: await count(ativos().whereNull('responsavel_id')),
        clientesAtivos: await count(db('clientes').whereIn('ativo', [1, true])),
        noMes: await count(db('chamados').where('criado_em', 'like', `${monthPrefix()}%`)),
      },
      porStatus: [],
      ultimos: await db('chamados as c')
        .leftJoin('clientes as cl', 'cl.id', 'c.cliente_id')
        .select('c.id', 'c.protocolo', 'c.assunto', 'c.status', 'cl.nome as cliente')
        .orderBy('c.id', 'desc')
        .limit(6),
    };
    for (const s of STATUS_CHAMADO) data.porStatus.push({ status: s, total: await count(status(s)) });
    res.json(data);
  });

  // ---------- Logs ----------
  router.get('/logs', async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 15));
    const total = await count(db('logs'));
    const rows = (await db('logs')
      .orderBy('id', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize)) as LogRow[];
    res.json({ rows, total, page, pageSize } satisfies ListResponse<LogRow>);
  });

  // ---------- Backup ----------
  router.get('/backup/info', async (_req, res) => {
    res.json(await backupInfo(db, opts.dbFile));
  });

  router.get('/backup', async (_req, res) => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const file = path.join(os.tmpdir(), `backup-${stamp}.db`);
    await createBackup(db, file);
    await addLog(db, { entidade: 'sistema', acao: 'backup', detalhe: path.basename(file) });
    res.download(file, () => fs.unlink(file, () => {}));
  });

  return router;
}
