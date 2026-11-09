// Meses no formato 'AAAA-MM' (seletor de mês e telas por mês)
const pad = (n: number) => String(n).padStart(2, '0');

/** 'AAAA-MM' de um ano e mês (0-11), aceitando mês fora da faixa (-1 = dezembro do ano anterior) */
export const mesIso = (ano: number, mes: number) => {
  const d = new Date(ano, mes, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/** "Janeiro 2025" */
export function nomeMes(mes: string) {
  const [y, m] = mes.split('-').map(Number);
  const t = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return `${t.charAt(0).toUpperCase()}${t.slice(1)} ${y}`;
}
