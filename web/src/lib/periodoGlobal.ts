// Período escolhido pelo usuário (seletor de mês/período) vale para a navegação toda: quem abre uma tela sem
// período na URL usa o último escolhido. Volta ao mês atual em um novo login (limpo no login e no logout).
import { monthRange } from './listParams';

export type PeriodoGlobal = { de: string | null; ate: string | null } | 'todos';
const CHAVE = 'periodo-global';

export function lerPeriodo(): PeriodoGlobal | null {
  try {
    const v = sessionStorage.getItem(CHAVE);
    if (!v) return null;
    const p = JSON.parse(v) as PeriodoGlobal;
    return p === 'todos' || (typeof p === 'object' && p && ('de' in p || 'ate' in p)) ? p : null;
  } catch {
    return null;
  }
}

export function guardarPeriodo(p: PeriodoGlobal) {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    /* sem storage: cada tela abre no mês atual */
  }
}

export function limparPeriodo() {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    /* idem */
  }
}

/** Período para uma tela aberta sem período: o último escolhido ou o mês atual (null = todo o período) */
export function periodoPadrao(): { de: string | null; ate: string | null } | null {
  const p = lerPeriodo();
  if (p === 'todos') return null;
  if (p) return p;
  const h = new Date();
  return monthRange(h.getFullYear(), h.getMonth());
}

/** Mês ('AAAA-MM') para telas por mês: o do início do período escolhido, ou o atual */
export function mesPadrao(): string {
  const p = lerPeriodo();
  const d = p && p !== 'todos' ? (p.de ?? p.ate) : null;
  if (d && /^\d{4}-\d{2}/.test(d)) return d.slice(0, 7);
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}

/** Tela por mês (MonthPicker) trocou de mês: vira o período de todas as telas */
export function guardarMes(mes: string) {
  const [y, m] = mes.split('-').map(Number);
  if (y && m) guardarPeriodo(monthRange(y, m - 1));
}
