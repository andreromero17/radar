// =============================================================================
// Menu lateral. Para outro sistema, edite este arquivo (e shared/src/entities.ts).
// Nome, ícone/logo e cores do sistema ficam na tela de Configurações.
// Itens com `children` viram submenus recolhíveis.
// `perm` esconde o item de quem não tem a permissão [recurso, ação].
// Ícones: https://icons.getbootstrap.com (use o nome sem o prefixo "bi-")
// =============================================================================
import type { Action } from '@frame/shared';

export interface MenuItem {
  label: string;
  icon: string;
  to?: string;
  perm?: [resource: string, action: Action];
  children?: MenuItem[];
}

export const menu: MenuItem[] = [
  { label: 'Dashboard', icon: 'speedometer2', to: '/' },
  { label: 'Abertura de Chamados', icon: 'plus-circle', to: '/chamados/novo', perm: ['chamados', 'criar'] },
  { label: 'Chamados', icon: 'ticket-perforated', to: '/chamados', perm: ['chamados', 'ver'] },
  {
    label: 'Cadastros',
    icon: 'folder2-open',
    children: [
      { label: 'Clientes', icon: 'people', to: '/clientes', perm: ['clientes', 'ver'] },
      { label: 'Usuários', icon: 'person-gear', to: '/usuarios', perm: ['usuarios', 'ver'] },
      { label: 'Perfis de acesso', icon: 'shield-lock', to: '/perfis', perm: ['perfis', 'ver'] },
    ],
  },
  { label: 'Logs', icon: 'journal-text', to: '/logs', perm: ['logs', 'ver'] },
  { label: 'Backup', icon: 'database', to: '/backup', perm: ['backup', 'ver'] },
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
