import { Router } from 'express';
import { requirePermission } from '../auth/middleware';
import type { Db } from '../db/knex';
import { espacoAtivoOuNulo } from '../espacos';
import { HttpError } from '../utils/http';
import { inserir } from '../db/knex';
import { nowLocal } from '../utils/time';
import {
  apifyConfigurado,
  ATORES,
  coletarEspaco,
  coletasEmAndamento,
  encerrarInterrompidas,
  tipoDoAtor,
  type TipoColeta,
} from './coleta';
import { sincronizarERegistrar, statusPipedrive } from './pipedrive';
import { detalheEmpresa, visaoConcorrentes, visaoContas } from './services/visao';
import { pipedriveConfigurado } from './pipedrive/cliente';

/**
 * Rotas próprias do Radar, montadas em /api depois do login e antes do CRUD.
 *   GET  /api/radar/pipedrive/status        token configurado?, filtros e a última sincronização do espaço
 *   POST /api/radar/pipedrive/sincronizar   busca agora as contas-alvo, concorrentes e pessoas do Pipedrive
 *   GET  /api/radar/visao?universo=Conta-alvo|Concorrente&dias=30   visão geral do universo (telas do Radar)
 *   GET  /api/radar/empresas/:id/detalhe?dias=90                    página da empresa (posts, assuntos, engajamento…)
 *   GET  /api/radar/coleta/status           token do Apify configurado?, coleta rodando?, última execução
 *   POST /api/radar/coleta/executar         dispara a coleta de posts em segundo plano → 202 { coleta_id }
 *        { tipo: 'posts' | 'paginas' }         posts (padrão) ou dados das páginas (seguidores, logos)
 *        { run_apify }                         …ou retoma um run do Apify já iniciado (que passou do tempo ou foi interrompido)
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

  router.get('/radar/visao', requirePermission('sinais', 'ver'), async (req, res) => {
    const dias = Math.min(365, Math.max(7, Number(req.query.dias) || 30));
    res.json(req.query.universo === 'Concorrente' ? await visaoConcorrentes(db, dias) : await visaoContas(db, dias));
  });

  router.get('/radar/empresas/:id/detalhe', requirePermission('empresas', 'ver'), async (req, res) => {
    const dias = Math.min(365, Math.max(7, Number(req.query.dias) || 90));
    const d = await detalheEmpresa(db, Number(req.params.id), dias);
    if (!d) throw new HttpError(404, 'Empresa não encontrada.');
    res.json(d);
  });

  router.get('/radar/coleta/status', requirePermission('coletas', 'ver'), async (_req, res) => {
    const espaco = espacoAtivoOuNulo()?.espacoId ?? 0;
    await encerrarInterrompidas(db, espaco);
    const ultima = ((await db('coletas').orderBy('id', 'desc').first()) ?? null) as Record<string, unknown> | null;
    // execuções da 0.3.0 não gravavam o run: ele aparece no texto do erro ("... (run XXXX)")
    if (ultima && !ultima.run_apify)
      ultima.run_apify = /\brun ([A-Za-z0-9]{3,40})\b/.exec(String(ultima.erro ?? ''))?.[1] ?? null;
    res.json({ configurado: apifyConfigurado(), rodando: coletasEmAndamento.has(espaco), ultima });
  });

  router.post('/radar/coleta/executar', requirePermission('empresas', 'criar'), async (req, res) => {
    const runApify =
      typeof req.body?.run_apify === 'string' && /^[A-Za-z0-9]{3,40}$/.test(req.body.run_apify)
        ? req.body.run_apify
        : undefined;
    if (!apifyConfigurado()) throw new HttpError(400, 'O token do Apify (APIFY_TOKEN) não está no .env do servidor.');
    const espaco = espacoAtivoOuNulo()?.espacoId;
    if (!espaco) throw new HttpError(400, 'Sem espaço na sessão.');
    if (coletasEmAndamento.has(espaco)) throw new HttpError(409, 'Já há uma coleta em andamento.');
    // retomada: o tipo vem da execução que tinha esse run (ou do texto do erro, na 0.3.0)
    let tipo: TipoColeta = req.body?.tipo === 'paginas' ? 'paginas' : 'posts';
    if (runApify) {
      const origem = (await db('coletas')
        .where('run_apify', runApify)
        .orWhere('erro', 'like', `%${runApify}%`)
        .orderBy('id', 'desc')
        .first('ator')) as { ator: string | null } | undefined;
      if (origem) tipo = tipoDoAtor(origem.ator);
    }
    const nomes = { posts: 'Posts do LinkedIn', paginas: 'Dados das páginas (seguidores e logos)' };
    const coletaId = await inserir(db('coletas'), {
      inicio: nowLocal(),
      situacao: 'Rodando',
      descricao: runApify ? `${nomes[tipo]} — retomada do run ${runApify}` : `${nomes[tipo]} (manual)`,
      ator: ATORES[tipo].replace('~', '/'),
      run_apify: runApify ?? null,
      criado_em: nowLocal(),
    });
    // segundo plano: a resposta volta na hora; o resultado (ou o erro) fica gravado na linha da coleta
    const execucao = coletarEspaco(espaco, { tipo, coletaId, runId: runApify }).catch(() => undefined);
    if (process.env.VITEST) await execucao; // nos testes, espera para conferir o resultado
    res.status(202).json({ coleta_id: coletaId });
  });

  return router;
}
