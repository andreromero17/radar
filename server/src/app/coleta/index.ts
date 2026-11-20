// Coleta: execução sob demanda (rota, em segundo plano) e diária (tarefa), por espaço.
import { comEspaco, idsEspacosAtivos } from '../../espacos';
import type { Db } from '../../db/knex';
import { getAppSetting } from '../../services/settings';
import { daysAgo, nowLocal } from '../../utils/time';
import { apifyConfigurado } from './apify';
import { coletarPosts } from './posts';

export { apifyConfigurado, definirContextoApify, ErroApify } from './apify';
export { ATOR_POSTS, autorEhDaFonte, coletarPosts, idDoPost } from './posts';

/** Espaços com coleta rodando agora (evita duas ao mesmo tempo) */
export const coletasEmAndamento = new Set<number>();

/** Coleta que ficou "Rodando" sem estar rodando (servidor reiniciado no meio) vira Erro, com o run para retomar */
export async function encerrarInterrompidas(db: Db, espacoId: number) {
  if (coletasEmAndamento.has(espacoId)) return;
  await db('coletas')
    .where('situacao', 'Rodando')
    .where('inicio', '<', daysAgo(0.02)) // ~30 min: dá tempo de a rota criar a linha e disparar
    .update({
      situacao: 'Erro',
      fim: nowLocal(),
      erro: 'Interrompida (o servidor reiniciou durante a coleta). Retome pelo run no Apify, se houver.',
    });
}

export async function coletarEspaco(espacoId: number, coletaId?: number, runId?: string) {
  if (coletasEmAndamento.has(espacoId)) return null;
  coletasEmAndamento.add(espacoId);
  try {
    return await comEspaco(espacoId, (db) => coletarPosts(db, { coletaId, runId }));
  } finally {
    coletasEmAndamento.delete(espacoId);
  }
}

/** Tarefa diária: todos os espaços com a coleta diária ligada */
export async function coletarTodos() {
  if (!apifyConfigurado()) return { espacos: 0 };
  let n = 0;
  for (const id of await idsEspacosAtivos()) {
    const ligada = await comEspaco(id, (db) => getAppSetting<boolean>(db, 'coleta_diaria'));
    if (!ligada) continue;
    try {
      await coletarEspaco(id);
      n++;
    } catch {
      /* o erro fica gravado na linha da coleta */
    }
  }
  return { espacos: n };
}
