import type { AuthUser, Permissions } from '@frame/shared';
import { permissionsSchema, APARENCIAS, TAMANHOS_TEXTO } from '@frame/shared';
import type { Db } from '../db/knex';
import { nowLocal } from '../utils/time';
import { hashToken, newToken } from './tokens';

export interface SessionConfig {
  /** Sessão comum expira após X horas sem uso */
  sessionHours: number;
  /** "Lembrar de mim": duração fixa em dias */
  rememberDays: number;
}

const inHours = (h: number) => nowLocal(new Date(Date.now() + h * 3_600_000));
/** Renova a sessão (desliza o vencimento) no máximo a cada 5 minutos */
const TOUCH_EVERY_MS = 5 * 60_000;

/** Monta o usuário autenticado (com perfil e permissões) a partir do id */
export async function loadAuthUser(db: Db, userId: number): Promise<AuthUser | null> {
  const row = await db('usuarios as u')
    .join('perfis as p', 'p.id', 'u.perfil_id')
    .where('u.id', userId)
    .whereIn('u.ativo', [1, true])
    .first(
      'u.id',
      'u.nome',
      'u.email',
      'u.trocar_senha',
      'u.aparencia',
      'u.tamanho_texto',
      'p.nome as perfil',
      'p.admin',
      'p.permissoes',
    );
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    perfil: row.perfil,
    admin: !!row.admin,
    permissoes: permissionsSchema.parse(row.permissoes) as Permissions,
    trocar_senha: !!row.trocar_senha,
    aparencia: APARENCIAS.includes(row.aparencia) ? row.aparencia : 'sistema',
    tamanho_texto: TAMANHOS_TEXTO.includes(row.tamanho_texto) ? row.tamanho_texto : 'normal',
  };
}

export async function createSession(
  db: Db,
  cfg: SessionConfig,
  userId: number,
  meta: { lembrar: boolean; ip?: string; userAgent?: string },
): Promise<{ token: string; id: string }> {
  const token = newToken();
  const id = hashToken(token);
  const agora = nowLocal();
  await db('sessoes').insert({
    id,
    usuario_id: userId,
    lembrar: meta.lembrar ? 1 : 0,
    criado_em: agora,
    ultimo_uso: agora,
    expira_em: meta.lembrar ? inHours(cfg.rememberDays * 24) : inHours(cfg.sessionHours),
    ip: meta.ip ?? null,
    user_agent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return { token, id };
}

/** Valida o token do cookie. Retorna a sessão e o usuário, ou null se inválida/expirada. */
export async function resolveSession(
  db: Db,
  cfg: SessionConfig,
  token: string,
): Promise<{ sessionId: string; user: AuthUser } | null> {
  const id = hashToken(token);
  const s = await db('sessoes').where({ id }).where('expira_em', '>', nowLocal()).first();
  if (!s) return null;
  const user = await loadAuthUser(db, s.usuario_id);
  if (!user) {
    await db('sessoes').where({ id }).del(); // usuário desativado/excluído
    return null;
  }
  const lastUse = new Date(String(s.ultimo_uso).replace(' ', 'T')).getTime();
  if (!s.lembrar && Date.now() - lastUse > TOUCH_EVERY_MS) {
    await db('sessoes')
      .where({ id })
      .update({ ultimo_uso: nowLocal(), expira_em: inHours(cfg.sessionHours) });
  }
  return { sessionId: id, user };
}

export const deleteSession = (db: Db, sessionId: string) => db('sessoes').where({ id: sessionId }).del();

/** Encerra todas as sessões do usuário (ex.: senha trocada, usuário desativado) */
export function deleteUserSessions(db: Db, userId: number, exceptSessionId?: string) {
  const q = db('sessoes').where({ usuario_id: userId });
  if (exceptSessionId) q.whereNot({ id: exceptSessionId });
  return q.del();
}

/** Remove sessões vencidas e tokens de senha usados/vencidos */
export async function purgeExpiredAuth(db: Db): Promise<number> {
  const agora = nowLocal();
  const s = await db('sessoes').where('expira_em', '<=', agora).del();
  const t = await db('tokens_senha').where('expira_em', '<=', agora).orWhereNotNull('usado_em').del();
  return s + t;
}
