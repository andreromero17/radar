const pad = (n: number) => String(n).padStart(2, '0');

/** Data/hora local no formato 'YYYY-MM-DD HH:MM:SS' (portável entre SQLite e Postgres) */
export function nowLocal(date: Date = new Date()): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** Prefixo 'YYYY-MM' do mês da data */
export const monthPrefix = (date: Date = new Date()) => nowLocal(date).slice(0, 7);

/** Data/hora local de N dias atrás */
export const daysAgo = (days: number) => nowLocal(new Date(Date.now() - days * 86_400_000));

/** Protocolo legível, ex.: CH20261107-4F2A9 */
export function protocolo(date: Date = new Date()): string {
  const d = nowLocal(date).slice(0, 10).replaceAll('-', '');
  const r = Math.random().toString(16).slice(2, 7).toUpperCase().padEnd(5, '0');
  return `CH${d}-${r}`;
}
