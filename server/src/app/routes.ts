import { lerTags } from '@frame/shared';
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
import { detalheEmpresa, detalhePessoa, visaoConcorrentes, visaoContas } from './services/visao';
import { pipedriveConfigurado } from './pipedrive/cliente';
import { criarTag, definirTagsDaEmpresa, listarTags } from './services/tags';
import {
  aEnriquecer,
  apolloConfigurado,
  aprovarSugestoes,
  buscarPessoas,
  buscarPessoasUniverso,
  descartarSugestoes,
  enriquecerEmpresa,
  enriquecerUniverso,
  ErroApollo,
  listarSugestoes,
} from './apollo';

/**
 * Rotas próprias do Radar, montadas em /api depois do login e antes do CRUD.
 *   GET  /api/radar/pipedrive/status        token configurado?, filtros e a última sincronização do espaço
 *   POST /api/radar/pipedrive/sincronizar   busca agora as contas-alvo, concorrentes e pessoas do Pipedrive
 *   GET  /api/radar/visao?universo=Conta-alvo|Concorrente&dias=30   visão geral do universo (telas do Radar)
 *   GET  /api/radar/empresas/:id/detalhe?dias=90                    página da empresa (posts, assuntos, engajamento…)
 *   GET  /api/radar/coleta/status           token do Apify configurado?, coleta rodando?, última execução
 *   POST /api/radar/coleta/executar         dispara a coleta de posts em segundo plano → 202 { coleta_id }
 *        { tipo: 'posts' | 'paginas' | 'vagas' } posts (padrão), páginas (seguidores, logos, site + vagas) ou só vagas
 *        { run_apify }                         …ou retoma um run do Apify já iniciado (que passou do tempo ou foi interrompido)
 *   GET  /api/radar/apollo/status?universo=  chave configurada?, sugestões pendentes, empresas a enriquecer (créditos)
 *   POST /api/radar/apollo/empresas/:id/enriquecer · /pessoas   uma empresa (1 crédito) · buscar pessoas (sem custo)
 *   POST /api/radar/apollo/enriquecer · /pessoas  { universo }   todas as empresas do universo
 *   GET  /api/radar/apollo/sugestoes?empresa_id=   sugestões pendentes
 *   POST /api/radar/apollo/sugestoes/aprovar · /descartar  { ids }   aprovar cadastra como pessoas (créditos)
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
    const tags = lerTags(String(req.query.tags ?? '').split(','));
    // nos ausente = todos os "Nós"; "nenhum" = nenhum; "1,5" = só esses
    const nos =
      req.query.nos == null ? null : req.query.nos === 'nenhum' ? [] : lerTags(String(req.query.nos).split(','));
    res.json(
      req.query.universo === 'Concorrente'
        ? await visaoConcorrentes(db, dias, tags, nos)
        : await visaoContas(db, dias, tags),
    );
  });

  // ------------------------------------------------------------- tags (0.4.7)
  router.get('/radar/tags', requirePermission('empresas', 'ver'), async (_req, res) => {
    res.json(await listarTags(db));
  });
  router.post('/radar/tags', requirePermission('tags', 'criar'), async (req, res) => {
    res.status(201).json(await criarTag(db, String(req.body?.nome ?? ''), String(req.body?.cor ?? '')));
  });
  router.put('/radar/empresas/:id/tags', requirePermission('empresas', 'editar'), async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? lerTags(req.body.ids) : null;
    if (!ids) throw new HttpError(400, 'Envie { ids: [...] }.');
    if (!(await definirTagsDaEmpresa(db, Number(req.params.id), ids)))
      throw new HttpError(404, 'Empresa não encontrada.');
    res.json({ ids });
  });

  router.get('/radar/pessoas/:id/detalhe', requirePermission('pessoas', 'ver'), async (req, res) => {
    const dias = Math.min(365, Math.max(7, Number(req.query.dias) || 90));
    const d = await detalhePessoa(db, Number(req.params.id), dias);
    if (!d) throw new HttpError(404, 'Pessoa não encontrada.');
    res.json(d);
  });

  router.get('/radar/empresas/:id/detalhe', requirePermission('empresas', 'ver'), async (req, res) => {
    const dias = Math.min(365, Math.max(7, Number(req.query.dias) || 90));
    const d = await detalheEmpresa(db, Number(req.params.id), dias);
    if (!d) throw new HttpError(404, 'Empresa não encontrada.');
    res.json(d);
  });

  // marca a empresa (e as pessoas dela) para buscar de novo os últimos 30 dias de posts na próxima coleta
  router.post('/radar/empresas/:id/refazer-historico', requirePermission('empresas', 'editar'), async (req, res) => {
    const id = Number(req.params.id);
    if (!(await db('empresas').where('id', id).first('id'))) throw new HttpError(404, 'Empresa não encontrada.');
    await db('empresas').where('id', id).update({ historico_posts_em: null });
    await db('pessoas').where('empresa_id', id).update({ historico_posts_em: null });
    res.json({ ok: true });
  });

  // ------------------------------------------------------------- Apollo (0.4.6)
  const apollo = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (!apolloConfigurado())
      throw new HttpError(400, 'A chave do Apollo (APOLLO_API_KEY) não está no .env do servidor.');
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ErroApollo) throw new HttpError(502, e.message);
      throw e;
    }
  };
  const universoDe = (v: unknown) => (v === 'Conta-alvo' ? 'Conta-alvo' : 'Concorrente');
  const idsDe = (v: unknown) =>
    Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : ([] as number[]);

  router.get('/radar/apollo/status', requirePermission('empresas', 'ver'), async (req, res) => {
    const universo = universoDe(req.query.universo);
    const pendentes = (await db('sugestoes_pessoas').where('situacao', 'Sugerida').count({ n: '*' }).first()) as {
      n: number;
    };
    res.json({
      configurado: apolloConfigurado(),
      sugestoes: Number(pendentes?.n ?? 0),
      a_enriquecer: await aEnriquecer(db, universo),
    });
  });
  router.post('/radar/apollo/empresas/:id/enriquecer', requirePermission('empresas', 'editar'), async (req, res) => {
    res.json(await apollo(() => enriquecerEmpresa(db, Number(req.params.id))));
  });
  router.post('/radar/apollo/empresas/:id/pessoas', requirePermission('pessoas', 'criar'), async (req, res) => {
    res.json(await apollo(() => buscarPessoas(db, Number(req.params.id))));
  });
  router.post('/radar/apollo/enriquecer', requirePermission('empresas', 'editar'), async (req, res) => {
    res.json(await apollo(() => enriquecerUniverso(db, universoDe(req.body?.universo))));
  });
  router.post('/radar/apollo/pessoas', requirePermission('pessoas', 'criar'), async (req, res) => {
    res.json(await apollo(() => buscarPessoasUniverso(db, universoDe(req.body?.universo))));
  });
  router.get('/radar/apollo/sugestoes', requirePermission('pessoas', 'ver'), async (req, res) => {
    res.json(await listarSugestoes(db, Number(req.query.empresa_id) || undefined));
  });
  router.post('/radar/apollo/sugestoes/aprovar', requirePermission('pessoas', 'criar'), async (req, res) => {
    const ids = idsDe(req.body?.ids);
    if (!ids.length) throw new HttpError(400, 'Escolha ao menos uma pessoa.');
    res.json(await apollo(() => aprovarSugestoes(db, ids)));
  });
  router.post('/radar/apollo/sugestoes/descartar', requirePermission('pessoas', 'criar'), async (req, res) => {
    const ids = idsDe(req.body?.ids);
    if (!ids.length) throw new HttpError(400, 'Escolha ao menos uma pessoa.');
    res.json(await descartarSugestoes(db, ids));
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
    let tipo: TipoColeta = req.body?.tipo === 'paginas' ? 'paginas' : req.body?.tipo === 'vagas' ? 'vagas' : 'posts';
    if (runApify) {
      const origem = (await db('coletas')
        .where('run_apify', runApify)
        .orWhere('erro', 'like', `%${runApify}%`)
        .orderBy('id', 'desc')
        .first('ator')) as { ator: string | null } | undefined;
      if (origem) tipo = tipoDoAtor(origem.ator);
    }
    const nomes = {
      posts: 'Posts do LinkedIn',
      paginas: 'Dados das páginas (seguidores, logos e sites)',
      vagas: 'Vagas publicadas (30 dias)',
    };
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
