// =============================================================================
// Itens de menu da APLICAÇÃO (entram entre "Dashboard" e "Administração").
// `perm` esconde o item de quem não tem a permissão [recurso, ação].
// Ícones: https://icons.getbootstrap.com (nome sem o prefixo "bi-")
//
// Exemplo:
//   { label: 'Contas', icon: 'bank', to: '/contas', perm: ['contas', 'ver'] },
//   { label: 'Cadastros', icon: 'folder2-open', children: [ ... ] },
// =============================================================================
import type { MenuItem } from '../config/menu';

export const appMenu: MenuItem[] = [];
