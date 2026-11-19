// Pipedrive: sincronização sob demanda (rota) e diária (tarefa), com o último resultado por espaço em memória.
import type { Db } from '../../db/knex';
import { comEspaco, espacoAtivoOuNulo, idsEspacosAtivos } from '../../espacos';
import { getAppSetting } from '../../services/settings';
import { nowLocal } from '../../utils/time';
import { pipedriveConfigurado } from './cliente';
import { sincronizarPipedrive, type ResultadoSincronizacao } from './sincronizar';

export { definirContextoPipedrive, ErroPipedrive, pipedriveConfigurado } from './cliente';
export { nivelDoCargo, sincronizarPipedrive } from './sincronizar';

export interface UltimaSincronizacao {
  quando: string;
  ok: boolean;
  erro?: string;
  resultado?: ResultadoSincronizacao;
}
const ultimas = new Map<number, UltimaSincronizacao>();
const espacoAtual = () => espacoAtivoOuNulo()?.espacoId ?? 0;

/** Sincroniza o espaço do banco recebido e guarda o resultado (ou o erro) */
export async function sincronizarERegistrar(db: Db, espacoId = espacoAtual()): Promise<UltimaSincronizacao> {
  try {
    const resultado = await sincronizarPipedrive(db);
    const u = { quando: nowLocal(), ok: true, resultado };
    ultimas.set(espacoId, u);
    return u;
  } catch (e) {
    const u = { quando: nowLocal(), ok: false, erro: e instanceof Error ? e.message : String(e) };
    ultimas.set(espacoId, u);
    return u;
  }
}

export async function statusPipedrive(db: Db) {
  return {
    configurado: pipedriveConfigurado(),
    filtro_contas: Number(await getAppSetting(db, 'pipedrive_filtro_contas')) || 0,
    filtro_concorrentes: Number(await getAppSetting(db, 'pipedrive_filtro_concorrentes')) || 0,
    ultima: ultimas.get(espacoAtual()) ?? null,
  };
}

/** Tarefa diária: todos os espaços com filtro configurado e a opção diária ligada */
export async function sincronizarTodos() {
  if (!pipedriveConfigurado()) return { espacos: 0 };
  let n = 0;
  for (const id of await idsEspacosAtivos()) {
    await comEspaco(id, async (db) => {
      const diario = await getAppSetting<boolean>(db, 'pipedrive_sincronizar_diario');
      const temFiltro =
        Number(await getAppSetting(db, 'pipedrive_filtro_contas')) ||
        Number(await getAppSetting(db, 'pipedrive_filtro_concorrentes'));
      if (!diario || !temFiltro) return;
      await sincronizarERegistrar(db, id);
      n++;
    });
  }
  return { espacos: n };
}
