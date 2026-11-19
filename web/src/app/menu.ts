// Menu do Radar (entre "Dashboard" e "Administração")
import type { MenuItem } from '../config/menu';

export const appMenu: MenuItem[] = [
  { label: 'Sinais', icon: 'lightning-charge', to: '/sinais', perm: ['sinais', 'ver'], tab: true },
  { label: 'Empresas', icon: 'building', to: '/empresas', perm: ['empresas', 'ver'], tab: true },
  { label: 'Pessoas', icon: 'people', to: '/pessoas', perm: ['pessoas', 'ver'], tab: true },
  { label: 'Publicações', icon: 'file-text', to: '/publicacoes', perm: ['publicacoes', 'ver'] },
  {
    label: 'Coleta',
    icon: 'cloud-download',
    children: [
      {
        label: 'Alertas de cadastro',
        icon: 'exclamation-triangle',
        to: '/alertas_cadastro',
        perm: ['alertas_cadastro', 'ver'],
      },
      { label: 'Execuções', icon: 'clock-history', to: '/coletas', perm: ['coletas', 'ver'] },
    ],
  },
];
