// Coleta: execução sob demanda (rota, em segundo plano) e diária (tarefa), por espaço.
import { comEspaco, idsEspacosAtivos } from '../../espacos';
import { getAppSetting } from '../../services/settings';
import { apifyConfigurado } from './apify';
import { coletarPosts } from './posts';

export { apifyConfigurado, definirContextoApify, ErroApify } from './apify';
export { ATOR_POSTS, autorEhDaFonte, coletarPosts, idDoPost } from './posts';

/** Espaços com coleta rodando agora (evita duas ao mesmo tempo) */
export const coletasEmAndamento = new Set<number>();

export async function coletarEspaco(espacoId: number, coletaId?: number) {
  if (coletasEmAndamento.has(espacoId)) return null;
  coletasEmAndamento.add(espacoId);
  try {
    return await comEspaco(espacoId, (db) => coletarPosts(db, { coletaId }));
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
