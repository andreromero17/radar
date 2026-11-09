// "Voltar" para onde o usuário estava: quem navega passa `state: useOrigem()`; o destino usa `useVolta(padrão)`.
// Encadeia (lista → fatura → lançamento → fatura → lista): cada origem leva junto o estado da anterior.
import { useLocation } from 'react-router-dom';

export interface EstadoVolta {
  voltar: string;
  voltarState?: unknown;
}
export interface Volta {
  to: string;
  state?: unknown;
}

/** Estado a passar ao navegar daqui para outra tela, para ela conseguir voltar para cá */
export function useOrigem(): EstadoVolta {
  const { pathname, search, state } = useLocation();
  return { voltar: `${pathname}${search}`, voltarState: state };
}

/** Para onde voltar: a tela de origem (se veio de uma) ou o padrão */
export function useVolta(padrao: string): Volta {
  const s = useLocation().state as Partial<EstadoVolta> | null;
  return typeof s?.voltar === 'string' && s.voltar.startsWith('/')
    ? { to: s.voltar, state: s.voltarState ?? null }
    : { to: padrao };
}
