import { Router } from 'express';
import type { Db } from '../db/knex';

/**
 * Rotas próprias da APLICAÇÃO (relatórios, ações especiais...), além do CRUD
 * genérico. Montadas em /api depois do login, antes do CRUD.
 * Use requirePermission(recurso, ação) de '../auth/middleware' em cada rota.
 */
export function appRouter(_db: Db) {
  const router = Router();
  return router;
}
