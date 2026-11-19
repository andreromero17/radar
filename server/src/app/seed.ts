import type { Db } from '../db/knex';
import { importarPiloto } from './services/piloto';

/**
 * Dados de EXEMPLO (npm run db:seed / db:reset; só desenvolvimento): os dados reais do piloto do Radar
 * (empresas, pessoas-chave, publicações e sinais coletados em 19/11/2026).
 */
export async function seedApp(db: Db): Promise<void> {
  await importarPiloto(db);
}
