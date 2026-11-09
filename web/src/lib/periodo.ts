import { fmtDate } from './format';

export type Intervalo = { de: string | null; ate: string | null };

/** Texto do botão para um intervalo que não é um mês inteiro */
export function rotuloPeriodo(de: string | null, ate: string | null): string {
  if (!de && !ate) return 'Todo o período';
  const ano = de?.slice(0, 4);
  if (de === `${ano}-01-01` && ate === `${ano}-12-31`) return `Ano de ${ano}`;
  if (!ate) return `A partir de ${fmtDate(de!)}`;
  if (!de) return `Até ${fmtDate(ate)}`;
  return `${fmtDate(de)} a ${fmtDate(ate)}`;
}

/** Datas De/Até escolhidas à mão; aceita só uma das pontas e corrige a ordem se vierem trocadas */
export function normalizarIntervalo(de: string, ate: string): Intervalo | null {
  if (!de && !ate) return null;
  if (de && ate && de > ate) return { de: ate, ate: de };
  return { de: de || null, ate: ate || null };
}
