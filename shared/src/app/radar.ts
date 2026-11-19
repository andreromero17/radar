// =============================================================================
// Constantes do Radar (usadas nas entidades, no servidor e nas telas).
// =============================================================================

export const UNIVERSOS = ['Conta-alvo', 'Concorrente'] as const;
export type Universo = (typeof UNIVERSOS)[number];

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
