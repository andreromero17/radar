// =============================================================================
// Configurações próprias do SISTEMA construído sobre o frame (aparecem na tela de
// Configurações, numa seção com o nome do sistema). Ex.:
//   { chave: 'regime', label: 'Despesas do cartão contam', type: 'select', default: 'fatura',
//     options: [{ value: 'compra', label: 'Na data da compra' }, { value: 'fatura', label: 'No mês da fatura' }] }
// No servidor: getAppSetting(db, 'regime'); no front: useAppSettings().
// =============================================================================
import type { AppSettingDef } from '../types';

export const appSettings: AppSettingDef[] = [];
