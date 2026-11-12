// Rotas dos painéis e relatórios configuráveis (todas exigem login):
//   GET /api/dados/:nome?de=&ate=&...           fonte de dados de um widget
//   GET /api/relatorios                          conjuntos que o usuário pode ver
//   GET /api/relatorios/:nome?de=&ate=&linhas=&f_<dim>=a,b   tabela dinâmica (linhas × meses)
//   GET /api/preferencias/:chave                 preferência do usuário (JSON) ou null
//   PUT /api/preferencias/:chave                 grava { valor }
import { Router, type Request } from 'express';
import { can, type Action } from '@frame/shared';
import { userOf } from '../auth/middleware';
import type { Db } from '../db/knex';
import {
  conjunto,
  conjuntosInfo,
  filtrosDaQuery,
  fonteDados,
  pivotar,
  validarDimensao,
  type ContextoDados,
} from '../services/paineis';
import { badRequest, forbidden, HttpError } from '../utils/http';
import { nowLocal } from '../utils/time';

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, '0');

function periodo(req: Request) {
  const h = new Date();
  const ini = `${h.getFullYear()}-${pad(h.getMonth() + 1)}-01`;
  const fim = `${h.getFullYear()}-${pad(h.getMonth() + 1)}-${pad(new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate())}`;
  const de = typeof req.query.de === 'string' && DATA.test(req.query.de) ? req.query.de : ini;
  const ate = typeof req.query.ate === 'string' && DATA.test(req.query.ate) ? req.query.ate : fim;
  if (de > ate) throw badRequest('Período inválido');
  return { de, ate };
}

export function paineisRouter(db: Db) {
  const router = Router();
  const pode = (req: Request) => (perm?: [string, Action]) => !perm || can(userOf(req), perm[0], perm[1]);
  const ctx = (req: Request): ContextoDados => ({
    db,
    user: userOf(req),
    ...periodo(req),
    params: Object.fromEntries(
      Object.entries(req.query)
        .filter(([k, v]) => k !== 'de' && k !== 'ate' && typeof v === 'string')
        .map(([k, v]) => [k, String(v)]),
    ),
  });

  router.get('/dados/:nome', async (req, res) => {
    const f = fonteDados(req.params.nome);
    if (!f) throw new HttpError(404, 'Fonte de dados não encontrada');
    if (!pode(req)(f.perm)) throw forbidden();
    res.json(await f.carregar(ctx(req)));
  });

  router.get('/relatorios', (req, res) => {
    res.json(conjuntosInfo(pode(req)));
  });

  router.get('/relatorios/:nome', async (req, res) => {
    const def = conjunto(req.params.nome);
    if (!def) throw new HttpError(404, 'Relatório não encontrado');
    if (!pode(req)(def.perm)) throw forbidden();
    const c = ctx(req);
    const dimensao = validarDimensao(def, req.query.linhas);
    const filtros = filtrosDaQuery(def, req.query) ?? def.filtrosPadrao ?? {};
    const meses =
      Number(c.ate.slice(0, 4)) * 12 +
      Number(c.ate.slice(5, 7)) -
      (Number(c.de.slice(0, 4)) * 12 + Number(c.de.slice(5, 7)));
    if (meses > 60) throw badRequest('Período longo demais (até 5 anos)');
    res.json(pivotar(req.params.nome, def, await def.carregar(c), { de: c.de, ate: c.ate, dimensao, filtros }));
  });

  // ---------- preferências do usuário ----------
  const CHAVE = /^[a-z0-9_.:-]{1,80}$/i;
  router.get('/preferencias/:chave', async (req, res) => {
    if (!CHAVE.test(req.params.chave)) throw badRequest('Chave inválida');
    const row = await db('preferencias')
      .where({ usuario_id: userOf(req).id, chave: req.params.chave })
      .first('valor');
    res.json({ valor: row?.valor ? JSON.parse(row.valor) : null });
  });

  router.put('/preferencias/:chave', async (req, res) => {
    if (!CHAVE.test(req.params.chave)) throw badRequest('Chave inválida');
    const valor = (req.body ?? {}).valor;
    const json = valor === undefined || valor === null ? null : JSON.stringify(valor);
    if (json && json.length > 20_000) throw badRequest('Preferência grande demais');
    const usuario_id = userOf(req).id;
    const chave = req.params.chave;
    if (json == null) await db('preferencias').where({ usuario_id, chave }).del();
    else
      await db('preferencias')
        .insert({ usuario_id, chave, valor: json, atualizado_em: nowLocal() })
        .onConflict(['usuario_id', 'chave'])
        .merge(['valor', 'atualizado_em']);
    res.json({ valor: valor ?? null });
  });

  return router;
}
