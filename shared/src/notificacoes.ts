// =============================================================================
// Notificações (Fase 4C). O sistema registra TIPOS DE ALERTA no servidor
// (`registerAlerta`): uma função que diz o que merece aviso agora, cada aviso com
// uma CHAVE única (ex.: 'fatura:3:2026-11:vence'). O frame grava uma notificação
// por usuário e por chave — o mesmo aviso nunca se repete — na manutenção diária
// e quando o usuário abre o sino. Cada usuário desliga os tipos que não quer e
// pode receber os novos avisos por e-mail.
// =============================================================================

export type NivelNotificacao = 'info' | 'sucesso' | 'aviso' | 'perigo';

export interface Notificacao {
  id: number;
  tipo: string;
  nivel: NivelNotificacao;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  icone: string | null;
  criada_em: string;
  lida_em: string | null;
}

export interface NotificacoesResposta {
  itens: Notificacao[];
  nao_lidas: number;
}

/** Um tipo de alerta que o usuário pode ligar/desligar */
export interface TipoAlertaInfo {
  tipo: string;
  rotulo: string;
  descricao: string;
  icone: string | null;
}

export interface PrefNotificacoes {
  /** Tipos que o usuário não quer receber */
  desligados: string[];
  /** Receber os avisos novos também por e-mail (um resumo por verificação) */
  email: boolean;
}

export interface PreferenciasNotificacoesResposta {
  tipos: TipoAlertaInfo[];
  pref: PrefNotificacoes;
  /** SMTP configurado no servidor (sem ele, o e-mail só vai para o log) */
  email_disponivel: boolean;
}
