// =============================================================================
// Permissões: (papel no espaço × perfil) × recurso × ação.
// Recursos = entidades (CRUD) + áreas do sistema (logs, backup, configurações).
// A mesma função `can()` decide no servidor (bloqueia a rota) e no front
// (esconde menu e botões).
// =============================================================================
import { getEntity, isCoreEntity, mainEntities } from './entities';

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
  const fromEntities = mainEntities().map(([key, e]) => ({
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
  /** Perfil com acesso total (administrador da plataforma) */
  admin: boolean;
  /** Perfil com acesso a todos os dados dos espaços (sem poder na plataforma): o papel decide */
  completo?: boolean;
  permissoes: Permissions;
  /** Verificação em duas etapas ligada (Fase 5C) */
  dois_fatores?: boolean;
  /** Precisa configurar a verificação em duas etapas antes de usar o sistema (administrador, em produção) */
  exige_2fa?: boolean;
  /** Precisa trocar a senha antes de usar o sistema */
  trocar_senha: boolean;
  /** Modo claro/escuro escolhido pelo usuário ('sistema' = segue o aparelho) */
  aparencia: Aparencia;
  /** Tamanho do texto escolhido pelo usuário */
  tamanho_texto: TamanhoTexto;
  /** Espaço em uso nesta sessão (Fase 5A) */
  espaco?: EspacoDoUsuario;
  /** Espaços em que o usuário é membro */
  espacos?: EspacoDoUsuario[];
}

export const PAPEIS = ['dono', 'editor', 'leitor'] as const;
export type Papel = (typeof PAPEIS)[number];
export const PAPEL_LABELS: Record<Papel, string> = { dono: 'Dono', editor: 'Editor', leitor: 'Leitor' };
export const PAPEL_DESCRICOES: Record<Papel, string> = {
  dono: 'Pode tudo no espaço, inclusive convidar e gerenciar membros, configurações e backup',
  editor: 'Vê e altera os dados (conforme o perfil de acesso)',
  leitor: 'Só vê os dados',
};
export const TIPOS_ESPACO = ['pessoal', 'holding', 'empresa'] as const;
export const TIPO_ESPACO_LABELS: Record<string, string> = {
  pessoal: 'Pessoal',
  holding: 'Holding',
  empresa: 'Empresa',
};

/** Um espaço (as finanças de um assinante: pessoal, holding, empresa...) e o papel do usuário nele */
export interface EspacoDoUsuario {
  id: number;
  nome: string;
  tipo: string;
  papel: Papel;
  /** Sessão de SUPORTE (Fase 5C): o administrador está aqui pela liberação do dono, até esta data */
  suporte?: { ate: string };
}

/** Recursos da PLATAFORMA (valem fora dos espaços): só o perfil decide */
const DA_PLATAFORMA = new Set(['usuarios', 'perfis']);
/** Recursos do espaço que só o dono acessa (o banco inteiro, configurações do sistema) */
const SO_DO_DONO = new Set(['backup', 'configuracoes']);

export const APARENCIAS = ['sistema', 'claro', 'escuro'] as const;
export type Aparencia = (typeof APARENCIAS)[number];

/** Escala do texto (e de tudo o que é medido em rem): pequeno 93,75% · normal 100% · grande 112,5% */
export const TAMANHOS_TEXTO = ['pequeno', 'normal', 'grande'] as const;
export type TamanhoTexto = (typeof TAMANHOS_TEXTO)[number];

/**
 * Pode executar a ação no recurso?
 * - Recursos da plataforma (usuários, perfis) e uso fora de um espaço: só o perfil (administrador pode tudo).
 * - `membros`: todo membro vê; só o dono gerencia.
 * - Dentro do espaço: dono pode tudo; backup e configurações só o dono; leitor só vê; editor segue o perfil
 *   (administrador ou perfil "completo" = tudo).
 */
export function can(
  user: Pick<AuthUser, 'admin' | 'permissoes' | 'completo' | 'espaco'> | null | undefined,
  resource: string,
  action: Action,
): boolean {
  if (!user) return false;
  // sub-tabela segue o "pai": ver → ver; criar/editar/excluir linhas → editar o pai
  const pai = getEntity(resource)?.detailOf;
  if (pai) return can(user, pai, action === 'ver' ? 'ver' : 'editar');
  if (resource === 'plataforma') return !!user.admin; // painel da plataforma: só metadados, só administrador
  const papel = user.espaco?.papel;
  if (resource === 'membros') return papel != null && (action === 'ver' || papel === 'dono');
  const doPerfil = () => {
    if (user.admin) return true;
    if (ADMIN_ONLY[resource]?.includes(action)) return false;
    return user.permissoes[resource]?.includes(action) ?? false;
  };
  if (!papel || DA_PLATAFORMA.has(resource)) return doPerfil();
  if (papel === 'dono') return true;
  if (SO_DO_DONO.has(resource)) return false;
  if (papel === 'leitor' && action !== 'ver') return false;
  return !!user.completo || doPerfil();
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
