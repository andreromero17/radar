// =============================================================================
// Configurações próprias do Radar (tela de Configurações, seção "Radar"). Valem por espaço (cliente).
// No servidor: getAppSetting(db, chave); no front: useAppSettings(). Tokens ficam no .env, nunca aqui.
// =============================================================================
import type { AppSettingDef } from '../types';

export const appSettings: AppSettingDef[] = [
  {
    chave: 'pipedrive_filtro_contas',
    label: 'Filtro do Pipedrive com as contas-alvo',
    type: 'number',
    default: 0,
    min: 0,
    help:
      'Número do filtro de organizações do Pipedrive (aparece no endereço quando o filtro está aberto). ' +
      'Zero = não sincroniza contas-alvo.',
  },
  {
    chave: 'pipedrive_filtro_concorrentes',
    label: 'Filtro do Pipedrive com os concorrentes',
    type: 'number',
    default: 0,
    min: 0,
    help: 'Zero = concorrentes cadastrados só no Radar.',
  },
  {
    chave: 'pipedrive_sincronizar_diario',
    label: 'Sincronizar com o Pipedrive todo dia (06:30)',
    type: 'boolean',
    default: true,
  },
  {
    chave: 'coleta_diaria',
    label: 'Coletar posts do LinkedIn todo dia (07:00)',
    type: 'boolean',
    default: true,
    help: 'Precisa do APIFY_TOKEN no .env do servidor.',
  },
  {
    chave: 'coleta_max_posts',
    label: 'Máximo de posts por empresa ou pessoa em cada coleta',
    type: 'number',
    default: 20,
    min: 1,
    max: 100,
    help: 'Custo aproximado no Apify: US$ 2 a cada 1.000 posts.',
  },
];
