// Espaços (Fase 5B): trocar o espaço em uso recarrega o app inteiro — nada do espaço anterior (listas em cache,
// período, configurações do sistema) sobrevive na tela.
import { api } from './api';
import { limparPeriodo } from './periodoGlobal';

export function recarregarNoEspaco() {
  limparPeriodo();
  window.location.assign('/');
}

export async function trocarEspaco(id: number) {
  await api.post('/auth/espaco', { id });
  recarregarNoEspaco();
}

/** Ícone (Bootstrap Icons) de cada tipo de espaço */
export const ICONE_TIPO: Record<string, string> = { pessoal: 'person', holding: 'bank', empresa: 'building' };
