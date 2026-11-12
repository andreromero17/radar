// =============================================================================
// Painéis e relatórios configuráveis (Fase 4).
//
// FONTE DE DADOS: função com nome que o sistema registra no servidor
// (`registerDados`) e que devolve um dos formatos abaixo. O frame cuida da rota
// (`GET /api/dados/:nome?de=&ate=&...`), da permissão e do período.
//
// WIDGET: o que o web desenha a partir de uma fonte (card, gráfico, ranking,
// tabela) ou um componente próprio do sistema. Ver `web/src/lib/paineis.ts`.
//
// CONJUNTO: movimentos "planos" (data, valor e dimensões) que o sistema entrega
// (`registerConjunto`); o frame monta a tabela dinâmica (linhas × meses), o
// comparativo e os gráficos em `/relatorios/:conjunto`.
// =============================================================================

export type FormatoValor = 'moeda' | 'numero' | 'percentual';

/** Vários números de uma vez (ex.: receitas, despesas e balanço do mesmo cálculo) */
export interface DadosValores {
  tipo: 'valores';
  valores: Record<string, number>;
  formato?: FormatoValor;
  /** Complemento do rótulo por valor (ex.: "previsto 31/12/2026") */
  notas?: Record<string, string>;
}

/** Séries para gráfico de barras/linhas: um rótulo por ponto, uma lista de valores por série */
export interface DadosSerie {
  tipo: 'serie';
  rotulos: string[];
  series: { nome: string; valores: number[]; cor?: string | null; tipo?: 'barra' | 'linha' }[];
  formato?: FormatoValor;
}

export interface ItemRanking {
  rotulo: string;
  valor: number;
  cor?: string | null;
  link?: string | null;
  detalhe?: string | null;
}

/** Lista ordenada com barra proporcional (ex.: despesas por categoria) */
export interface DadosRanking {
  tipo: 'ranking';
  itens: ItemRanking[];
  formato?: FormatoValor;
}

export interface ColunaTabela {
  id: string;
  rotulo: string;
  formato?: FormatoValor | 'data' | 'texto';
  /** Valor negativo em vermelho, positivo em verde */
  sinal?: boolean;
}

export interface DadosTabela {
  tipo: 'tabela';
  colunas: ColunaTabela[];
  /** `__link` numa linha torna a linha clicável */
  linhas: (Record<string, unknown> & { __link?: string | null })[];
}

/** Várias partes do mesmo cálculo; cada widget escolhe a sua com `parte` */
export interface DadosPartes {
  tipo: 'partes';
  partes: Record<string, DadosFonte>;
}

export type DadosFonte = DadosValores | DadosSerie | DadosRanking | DadosTabela | DadosPartes;

// ---------------------------------------------------------------- conjuntos (relatório dinâmico)

export interface DimensaoConjunto {
  id: string;
  rotulo: string;
  /** Pode ser escolhida para as linhas do relatório (padrão: sim) */
  agrupavel?: boolean;
  /** Aparece como filtro (padrão: sim) */
  filtravel?: boolean;
}

/** Como o conjunto aparece para o web (sem a função que carrega) */
export interface ConjuntoInfo {
  nome: string;
  rotulo: string;
  descricao?: string;
  icone?: string;
  medida: { rotulo: string; formato: FormatoValor };
  dimensoes: DimensaoConjunto[];
  /** Dimensão das linhas quando o usuário não escolhe */
  linhasPadrao: string;
  /** Filtros aplicados quando o usuário não escolhe (ex.: { tipo: ['Despesa'] }) */
  filtrosPadrao?: Record<string, string[]>;
}

export interface LinhaPivo {
  id: string;
  rotulo: string;
  cor: string | null;
  /** Um valor por mês de `meses` */
  valores: number[];
  total: number;
  /** total ÷ meses */
  media: number;
  /** Detalhamento: URL com {de} e {ate} para trocar pelo mês (ou período) clicado; null = sem detalhe */
  link: string | null;
}

export interface Pivo {
  conjunto: string;
  de: string;
  ate: string;
  /** 'AAAA-MM' */
  meses: string[];
  linhas: LinhaPivo[];
  total: Omit<LinhaPivo, 'id' | 'rotulo' | 'cor' | 'link'>;
  dimensao: string;
  filtros: Record<string, string[]>;
  /** Opções de cada dimensão filtrável que aparecem no período (para os filtros da tela) */
  opcoes: Record<string, { id: string; rotulo: string }[]>;
  /** Para colorir variações: subir é ruim (despesas) ou bom (receitas); null = neutro */
  sentido: 'menor-melhor' | 'maior-melhor' | null;
}
