import type { Db } from '../db/knex';

/**
 * Dados de exemplo da APLICAÇÃO (npm run db:seed / db:reset; só desenvolvimento).
 * Roda depois do seed do núcleo (que cria o administrador).
 */
export async function seedApp(_db: Db): Promise<void> {}
