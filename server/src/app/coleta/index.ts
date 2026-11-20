// Coleta: execução sob demanda (rota, em segundo plano) e diária (tarefa), por espaço.
//   tipo 'posts'   → posts das páginas e perfis (todo dia)
//   tipo 'paginas' → seguidores, funcionários, logos e site das páginas E, em seguida, as vagas (uma vez por semana)
//   tipo 'vagas'   → só as vagas (para retomar um run do ator de vagas)
import type { Db } from '../../db/knex';
import { comEspaco, idsEspacosAtivos } from '../../espacos';
import { getAppSetting } from '../../services/settings';
import { daysAgo, nowLocal } from '../../utils/time';
import { apifyConfigurado } from './apify';
import { ATOR_PAGINAS, coletarPaginas, type ResultadoPaginas } from './paginas';
import { ATOR_POSTS, coletarPosts, type ResultadoColeta } from './posts';
import { ATOR_VAGAS, coletarVagas, type ResultadoVagas } from './vagas';

export { apifyConfigurado, baixarImagem, definirContextoApify, ErroApify } from './apify';
export { ATOR_PAGINAS, coletarPaginas } from './paginas';
export { ATOR_POSTS, autorEhDaFonte, coletarPosts, idDoPost } from './posts';
export { ATOR_VAGAS, coletarVagas } from './vagas';

export type TipoColeta = 'posts' | 'paginas' | 'vagas';
export const ATORES: Record<TipoColeta, string> = { posts: ATOR_POSTS, paginas: ATOR_PAGINAS, vagas: ATOR_VAGAS };
export const tipoDoAtor = (ator: string | null | undefined): TipoColeta => {
  const a = (ator ?? '').replace('/', '~');
  return a === ATOR_PAGINAS ? 'paginas' : a === ATOR_VAGAS ? 'vagas' : 'posts';
};

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

export async function coletarEspaco(
  espacoId: number,
  opcoes: { tipo?: TipoColeta; coletaId?: number; runId?: string } = {},
) {
  if (coletasEmAndamento.has(espacoId)) return null;
  coletasEmAndamento.add(espacoId);
  try {
    return await comEspaco<ResultadoPaginas | ResultadoColeta | ResultadoVagas>(espacoId, async (db) => {
      if (opcoes.tipo === 'vagas') return coletarVagas(db, { coletaId: opcoes.coletaId, runId: opcoes.runId });
      if (opcoes.tipo !== 'paginas') return coletarPosts(db, { coletaId: opcoes.coletaId, runId: opcoes.runId });
      const r = await coletarPaginas(db, { coletaId: opcoes.coletaId, runId: opcoes.runId });
      if (!opcoes.runId) await coletarVagas(db).catch(() => undefined); // o erro fica gravado na linha das vagas
      return r;
    });
  } finally {
    coletasEmAndamento.delete(espacoId);
  }
}

/** Páginas vencidas: nenhuma coleta de páginas OK nos últimos 6 dias */
async function paginasVencidas(db: Db) {
  const ultima = await db('coletas')
    .where({ situacao: 'Ok', ator: ATOR_PAGINAS.replace('~', '/') })
    .where('inicio', '>', daysAgo(6))
    .first('id');
  return !ultima;
}

/** Tarefa diária: posts em todos os espaços com a coleta ligada; páginas quando vencidas (semanal) */
export async function coletarTodos() {
  if (!apifyConfigurado()) return { espacos: 0 };
  let n = 0;
  for (const id of await idsEspacosAtivos()) {
    const { ligada, vencidas } = await comEspaco(id, async (db) => ({
      ligada: await getAppSetting<boolean>(db, 'coleta_diaria'),
      vencidas: await paginasVencidas(db),
    }));
    if (!ligada) continue;
    for (const tipo of ['posts', ...(vencidas ? ['paginas'] : [])] as TipoColeta[]) {
      try {
        await coletarEspaco(id, { tipo });
      } catch {
        /* o erro fica gravado na linha da coleta */
      }
    }
    n++;
  }
  return { espacos: n };
}
