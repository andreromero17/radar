// =============================================================================
// Assuntos dos posts (0.4.1): classificação por palavras-chave, sem custo e instantânea, aplicada a TODO post
// coletado. Um post pode ter até 3 assuntos; sem nenhum, "Outros". Quando a classificação com LLM chegar, ela
// passa a gravar o mesmo campo (`publicacoes.assuntos`) e esta função vira o plano B.
// =============================================================================

export const ASSUNTOS: { nome: string; termos: string[] }[] = [
  {
    nome: 'IA e agentes',
    termos: [
      'ia',
      'inteligencia artificial',
      'ia generativa',
      'genai',
      'gen ai',
      'llm',
      'agente',
      'agentes',
      'agentic',
      'machine learning',
      'chatgpt',
      'copilot',
      'openai',
      'ai',
      'artificial intelligence',
      'automacao inteligente',
    ],
  },
  {
    nome: 'Dados e analytics',
    termos: [
      'dados',
      'analytics',
      'databricks',
      'snowflake',
      'bi',
      'power bi',
      'big data',
      'engenharia de dados',
      'data lake',
      'lakehouse',
      'governanca de dados',
    ],
  },
  {
    nome: 'Cloud e infraestrutura',
    termos: [
      'cloud',
      'nuvem',
      'aws',
      'azure',
      'google cloud',
      'gcp',
      'kubernetes',
      'devops',
      'infraestrutura',
      'migracao para a nuvem',
      'finops',
      'sre',
    ],
  },
  {
    nome: 'Segurança',
    termos: [
      'seguranca da informacao',
      'ciberseguranca',
      'cybersecurity',
      'cyber',
      'lgpd',
      'privacidade',
      'ransomware',
      'soc',
      'iam',
    ],
  },
  {
    nome: 'ERP e plataformas',
    termos: [
      'sap',
      'totvs',
      'erp',
      'salesforce',
      'servicenow',
      'oracle',
      'dynamics',
      'outsystems',
      'low code',
      'low-code',
    ],
  },
  {
    nome: 'Parcerias',
    termos: ['parceria', 'parcerias', 'parceiro', 'parceiros', 'partner', 'partnership', 'alianca', 'joint venture'],
  },
  {
    nome: 'Cases e clientes',
    termos: [
      'case',
      'cases',
      'cliente',
      'clientes',
      'customer',
      'projeto entregue',
      'entregamos',
      'go-live',
      'go live',
      'implantacao',
      'resultado para',
    ],
  },
  {
    nome: 'Prêmios e certificações',
    termos: [
      'premio',
      'premiacao',
      'premiada',
      'premiado',
      'gptw',
      'great place to work',
      'certificacao',
      'certificada',
      'certificado',
      'reconhecimento',
      'ranking',
      'award',
      'selo',
    ],
  },
  {
    nome: 'Vagas e talentos',
    termos: [
      'vaga',
      'vagas',
      'contratando',
      'estamos contratando',
      'oportunidade',
      'oportunidades',
      'processo seletivo',
      'hiring',
      'junte-se',
      'venha fazer parte',
      'talentos',
      'estagio',
      'trainee',
    ],
  },
  {
    nome: 'Eventos e conteúdo',
    termos: [
      'evento',
      'eventos',
      'webinar',
      'palestra',
      'painel',
      'summit',
      'meetup',
      'live',
      'podcast',
      'workshop',
      'feira',
      'congresso',
      'artigo',
      'ebook',
      'e-book',
    ],
  },
  {
    nome: 'Cultura e pessoas',
    termos: [
      'cultura',
      'colaboradores',
      'nosso time',
      'nossa equipe',
      'diversidade',
      'inclusao',
      'bem-estar',
      'aniversario',
      'confraternizacao',
      'lideranca',
      'carreira',
      'endomarketing',
    ],
  },
  {
    nome: 'Lançamentos e ofertas',
    termos: [
      'lancamento',
      'lancamos',
      'lancou',
      'nova solucao',
      'novo produto',
      'nova plataforma',
      'apresentamos',
      'nova oferta',
      'novo servico',
      'squad',
      'squads',
      'outsourcing',
      'alocacao',
    ],
  },
  {
    nome: 'Expansão e negócios',
    termos: [
      'expansao',
      'novo escritorio',
      'inauguracao',
      'inauguramos',
      'aquisicao',
      'adquiriu',
      'investimento',
      'crescimento',
      'faturamento',
      'resultado do trimestre',
      'resultados',
      'ipo',
      'fusao',
    ],
  },
];
export const OUTROS_ASSUNTOS = 'Outros';
export const NOMES_ASSUNTOS = [...ASSUNTOS.map((a) => a.nome), OUTROS_ASSUNTOS];

const normalizar = (s: string) =>
  ` ${s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/#/g, ' ')
    .replace(/[^a-z0-9\- ]+/g, ' ')
    .replace(/\s+/g, ' ')} `;

/** Até 3 assuntos do texto, do mais citado para o menos; nenhum → ['Outros'] */
export function classificarAssuntos(texto: string | null | undefined, max = 3): string[] {
  const t = normalizar(texto ?? '');
  const pontos = ASSUNTOS.map((a) => ({
    nome: a.nome,
    n: a.termos.reduce((s, termo) => s + (t.split(` ${termo} `).length - 1), 0),
  }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  return pontos.length ? pontos.slice(0, max).map((x) => x.nome) : [OUTROS_ASSUNTOS];
}

/** Guardado como texto "A; B; C" em `publicacoes.assuntos` */
export const assuntosDoTexto = (s: string | null | undefined): string[] =>
  (s ?? '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);
