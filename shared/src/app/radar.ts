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
/** Tag de empresa (0.4.7, como as etiquetas do Pipedrive) */
export interface Tag {
  id: number;
  nome: string;
  cor: string;
  /** Empresas com a tag (fora da lixeira) */
  empresas?: number;
}
/** Cores sugeridas ao criar uma tag (a pessoa pode escolher outra) */
export const CORES_TAG = [
  '#e03e3e',
  '#d97706',
  '#ca8a04',
  '#2b8a5a',
  '#0d9488',
  '#1d4ed8',
  '#7c3aed',
  '#db2777',
  '#57534e',
  '#868e96',
];
/** Lê `empresas.tags` (JSON de ids) sem quebrar com valor ruim */
export function lerTags(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (typeof v !== 'string' || !v.trim()) return [];
  try {
    return lerTags(JSON.parse(v));
  } catch {
    return [];
  }
}

/** Pessoas sugeridas pelo Apollo (0.4.6) */
export const SITUACOES_SUGESTAO = ['Sugerida', 'Aprovada', 'Descartada'] as const;
export const AREAS_PESSOA = ['Executivo', 'TI', 'Marketing', 'Comercial', 'RH'] as const;
export type AreaPessoa = (typeof AREAS_PESSOA)[number];

/**
 * Área de um cargo (pessoas relevantes do Apollo): C-level/sócios = Executivo; diretoria e gerência só de TI,
 * Marketing, Comercial e RH. Fora disso, null (não é sugerida). A ordem importa: "Desenvolvimento de negócios" é
 * Comercial, não TI; "Product Marketing" é Marketing.
 */
export function areaDoCargo(cargo: string | null | undefined): AreaPessoa | null {
  const c = ` ${(cargo ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')} `;
  if (!c.trim()) return null;
  if (
    /\b(CHRO|CPO)\b/.test(c) ||
    /\b(rh|recursos humanos|human|people|pessoas|talent|talentos|recrutamento|cultura)\b/i.test(c)
  )
    return 'RH';
  if (/\bCMO\b/.test(c) || /\b(marketing|marca|brand|growth|comunicacao)\b/i.test(c)) return 'Marketing';
  if (
    /\b(CRO|CCO|CSO)\b/.test(c) ||
    /\b(comercial|vendas|sales|negocios|business development|revenue|receita|clientes|customer|parcerias|aliancas|alliances|key account)\b/i.test(
      c,
    )
  )
    return 'Comercial';
  if (
    /\b(CIO|CTO|CDO|CISO|CTIO)\b/.test(c) ||
    /\b(ti|it|tecnologia|technology|sistemas|systems|engenharia|engineering|software|infraestrutura|infrastructure|dados|data|digital|seguranca|security|arquitetura|desenvolvimento|development|produto|product|inovacao|innovation)\b/i.test(
      c,
    )
  )
    return 'TI';
  if (
    /\b(CEO|COO|CFO|CXO)\b/.test(c) ||
    /\b(fundador|fundadora|founder|co-founder|cofounder|socio|socia|presidente|president|owner|managing partner|diretor geral|diretora geral|general manager|country manager|managing director)\b/i.test(
      c,
    )
  )
    return 'Executivo';
  return null;
}

