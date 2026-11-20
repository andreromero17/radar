// Universo escolhido nas abas do topo (Contas-alvo | Concorrentes): fica na URL (?u=) e é lembrado no navegador.
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export type UniversoTela = 'Conta-alvo' | 'Concorrente';
const CHAVE = 'radar.universo';
const lerGuardado = (): UniversoTela => {
  try {
    return localStorage.getItem(CHAVE) === 'Concorrente' ? 'Concorrente' : 'Conta-alvo';
  } catch {
    return 'Conta-alvo';
  }
};

export function useUniverso(): [UniversoTela, (u: UniversoTela) => void] {
  const [params, setParams] = useSearchParams();
  const daUrl = params.get('u');
  const universo: UniversoTela =
    daUrl === 'concorrentes' ? 'Concorrente' : daUrl === 'contas' ? 'Conta-alvo' : lerGuardado();
  const mudar = useCallback(
    (u: UniversoTela) => {
      try {
        localStorage.setItem(CHAVE, u);
      } catch {
        /* sem armazenamento: só a URL */
      }
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.set('u', u === 'Concorrente' ? 'concorrentes' : 'contas');
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [universo, mudar];
}

/** Formata números grandes: 1.129.208 → "1,13 mi"; 56.593 → "56,6 mil" */
export function compacto(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return n.toLocaleString('pt-BR');
}
export const dataCurta = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—');
