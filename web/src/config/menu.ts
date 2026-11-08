// =============================================================================
// Menu lateral = núcleo (Dashboard, Administração) + aplicação (app/menu.ts).
// Para outro sistema, edite web/src/app/menu.ts, não este arquivo.
// `perm` esconde o item de quem não tem a permissão [recurso, ação].
// =============================================================================
import type { Action } from '@frame/shared';
import { appMenu } from '../app/menu';
import { demoMenu } from '../demo/menu';

export interface MenuItem {
  label: string;
  icon: string;
  to?: string;
  perm?: [resource: string, action: Action];
  children?: MenuItem[];
}

export const menu: MenuItem[] = [
  { label: 'Dashboard', icon: 'speedometer2', to: '/' },
  ...appMenu,
  ...(__DEMO__ ? demoMenu : []),
  {
    label: 'Administração',
    icon: 'sliders',
    children: [
      { label: 'Usuários', icon: 'person-gear', to: '/usuarios', perm: ['usuarios', 'ver'] },
      { label: 'Perfis de acesso', icon: 'shield-lock', to: '/perfis', perm: ['perfis', 'ver'] },
      { label: 'Logs', icon: 'journal-text', to: '/logs', perm: ['logs', 'ver'] },
      { label: 'Backup', icon: 'database', to: '/backup', perm: ['backup', 'ver'] },
    ],
  },
];

/** Menu filtrado pelas permissões (grupos sem itens visíveis somem) */
export function visibleMenu(items: MenuItem[], can: (resource: string, action: Action) => boolean): MenuItem[] {
  return items.flatMap((m) => {
    if (m.children) {
      const children = visibleMenu(m.children, can);
      return children.length ? [{ ...m, children }] : [];
    }
    return !m.perm || can(...m.perm) ? [m] : [];
  });
}

/** Retorna o `to` do item de menu que melhor casa com a URL atual. */
export function activeMenuPath(pathname: string): string | undefined {
  const all = menu
    .flatMap((m) => m.children ?? [m])
    .map((m) => m.to)
    .filter((to): to is string => !!to);
  return all
    .filter((to) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(to + '/')))
    .sort((a, b) => b.length - a.length)[0];
}