/** Tipos de sinal por universo: código usado pela classificação → rótulo das telas */
export const SINAIS_POR_UNIVERSO: Record<Universo, Record<string, string>> = {
  'Conta-alvo': {
    projeto_transformacao: 'Projeto / transformação',
    contratacao_tech: 'Contratação de tecnologia',
    novo_lider: 'Novo líder',
    iniciativa_ia: 'Iniciativa de IA',
    crescimento: 'Crescimento',
    regulacao: 'Regulação',
    contato_saiu: 'Saída de contato-chave',
  },
  Concorrente: {
    oferta_nova: 'Oferta nova',
    cliente_novo: 'Cliente novo ou case',
    executivo: 'Troca de executivo',
    contratacao: 'Contratação',
    parceria: 'Parceria, certificação ou prêmio',
    conteudo: 'Conteúdo e posicionamento',
    saida_pessoa: 'Saída de pessoa-chave',
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
  /** Ids das tags da empresa (0.4.7) */
  tags: number[];
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
  /** Vagas publicadas no LinkedIn nos últimos 30 dias (última busca semanal) */
  vagas: number | null;
  /** Colaboradores no LinkedIn (aba Pessoas da página, última medição semanal) */
  colaboradores: number | null;
  /** Variação de colaboradores no período (desde a medição do início dele ou a primeira que houver) */
  colaboradores_var: number | null;
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
  /** Todas as empresas "Nós" monitoradas (para o filtro), mesmo as que o filtro esconde */
  nos: { id: number; nome: string }[];
  periodo: { de: string; ate: string; dias: number };
  kpis: { movimentos: number; alta: number; posts: number; audiencia: number; mais_ativo: string | null };
  linhas: LinhaComparativo[];
  /** Assuntos mais abordados nos posts próprios dos concorrentes (todos juntos) */
  assuntos: { assunto: string; posts: number }[];
  /** Assuntos por concorrente (barras empilhadas) */
  assuntos_por_empresa: { assuntos: string[]; empresas: { id: number; nome: string; valores: number[] }[] };
  /** O que mais engaja: assunto × média de interações por post (mín. 2 posts), com exemplos */
  engaja: { assunto: string; posts: number; media: number; exemplos: PostExemplo[] }[];
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

export interface PostDetalhe extends PostExemplo {
  data: string | null;
  autor: string | null;
  proprio: boolean;
  curtidas: number | null;
  comentarios: number | null;
  compartilhamentos: number | null;
  assuntos: string[];
  sinal: { id: number; tipo: string; severidade: string } | null;
  /** Post de pessoa-chave (null = da página da empresa) */
  pessoa_id: number | null;
  /** Post da pessoa que a página da empresa repostou (0.4.9) */
  repost_empresa?: boolean;
}
export interface DetalheEmpresa {
  empresa: EmpresaResumo & {
    nome_completo: string;
    universo: string;
    seguidores: number | null;
    site: string | null;
    linkedin_url: string | null;
    dono: string | null;
    segmento: string | null;
    tier: string | null;
    uf: string | null;
    /** Dados do Apollo (0.4.6); null = ainda não enriquecida */
    apollo: {
      funcionarios: number | null;
      setor: string | null;
      faturamento: string | null;
      fundacao: number | null;
      local: string | null;
      investimento: string | null;
      tecnologias: string | null;
      descricao: string | null;
      enriquecido_em: string;
    } | null;
  };
  periodo: { de: string; ate: string; dias: number };
  kpis: {
    posts: number;
    posts_anterior: number;
    reposts: number;
    interacoes_post: number | null;
    engajamento: number | null;
    sinais: number;
    alta: number;
    seguidores_var: number | null;
    vagas: number | null;
    colaboradores: number | null;
    colaboradores_var: number | null;
    /** Data da medição usada como base da variação */
    colaboradores_desde: string | null;
  };
  seguidores: { data: string; seguidores: number }[];
  semanas: { inicio: string; n: number }[];
  assuntos: { assunto: string; posts: number; media: number }[];
  /** Assuntos dos posts próprios das pessoas-chave no período (0.4.9) */
  assuntos_pessoas: { assunto: string; posts: number; media: number }[];
  /** Reposts da página da empresa de posts das pessoas-chave dela, no período (0.4.9) */
  reposts_pessoas: PostDetalhe[];
  melhores: PostDetalhe[];
  vagas: { id: number; titulo: string; url: string | null; data: string | null; local: string | null }[];
  posts: PostDetalhe[];
  sinais: SinalResumo[];
  pessoas: {
    id: number;
    nome: string;
    cargo: string | null;
    prioridade: string | null;
    posts: number;
    ultimo: string | null;
  }[];
}

/** Página da pessoa-chave (0.4.9): estatísticas como as da empresa, sobre os posts do perfil */
export interface DetalhePessoa {
  pessoa: {
    id: number;
    nome: string;
    cargo: string | null;
    titulo_linkedin: string | null;
    linkedin_url: string | null;
    nivel: string | null;
    prioridade: string | null;
    monitorar: boolean;
    empresa: (EmpresaResumo & { universo: string }) | null;
  };
  periodo: { de: string; ate: string; dias: number };
  kpis: {
    posts: number;
    posts_anterior: number;
    reposts: number;
    interacoes_post: number | null;
    curtidas_post: number | null;
    sinais: number;
    alta: number;
    /** Posts dela que a página da empresa repostou (no período) */
    repostados_pela_empresa: number;
    /** Reposts dela de posts da página da empresa (no período) */
    reposts_da_empresa: number;
  };
  semanas: { inicio: string; n: number }[];
  assuntos: { assunto: string; posts: number; media: number }[];
  melhores: PostDetalhe[];
  posts: PostDetalhe[];
  sinais: SinalResumo[];
}
