import { Router } from 'express';
import { requirePermission } from '../auth/middleware';
import type { Db } from '../db/knex';
import { espacoAtivoOuNulo } from '../espacos';
import { HttpError } from '../utils/http';
import { sincronizarERegistrar, statusPipedrive } from './pipedrive';
import { pipedriveConfigurado } from './pipedrive/cliente';

/**
 * Rotas próprias do Radar, montadas em /api depois do login e antes do CRUD.
 *   GET  /api/radar/pipedrive/status        token configurado?, filtros e a última sincronização do espaço
 *   POST /api/radar/pipedrive/sincronizar   busca agora as contas-alvo, concorrentes e pessoas do Pipedrive
 */
export function appRouter(db: Db) {
  const router = Router();

  router.get('/radar/pipedrive/status', requirePermission('empresas', 'ver'), async (_req, res) => {
    res.json(await statusPipedrive(db));
  });

  const emAndamento = new Set<unknown>();
  router.post('/radar/pipedrive/sincronizar', requirePermission('empresas', 'criar'), async (_req, res) => {
    if (!pipedriveConfigurado())
      throw new HttpError(400, 'O token do Pipedrive (PIPEDRIVE_API_TOKEN) não está no .env do servidor.');
    const chave = espacoAtivoOuNulo()?.espacoId ?? 0;
    if (emAndamento.has(chave)) throw new HttpError(409, 'A sincronização já está em andamento.');
    emAndamento.add(chave);
    try {
      const u = await sincronizarERegistrar(db);
      if (!u.ok) throw new HttpError(502, u.erro ?? 'Falha ao sincronizar com o Pipedrive.');
      res.json(u);
    } finally {
      emAndamento.delete(chave);
    }
  });

  return router;
}
