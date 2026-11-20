import { Router } from 'express';
import { requirePermission } from '../auth/middleware';
import type { Db } from '../db/knex';
import { espacoAtivoOuNulo } from '../espacos';
import { HttpError } from '../utils/http';
import { inserir } from '../db/knex';
import { nowLocal } from '../utils/time';
import { apifyConfigurado, ATOR_POSTS, coletarEspaco, coletasEmAndamento } from './coleta';
import { sincronizarERegistrar, statusPipedrive } from './pipedrive';
import { pipedriveConfigurado } from './pipedrive/cliente';

/**
 * Rotas próprias do Radar, montadas em /api depois do login e antes do CRUD.
 *   GET  /api/radar/pipedrive/status        token configurado?, filtros e a última sincronização do espaço
 *   POST /api/radar/pipedrive/sincronizar   busca agora as contas-alvo, concorrentes e pessoas do Pipedrive
 *   GET  /api/radar/coleta/status           token do Apify configurado?, coleta rodando?, última execução
 *   POST /api/radar/coleta/executar         dispara a coleta de posts em segundo plano → 202 { coleta_id }
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

  router.get('/radar/coleta/status', requirePermission('coletas', 'ver'), async (_req, res) => {
    const espaco = espacoAtivoOuNulo()?.espacoId ?? 0;
    res.json({
      configurado: apifyConfigurado(),
      rodando: coletasEmAndamento.has(espaco),
      ultima: (await db('coletas').orderBy('id', 'desc').first()) ?? null,
    });
  });

  router.post('/radar/coleta/executar', requirePermission('empresas', 'criar'), async (_req, res) => {
    if (!apifyConfigurado()) throw new HttpError(400, 'O token do Apify (APIFY_TOKEN) não está no .env do servidor.');
    const espaco = espacoAtivoOuNulo()?.espacoId;
    if (!espaco) throw new HttpError(400, 'Sem espaço na sessão.');
    if (coletasEmAndamento.has(espaco)) throw new HttpError(409, 'Já há uma coleta em andamento.');
    const coletaId = await inserir(db('coletas'), {
      inicio: nowLocal(),
      situacao: 'Rodando',
      descricao: 'Posts do LinkedIn (manual)',
      ator: ATOR_POSTS.replace('~', '/'),
      criado_em: nowLocal(),
    });
    // segundo plano: a resposta volta na hora; o resultado (ou o erro) fica gravado na linha da coleta
    const execucao = coletarEspaco(espaco, coletaId).catch(() => undefined);
    if (process.env.VITEST) await execucao; // nos testes, espera para conferir o resultado
    res.status(202).json({ coleta_id: coletaId });
  });

  return router;
}
