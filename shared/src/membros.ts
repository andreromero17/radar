// Membros, convites e espaços (Fase 5B): formatos trocados entre a API e o front
import type { Papel } from './permissions';

export interface MembroInfo {
  usuario_id: number;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  /** A conta (na plataforma) está ativa */
  conta_ativa: boolean;
  desde: string;
}

export interface ConviteInfo {
  id: number;
  email: string;
  papel: Papel;
  convidado_por: string | null;
  criado_em: string;
  expira_em: string;
  expirado: boolean;
}

/** GET /api/membros */
export interface MembrosResposta {
  espaco: { id: number; nome: string; tipo: string; criado_em: string };
  papel: Papel;
  membros: MembroInfo[];
  /** Pendentes (só para o dono) */
  convites: ConviteInfo[];
  pode_gerenciar: boolean;
  pode_criar_espaco: boolean;
}

/** GET /api/auth/convites/:token (público) */
export interface ConvitePublico {
  espaco: string;
  tipo: string;
  email: string;
  papel: Papel;
  convidado_por: string | null;
  expira_em: string;
  /** Já existe conta com esse e-mail (então é entrar, não cadastrar) */
  tem_conta: boolean;
  logado_como?: { nome: string; email: string } | null;
}
