import type { AuthUser, Row } from '@frame/shared';
import type { Db } from '../db/knex';

export interface HookContext {
  db: Db;
  /** Usuário que está executando a ação */
  actor: AuthUser;
  /** Sessão atual (para não derrubar a própria sessão) */
  sessionId?: string;
  mode: 'create' | 'update';
  /** Registro como está no banco (update) */
  current?: Row;
}

/**
 * Regras de negócio por entidade. Lance HttpError (badRequest, forbidden,
 * conflict) para barrar a operação com uma mensagem amigável.
 */
export interface EntityHooks {
  /** Antes de gravar. Pode alterar `data` (já validado; senha já em hash). */
  beforeSave?(data: Record<string, unknown>, ctx: HookContext): Promise<void>;
  /** Depois de gravar, com o registro final e o que foi enviado */
  afterSave?(row: Row, data: Record<string, unknown>, ctx: HookContext): Promise<void>;
  /** Antes de excluir */
  beforeDelete?(current: Row, ctx: Omit<HookContext, 'mode' | 'current'>): Promise<void>;
}
