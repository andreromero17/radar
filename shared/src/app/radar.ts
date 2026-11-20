// =============================================================================
// Constantes do Radar (usadas nas entidades, no servidor e nas telas).
// =============================================================================

export const UNIVERSOS = ['Conta-alvo', 'Concorrente'] as const;
export type Universo = (typeof UNIVERSOS)[number];
/** Empresas também podem ser "Nós" (a própria empresa do cliente): linha de referência no comparativo */
export const UNIVERSOS_EMPRESA = [...UNIVERSOS, 'Nós'] as const;

export const SEVERIDADES = ['Alta', 'Média', 'Baixa'] as const;
export const PRIORIDADES = SEVERIDADES;
export const NIVEIS = ['C-level', 'Diretoria', 'Gerência', 'Coordenação', 'Outro'] as const;
export const TIPOS_PUBLICACAO = ['Post', 'Vaga'] as const;
export const TRIAGENS = ['Pendente', 'Relevante', 'Descartada'] as const;
export const SITUACOES_SINAL = ['Novo', 'Tratado', 'Descartado'] as const;
export const AVALIACOES = ['Útil', 'Irrelevante', 'Classificação errada'] as const;
export const TIPOS_ALERTA = [
  'Troca de cargo',
  'Troca de empresa',
  'Cadastro duplicado',
  'Sem atividade',
  'Link quebrado',
] as const;
export const SITUACOES_ALERTA = ['Aberto', 'Resolvido', 'Ignorado'] as const;
export const SITUACOES_COLETA = ['Rodando', 'Ok', 'Erro'] as const;

/** Tipos de sinal por universo: código usado pela classificação → rótulo das telas */
export const SINAIS_POR_UNIVERSO: Record<Universo, Record<string, string>> = {
  'Conta-alvo': {
    projeto_transformacao: 'Projeto / transformação',
    contratacao_tech: 'Contratação de tecnologia',
    novo_lider: 'Novo líder',
    iniciativa_ia: 'Iniciativa de IA',
    crescimento: 'Crescimento',
    regulacao: 'Regulação',
  },
  Concorrente: {
    oferta_nova: 'Oferta nova',
    cliente_novo: 'Cliente novo ou case',
    executivo: 'Troca de executivo',
    contratacao: 'Contratação',
    parceria: 'Parceria, certificação ou prêmio',
    conteudo: 'Conteúdo e posicionamento',
  },
};
export const TIPOS_SINAL = [
  ...Object.values(SINAIS_POR_UNIVERSO['Conta-alvo']),
  ...Object.values(SINAIS_POR_UNIVERSO.Concorrente),
] as const;

/** Rótulo do tipo de sinal a partir do código da classificação (ou o próprio texto, se já for rótulo) */
export function rotuloSinal(codigo: string): string {
  for (const tipos of Object.values(SINAIS_POR_UNIVERSO)) if (tipos[codigo]) return tipos[codigo];
  return codigo;
}

/**
 * URL do LinkedIn normalizada para comparar e evitar duplicidade: https, www, sem querystring, sem barra final,
 * caminho decodificado e em minúsculas. Devolve null para texto vazio ou que não é do LinkedIn.
 */
export function normalizarLinkedin(url: string | null | undefined): string | null {
  if (!url) return null;
  const s =
    String(url)
      .trim()
      .split(/[\s,]+/)[0] ?? '';
  const m = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com(\/[^?#]*)?/i.exec(s);
  if (!m) return null;
  let caminho = m[1] ?? '';
  try {
    caminho = decodeURIComponent(caminho);
  } catch {
    /* mantém como veio */
  }
  caminho = caminho.toLowerCase().replace(/\/+$/, '');
  return `https://www.linkedin.com${caminho}`;
}

/**
 * Score Radar de uma conta (0 a 100): quanto ela está "em movimento" no período.
 * Sinais pesam pela severidade; pessoas-chave que publicaram somam um pouco.
 */
export function scoreRadar(s: { alta: number; media: number; baixa: number; pessoasAtivas: number }): number {
  return Math.min(100, Math.round(s.alta * 25 + s.media * 10 + s.baixa * 3 + s.pessoasAtivas * 5));
}

// ---------------------------------------------------------------- Visão geral (API /api/radar/visao)
export interface EmpresaResumo {
  id: number;
  nome: string;
  logo: string | null;
}
export interface LinhaComparativo extends EmpresaResumo {
  nos: boolean;
  seguidores: number | null;
  /** Variação de seguidores desde a medição de 7 ou mais dias atrás */
  seguidores_var: number | null;
  posts: number;
  posts_anterior: number;
  reposts: number;
  curtidas_post: number | null;
  comentarios_post: number | null;
  compartilhamentos_post: number | null;
  /** Interações por post ÷ seguidores, em % */
  engajamento: number | null;
  movimentos: number;
  alta: number;
  ultimo_post: string | null;
}
export interface PostExemplo {
  id: number;
  titulo: string;
  url: string | null;
  empresa: string;
  interacoes: number;
}
export interface VisaoConcorrentes {
  periodo: { de: string; ate: string; dias: number };
  kpis: { movimentos: number; alta: number; posts: number; audiencia: number; mais_ativo: string | null };
  linhas: LinhaComparativo[];
  /** Tipos de movimento por concorrente (barras empilhadas) */
  tipos: { tipos: string[]; empresas: { nome: string; valores: number[] }[] };
  /** O que mais engaja: tipo de movimento × média de interações por post, com exemplos */
  engaja: { tipo: string; posts: number; media: number; exemplos: PostExemplo[] }[];
  semanas: { inicio: string; n: number }[];
}
export interface SinalResumo {
  id: number;
  data: string | null;
  severidade: string;
  tipo: string;
  titulo: string;
  gancho: string | null;
  empresa: EmpresaResumo | null;
  pessoa: string | null;
}
export interface VisaoContas {
  periodo: { de: string; ate: string; dias: number };
  kpis: {
    sinais: number;
    alta: number;
    contas_com_sinal: number;
    contas: number;
    pessoas: number;
    pessoas_ativas: number;
  };
  agir: SinalResumo[];
  semanas: { inicio: string; n: number }[];
  destaque: (EmpresaResumo & { dono: string | null; sinais: number; alta: number; score: number })[];
  tipos: { tipo: string; n: number }[];
}
