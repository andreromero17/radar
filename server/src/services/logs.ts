import type { Db } from '../db/knex';
import { daysAgo, nowLocal } from '../utils/time';

export async function addLog(
  db: Db,
  entry: { entidade: string; registro_id?: number | null; acao: string; detalhe?: string | null },
) {
  await db('logs').insert({
    entidade: entry.entidade,
    registro_id: entry.registro_id ?? null,
    acao: entry.acao,
    detalhe: entry.detalhe ?? '',
    usuario: 'Administrador', // Fase 1: usuário autenticado
    criado_em: nowLocal(),
  });
}

/** Remove logs mais antigos que `dias` (0 = mantém tudo). Retorna quantos removeu. */
export async function purgeLogs(db: Db, dias: number): Promise<number> {
  if (!dias) return 0;
  return db('logs').where('criado_em', '<', daysAgo(dias)).del();
}
