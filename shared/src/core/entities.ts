// =============================================================================
// Entidades do NÚCLEO do frame: existem em todo sistema (acesso e segurança).
// Não coloque entidades de negócio aqui: elas vão em shared/src/app/entities.ts.
// Regras que não cabem na definição ficam em server/src/hooks/.
// =============================================================================
import type { EntityDef } from '../types';

export const coreEntities: Record<string, EntityDef> = {
  usuarios: {
    label: 'Usuários',
    singular: 'Usuário',
    icon: 'person-gear',
    labelField: 'nome',
    fields: [
      { name: 'nome', label: 'Nome', type: 'text', required: true, list: true, search: true, maxLength: 120 },
      { name: 'email', label: 'E-mail', type: 'email', required: true, list: true, search: true },
      { name: 'perfil_id', label: 'Perfil', type: 'relation', entity: 'perfis', required: true, list: true },
      {
        name: 'senha',
        label: 'Senha',
        type: 'password',
        required: true,
        help: 'Mínimo de 8 caracteres, com letras e números.',
      },
      { name: 'ativo', label: 'Ativo', type: 'boolean', list: true, default: true },
      {
        name: 'trocar_senha',
        label: 'Exigir troca de senha no próximo acesso',
        type: 'boolean',
        default: true,
      },
      { name: 'ultimo_acesso', label: 'Último acesso', type: 'datetime', list: true, readonly: true },
      // preferência do próprio usuário (Meu perfil / menu do usuário); fora das telas de cadastro
      { name: 'aparencia', label: 'Aparência', type: 'select', options: ['sistema', 'claro', 'escuro'], hidden: true },
      {
        name: 'tamanho_texto',
        label: 'Tamanho do texto',
        type: 'select',
        options: ['pequeno', 'normal', 'grande'],
        hidden: true,
      },
    ],
  },

  perfis: {
    label: 'Perfis de acesso',
    singular: 'Perfil',
    icon: 'shield-lock',
    labelField: 'nome',
    fields: [
      { name: 'nome', label: 'Nome', type: 'text', required: true, list: true, search: true, maxLength: 60, col: 6 },
      { name: 'descricao', label: 'Descrição', type: 'text', list: true, maxLength: 200, col: 6 },
      {
        name: 'admin',
        label: 'Acesso total (administrador)',
        type: 'boolean',
        list: true,
        default: false,
        col: 12,
        help: 'Administradores podem tudo, inclusive gerenciar perfis e usuários administradores.',
      },
      { name: 'permissoes', label: 'Permissões', type: 'permissions', col: 12, disabledWhen: 'admin' },
    ],
  },
};
