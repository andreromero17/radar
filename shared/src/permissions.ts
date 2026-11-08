// =============================================================================
// Permissões: perfil × recurso × ação.
// Recursos = entidades (CRUD) + áreas do sistema (logs, backup, configurações).
// A mesma função `can()` decide no servidor (bloqueia a rota) e no front
// (esconde menu e botões).
// =============================================================================
import { entities, isCoreEntity } from './entities';

export const ACTIONS = ['ver', 'criar', 'editar', 'excluir'] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  ver: 'Ver',
  criar: 'Criar',
  editar: 'Editar',
  excluir: 'Excluir',
};

/** { recurso: [ações permitidas] } */
export type Permissions = Record<string, Action[]>;

export interface ResourceDef {
  key: string;
  label: string;
  icon: string;
  group: string;
  /** Ações que fazem sentido para o recurso (colunas da matriz) */
  actions: readonly Action[];
}

/**
 * Áreas do sistema que não são entidades.
 * `perfis` só tem "ver" na matriz: criar/alterar/excluir perfis é exclusivo de
 * administradores, senão qualquer um com essa permissão poderia se autopromover.
 */
export const SYSTEM_RESOURCES: ResourceDef[] = [
  { key: 'logs', label: 'Logs', icon: 'journal-text', group: 'Sistema', actions: ['ver'] },
  { key: 'backup', label: 'Backup', icon: 'database', group: 'Sistema', actions: ['ver'] },
  { key: 'configuracoes', label: 'Configurações', icon: 'gear', group: 'Sistema', actions: ['editar'] },
];

/** Ações restritas a administradores, por recurso */
export const ADMIN_ONLY: Record<string, readonly Action[]> = {
  perfis: ['criar', 'editar', 'excluir'],
};

export function resources(): ResourceDef[] {
  const fromEntities = Object.entries(entities).map(([key, e]) => ({
    key,
    label: e.label,
    icon: e.icon,
    group: e.group ?? (isCoreEntity(key) ? 'Acesso' : 'Cadastros'),
    actions: ACTIONS.filter((a) => !ADMIN_ONLY[key]?.includes(a)),
  }));
  return [...fromEntities, ...SYSTEM_RESOURCES];
}

/** Usuário autenticado, como a API devolve em /api/auth/me */
export interface AuthUser {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  /** Perfil com acesso total */
  admin: boolean;
  permissoes: Permissions;
  /** Precisa trocar a senha antes de usar o sistema */
  trocar_senha: boolean;
}

export function can(
  user: Pick<AuthUser, 'admin' | 'permissoes'> | null | undefined,
  resource: string,
  action: Action,
): boolean {
  if (!user) return false;
  if (user.admin) return true;
  if (ADMIN_ONLY[resource]?.includes(action)) return false;
  return user.permissoes[resource]?.includes(action) ?? false;
}

/** Remove recursos/ações inexistentes e ordena (normaliza o que vai para o banco) */
export function normalizePermissions(input: Permissions): Permissions {
  const out: Permissions = {};
  for (const r of resources()) {
    const acts = (input[r.key] ?? []).filter((a) => r.actions.includes(a));
    if (acts.length) out[r.key] = ACTIONS.filter((a) => acts.includes(a));
  }
  return out;
}
