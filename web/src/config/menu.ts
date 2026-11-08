// =============================================================================
// Menu lateral. Para outro sistema, edite este arquivo (e shared/src/entities.ts).
// Nome, ícone/logo e cores do sistema ficam na tela de Configurações (menu do usuário).
// Itens com `children` viram submenus recolhíveis.
// Ícones: https://icons.getbootstrap.com (use o nome sem o prefixo "bi-")
// =============================================================================

export interface MenuItem {
  label: string;
  icon: string;
  to?: string;
  children?: MenuItem[];
}

export const menu: MenuItem[] = [
  { label: 'Dashboard', icon: 'speedometer2', to: '/' },
  { label: 'Abertura de Chamados', icon: 'plus-circle', to: '/chamados/novo' },
  { label: 'Chamados', icon: 'ticket-perforated', to: '/chamados' },
  {
    label: 'Cadastros',
    icon: 'folder2-open',
    children: [
      { label: 'Clientes', icon: 'people', to: '/clientes' },
      { label: 'Usuários', icon: 'person-gear', to: '/usuarios' },
    ],
  },
  { label: 'Logs', icon: 'journal-text', to: '/logs' },
  { label: 'Backup', icon: 'database', to: '/backup' },
];

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
