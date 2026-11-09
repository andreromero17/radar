import type { Db } from '../db/knex';

/**
 * Manutenção diária da APLICAÇÃO (gerar lançamentos recorrentes, avisos, limpezas...).
 * Roda no boot do servidor e depois a cada 24 h, junto com a manutenção do núcleo.
 * Devolva contadores do que foi feito ({ gerados: 3 }); o que for diferente de zero vai para o log.
 */
export async function appMaintenance(_db: Db): Promise<Record<string, number>> {
  return {};
}
