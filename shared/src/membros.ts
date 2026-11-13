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

// ---------------------------------------------------------------- Fase 5C: suporte e plataforma

/** Liberação do acesso de suporte dada pelo dono */
export interface LiberacaoSuporte {
  id: number;
  papel: Papel;
  liberado_por: string | null;
  liberado_em: string;
  expira_em: string;
}

/** GET /api/suporte */
export interface SuporteResposta {
  liberacao: LiberacaoSuporte | null;
  historico: { acao: string; detalhe: string; usuario: string; criado_em: string }[];
}

export interface EspacoPlataforma {
  id: number;
  nome: string;
  tipo: string;
  ativo: boolean;
  criado_em: string;
  dono: string | null;
  dono_email: string | null;
  membros: number;
  convites: number;
  /** Bytes do banco do espaço */
  tamanho: number;
  ultimo_acesso: string | null;
  suporte: LiberacaoSuporte | null;
}

export interface UsuarioPlataforma {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  admin: boolean;
  ativo: boolean;
  dois_fatores: boolean;
  ultimo_acesso: string | null;
  criado_em: string;
  espacos: number;
}

/** GET /api/plataforma (só metadados) */
export interface PlataformaResposta {
  totais: {
    usuarios: number;
    espacos: number;
    membros: number;
    sessoes: number;
    tamanho: number;
    sem_2fa_admin: number;
  };
  espacos: EspacoPlataforma[];
  usuarios: UsuarioPlataforma[];
}

// ---------------------------------------------------------------- Fase 5D: convites para testar e feedback

export interface ConvitePlataforma {
  id: number;
  email: string;
  criado_em: string;
  expira_em: string;
  usado_em: string | null;
  cancelado_em: string | null;
  convidado_por: string | null;
  usado_por: string | null;
}

export interface FeedbackInfo {
  id: number;
  usuario_id: number | null;
  nome: string | null;
  email: string | null;
  tipo: 'sugestao' | 'problema' | 'elogio';
  mensagem: string;
  pagina: string | null;
  navegador: string | null;
  versao: string | null;
  criado_em: string;
  lido_em: string | null;
}
