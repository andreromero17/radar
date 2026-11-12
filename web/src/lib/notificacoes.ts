// Ajudantes das notificações (sino do topo e página /notificacoes)
import type { Notificacao } from '@frame/shared';

/** Avisa as outras partes da tela (sino ↔ página de notificações) que algo mudou */
export const avisarMudanca = () => window.dispatchEvent(new Event('notificacoes:mudou'));

const COR: Record<Notificacao['nivel'], string> = {
  info: 'var(--brand-1)',
  sucesso: 'var(--positive)',
  aviso: 'var(--warning)',
  perigo: 'var(--negative)',
};
export const corNivel = (n: Notificacao['nivel']) => COR[n] ?? COR.info;
export const iconeNivel = (n: Notificacao) =>
  n.icone ??
  (n.nivel === 'perigo'
    ? 'exclamation-octagon'
    : n.nivel === 'aviso'
      ? 'exclamation-triangle'
      : n.nivel === 'sucesso'
        ? 'check-circle'
        : 'info-circle');

/** "agora", "há 5 min", "há 3 h", "ontem", "12/11" */
export function quando(criada: string) {
  const t = new Date(criada.replace(' ', 'T')).getTime();
  const min = Math.floor((Date.now() - t) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  if (h < 48) return 'ontem';
  return `${criada.slice(8, 10)}/${criada.slice(5, 7)}`;
}
