// =============================================================================
// Tokens de integração (frame 0.29.0): acesso sem navegador — atalho do celular, automação, outro sistema — a
// rotas que o sistema libera para um ESCOPO (`registerEscopoIntegracao`). O token é do usuário e de UM espaço,
// vai no cabeçalho `Authorization: Bearer fi_...`, é guardado só como hash, pode ser revogado e só abre as rotas
// do escopo dele (o resto dá 403). Permissões e papel no espaço valem como para o próprio usuário.
// =============================================================================
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { inserir, type Db } from '../db/knex';
import { HttpError, badRequest } from '../utils/http';
import { nowLocal } from '../utils/time';
import { RateLimiter } from './rateLimit';
import { loadAuthUser } from './sessions';
import { hashToken, newToken } from './tokens';

export interface EscopoIntegracao {
  escopo: string;
  nome: string;
  descricao: string;
  /** Rotas liberadas, como 'POST /api/financas/mensagens' */
  rotas: string[];
}

const escopos = new Map<string, EscopoIntegracao>();
export const registerEscopoIntegracao = (e: EscopoIntegracao) => void escopos.set(e.escopo, e);
export const escoposIntegracao = () => [...escopos.values()];

export const PREFIXO_TOKEN = 'fi_';

/** Confere o token do cabeçalho Authorization (Bearer); null se inválido, revogado ou do usuário inativo */
export async function resolveTokenIntegracao(db: Db, token: string) {
  if (!token.startsWith(PREFIXO_TOKEN)) return null;
  const t = await db('tokens_integracao')
    .where({ token_hash: hashToken(token) })
    .whereNull('revogado_em')
    .first();
  if (!t) return null;
  const user = await loadAuthUser(db, t.usuario_id);
  if (!user) return null;
  const agora = nowLocal();
  if (!t.ultimo_uso || String(t.ultimo_uso).slice(0, 16) !== agora.slice(0, 16))
    await db('tokens_integracao').where({ id: t.id }).update({ ultimo_uso: agora });
  return {
    user,
    sessionId: `token:${t.id}`,
    espacoId: Number(t.espaco_id),
    suporteId: null,
    integracao: { id: Number(t.id), escopo: String(t.escopo) },
  };
}

const limite = new RateLimiter(60, 60_000);

/**
 * Requisição com token de integração só passa nas rotas do escopo dele (e no máximo 60 por minuto por token).
 * Fica logo depois do `authenticate`.
 */
export const guardaIntegracao: RequestHandler = (req, _res, next) => {
  const i = req.auth?.integracao;
  if (!i) return next();
  const rota = `${req.method} ${req.originalUrl.split('?')[0].replace(/\/+$/, '')}`;
  if (!escopos.get(i.escopo)?.rotas.includes(rota))
    throw new HttpError(403, 'Este token de integração não vale para esta rota');
  const espera = limite.hit(`token:${i.id}`);
  if (espera) throw new HttpError(429, `Muitas requisições com este token. Tente em ${espera}s.`);
  next();
};

const novoSchema = z.object({
  nome: z.string().trim().min(1, 'Dê um nome ao token').max(80),
  escopo: z.string().min(1),
});

/** Meu perfil → Integrações: os tokens do usuário NO espaço da sessão */
export function integracaoRouter(plataforma: Db) {
  const r = Router();
  const dono = (req: Parameters<RequestHandler>[0]) => {
    const a = req.auth!;
    if (a.integracao) throw new HttpError(403, 'Use o sistema para gerenciar os tokens');
    if (!a.user.id || !a.espacoId) throw new HttpError(403, 'Entre num espaço para usar integrações');
    return { usuario_id: a.user.id, espaco_id: a.espacoId };
  };
  r.get('/integracoes/escopos', (_req, res) => {
    res.json(escoposIntegracao().map(({ escopo, nome, descricao }) => ({ escopo, nome, descricao })));
  });
  r.get('/integracoes/tokens', async (req, res) => {
    const rows = await plataforma('tokens_integracao')
      .where(dono(req))
      .whereNull('revogado_em')
      .orderBy('id', 'desc')
      .select('id', 'nome', 'escopo', 'prefixo', 'criado_em', 'ultimo_uso');
    res.json(rows);
  });
  r.post('/integracoes/tokens', async (req, res) => {
    const d = dono(req);
    const p = novoSchema.safeParse(req.body ?? {});
    if (!p.success) throw badRequest('Verifique os campos', { nome: p.error.issues[0]?.message ?? 'Inválido' });
    if (!escopos.has(p.data.escopo))
      throw badRequest('Verifique os campos', { escopo: 'Escolha o tipo de integração' });
    const token = `${PREFIXO_TOKEN}${newToken()}`;
    const id = await inserir(plataforma('tokens_integracao'), {
      ...d,
      nome: p.data.nome,
      escopo: p.data.escopo,
      token_hash: hashToken(token),
      prefixo: token.slice(0, 10),
      criado_em: nowLocal(),
    });
    // o token aparece só agora: depois, só o prefixo
    res.status(201).json({ id, nome: p.data.nome, escopo: p.data.escopo, token });
  });
  r.delete('/integracoes/tokens/:id', async (req, res) => {
    const n = await plataforma('tokens_integracao')
      .where({ id: Number(req.params.id), ...dono(req) })
      .whereNull('revogado_em')
      .update({ revogado_em: nowLocal() });
    if (!n) throw new HttpError(404, 'Token não encontrado');
    res.json({ ok: true });
  });
  return r;
}
