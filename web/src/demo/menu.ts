// Menu do módulo de demonstração (só aparece com DEMO=true no server/.env)
import type { MenuItem } from '../config/menu';

export const demoMenu: MenuItem[] = [
  {
    label: 'Demonstração',
    icon: 'stars',
    children: [
      {
        label: 'Movimentos',
        icon: 'arrow-left-right',
        to: '/demo_movimentos',
        perm: ['demo_movimentos', 'ver'],
        tab: true,
      },
      { label: 'Resumo por categoria', icon: 'pie-chart', to: '/demo/resumo', perm: ['demo_movimentos', 'ver'] },
      { label: 'Painel (widgets)', icon: 'grid-1x2', to: '/demo/painel', perm: ['demo_movimentos', 'ver'] },
      {
        label: 'Relatório dinâmico',
        icon: 'bar-chart-line',
        to: '/relatorios/demo_movimentos',
        perm: ['demo_movimentos', 'ver'],
      },
      { label: 'Orçamentos', icon: 'receipt', to: '/demo_orcamentos', perm: ['demo_orcamentos', 'ver'] },
      { label: 'Clientes', icon: 'people', to: '/demo_clientes', perm: ['demo_clientes', 'ver'] },
      { label: 'Categorias', icon: 'tags', to: '/demo_categorias', perm: ['demo_categorias', 'ver'] },
    ],
  },
];
