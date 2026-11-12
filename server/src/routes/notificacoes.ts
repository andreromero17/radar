// Rotas de notificações (todas exigem login; cada usuário só vê as suas):
//   GET  /api/notificacoes?limite=&nao_lidas=1&verificar=1   lista + contador (verifica os alertas a cada 10 min)
//   POST /api/notificacoes/:id/lida                          marca uma como lida
//   POST /api/notificacoes/lidas                             marca todas como lidas
//   GET  /api/notificacoes/preferencias                      tipos que o usuário pode receber + escolhas
//   PUT  /api/notificacoes/preferencias                      { desligados: [], email: bool }
import { Router } from 'express';
import { z } from 'zod';
import type { Notificacao, NotificacoesResposta, PreferenciasNotificacoesResposta } from '@frame/shared';
import { userOf } from '../auth/middleware';
import type { Db } from '../db/knex';
import { gravarPrefNotificacoes, lerPrefNotificacoes, tiposAlerta, verificarAlertas } from '../services/notificacoes';
import { badRequest, HttpError } from '../utils/http';
import { nowLocal } from '../utils/time';

const INTERVALO = 10 * 60_000;
const verificadoEm = new Map<number, number>();

const prefSchema = z.object({
  desligados: z.array(z.string().max(80)).max(100),
  email: z.boolean(),
});

export function notificacoesRouter(db: Db, opts: { emailDisponivel: boolean }) {
  const router = Router();

  router.get('/notificacoes', async (req, res) => {
    const u = userOf(req);
    const agora = Date.now();
    if (req.query.verificar === '1' || agora - (verificadoEm.get(u.id) ?? 0) > INTERVALO) {
      verificadoEm.set(u.id, agora);
      await verificarAlertas(db, { usuarioId: u.id });
    }
    const limite = Math.min(200, Math.max(1, Number(req.query.limite) || 30));
    const itens = (await db('notificacoes')
      .where({ usuario_id: u.id })
      .modify((q) => {
        if (req.query.nao_lidas === '1') q.whereNull('lida_em');
      })
      .orderBy([
        { column: 'criada_em', order: 'desc' },
        { column: 'id', order: 'desc' },
      ])
      .limit(limite)
      .select('id', 'tipo', 'nivel', 'titulo', 'mensagem', 'link', 'icone', 'criada_em', 'lida_em')) as Notificacao[];
    const r = await db('notificacoes').where({ usuario_id: u.id }).whereNull('lida_em').count({ n: '*' }).first();
    res.json({ itens, nao_lidas: Number(r?.n ?? 0) } satisfies NotificacoesResposta);
  });

  router.post('/notificacoes/lidas', async (req, res) => {
    const n = await db('notificacoes')
      .where({ usuario_id: userOf(req).id })
      .whereNull('lida_em')
      .update({ lida_em: nowLocal() });
    res.json({ marcadas: n });
  });

  router.post('/notificacoes/:id/lida', async (req, res) => {
    const n = await db('notificacoes')
      .where({ id: Number(req.params.id), usuario_id: userOf(req).id })
      .whereNull('lida_em')
      .update({ lida_em: nowLocal() });
    if (
      !n &&
      !(await db('notificacoes')
        .where({ id: Number(req.params.id), usuario_id: userOf(req).id })
        .first('id'))
    )
      throw new HttpError(404, 'Notificação não encontrada');
    res.json({ ok: true });
  });

  router.get('/notificacoes/preferencias', async (req, res) => {
    const u = userOf(req);
    res.json({
      tipos: tiposAlerta(u),
      pref: await lerPrefNotificacoes(db, u.id),
      email_disponivel: opts.emailDisponivel,
    } satisfies PreferenciasNotificacoesResposta);
  });

  router.put('/notificacoes/preferencias', async (req, res) => {
    const p = prefSchema.safeParse(req.body ?? {});
    if (!p.success) throw badRequest('Preferências inválidas');
    const u = userOf(req);
    await gravarPrefNotificacoes(db, u.id, p.data);
    verificadoEm.delete(u.id); // religou um tipo: verifica de novo na próxima abertura
    res.json(p.data);
  });

  return router;
}
