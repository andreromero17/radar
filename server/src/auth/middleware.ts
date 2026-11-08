import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { can, type Action, type AuthUser } from '@frame/shared';
import type { Db } from '../db/knex';
import { HttpError } from '../utils/http';
import { resolveSession, type SessionConfig } from './sessions';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Preenchido quando há sessão válida */
      auth?: { user: AuthUser; sessionId: string };
    }
  }
}

export const COOKIE_NAME = 'sid';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/** Carrega a sessão do cookie (se houver). Não bloqueia nada. */
export function authenticate(db: Db, cfg: SessionConfig): RequestHandler {
  return async (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (token) {
      const s = await resolveSession(db, cfg, token);
      if (s) req.auth = s;
    }
    next();
  };
}

/** Exige login; e, se o usuário precisa trocar a senha, só libera depois da troca */
export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth) throw new HttpError(401, 'Sessão expirada. Faça login novamente.');
  if (req.auth.user.trocar_senha)
    throw new HttpError(403, 'Defina uma nova senha para continuar.', undefined, 'TROCAR_SENHA');
  next();
};

/** Usuário logado (use depois de requireAuth) */
export const userOf = (req: Request): AuthUser => {
  if (!req.auth) throw new HttpError(401, 'Sessão expirada. Faça login novamente.');
  return req.auth.user;
};

/** Lança 403 se o usuário não pode executar a ação no recurso */
export function assertCan(req: Request, resource: string, action: Action) {
  if (!can(userOf(req), resource, action)) throw new HttpError(403, 'Você não tem permissão para esta ação');
}

export const requirePermission =
  (resource: string, action: Action): RequestHandler =>
  (req, _res, next) => {
    assertCan(req, resource, action);
    next();
  };

/**
 * Proteção contra CSRF: requisições que alteram dados só são aceitas sem
 * cabeçalho Origin (ferramentas como curl) ou vindas de origem conhecida.
 * Somado ao cookie SameSite=Lax, impede que outro site use a sessão do usuário.
 */
export function originGuard(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins.map((o) => new URL(o).origin));
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    try {
      const o = new URL(origin);
      if (allowed.has(o.origin) || o.host === req.get('host')) return next();
    } catch {
      /* origem malformada */
    }
    throw new HttpError(403, 'Origem não permitida');
  };
}
