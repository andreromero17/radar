// =============================================================================
// Tipos compartilhados entre API (server) e interface (web).
// =============================================================================

export type FieldType =
  | 'text'
  | 'email'
  | 'textarea'
  | 'number'
  | 'money'
  | 'date'
  | 'datetime'
  | 'select'
  | 'boolean'
  | 'relation'
  /** CPF e/ou CNPJ com máscara e validação dos dígitos (veja `docType`) */
  | 'document'
  /** Telefone brasileiro com DDD: (51) 99999-0000 */
  | 'phone'
  /** Cor #RRGGBB com seletor */
  | 'color'
  /** Várias opções de `options`, gravadas como lista JSON */
  | 'multiselect'
  /** Número exibido como porcentagem (12,5 → 12,5%) */
  | 'percent'
  /** Senha: nunca sai da API; gravada como hash; em branco na edição = manter */
  | 'password'
  /** Matriz de permissões (recurso × ação), gravada como JSON */
  | 'permissions';

export interface FieldDef {
  /** Nome da coluna no banco (snake_case) */
  name: string;
  /** Rótulo exibido na interface */
  label: string;
  type: FieldType;
  /** Obrigatório no formulário e na API */
  required?: boolean;
  /** Aparece como coluna na listagem */
  list?: boolean;
  /** Entra na busca textual da listagem */
  search?: boolean;
  /** Largura no formulário, de 1 a 12 (grid do Bootstrap) */
  col?: number;
  /** Valor inicial ao criar um registro. Em data: 'hoje'; em data e hora: 'agora' (calculados na hora) */
  default?: string | number | boolean;
  /** Exibido mas não editável */
  readonly?: boolean;
  /** Gerado pelo servidor na criação. 'code' = código legível, ex.: PED20261108-4F2A9 */
  auto?: 'code';
  /** Prefixo do código gerado (auto: 'code') */
  prefix?: string;
  /** Opções de um campo `select` */
  options?: readonly string[];
  /** Cor do badge por opção (campos `select`) */
  colors?: Record<string, string>;
  /** Entidade de destino de um campo `relation` */
  entity?: string;
  /** Tamanho máximo para campos de texto */
  maxLength?: number;
  /** Texto de ajuda exibido abaixo do campo */
  help?: string;
  /** Desabilita o campo no formulário quando o campo booleano indicado estiver marcado */
  disabledWhen?: string;
  /** Agrupa o campo sob um título no formulário (seções na ordem em que aparecem) */
  section?: string;
  /** Limites para number, money e percent */
  min?: number;
  max?: number;
  /** money/number: valor negativo em vermelho e positivo em verde na listagem */
  signColors?: boolean;
  /** Mostra a soma da coluna no rodapé da listagem (considera todos os filtros, não só a página) */
  total?: 'sum';
  /** Aparece no painel de filtros da listagem (padrão: campos select, multiselect, boolean, relation e data) */
  filter?: boolean;
  /** document: só CPF, só CNPJ ou ambos (padrão) */
  docType?: 'cpf' | 'cnpj' | 'cpf_cnpj';
  /**
   * relation dependente de outro campo do formulário: as opções são filtradas pelo valor dele.
   * Ex.: categoria depende do tipo → { field: 'tipo' } busca categorias com tipo = valor escolhido.
   * `param` é o campo na entidade de destino (padrão: o mesmo nome de `field`).
   */
  dependsOn?: { field: string; param?: string };
  /**
   * Campo calculado a partir dos outros do mesmo registro (fica somente leitura).
   * A tela mostra o resultado enquanto o usuário digita e a API recalcula ao gravar.
   * Ex.: valor do item = quantidade × preço → `compute: (v) => Number(v.quantidade) * Number(v.preco)`
   */
  compute?: (values: Record<string, unknown>) => number | null;
}

/** Sub-tabela de um registro (master-detail): ex.: orçamento → itens, lançamento → parcelas */
export interface DetailDef {
  /** Entidade das linhas (com `detailOf` apontando para a entidade "pai") */
  entity: string;
  /** Campo da entidade das linhas que aponta para o "pai" (relation) */
  field: string;
  /** Título da sub-tabela no formulário (padrão: label da entidade) */
  label?: string;
  /** Mínimo de linhas exigido */
  min?: number;
  /** Somas gravadas no "pai": { campo_do_pai: campo_da_linha } (o campo do pai fica somente leitura) */
  sum?: Record<string, string>;
}

export interface EntityDef {
  /** Nome no plural (menu, título da lista) */
  label: string;
  /** Nome no singular (botões, mensagens) */
  singular: string;
  /** Ícone do Bootstrap Icons, sem o prefixo "bi-" */
  icon: string;
  /** Campo usado como "nome" do registro em relações, logs e confirmações */
  labelField: string;
  fields: FieldDef[];
  /** Exclusão vai para a lixeira (coluna `excluido_em`), de onde dá para restaurar */
  lixeira?: boolean;
  /** Campo de data usado no seletor de período da listagem (ex.: mês a mês) */
  periodField?: string;
  /** Ordenação padrão da listagem (padrão: id decrescente) */
  defaultSort?: { field: string; dir: 'asc' | 'desc' };
  /** Grupo na matriz de permissões (padrão: "Cadastros" ou "Acesso" para o núcleo) */
  group?: string;
  /** Sub-tabelas editadas e gravadas junto com o registro */
  details?: DetailDef[];
  /**
   * Esta entidade é sub-tabela de outra: não aparece no menu "+ Novo", no dashboard nem na matriz de
   * permissões; quem pode ver o "pai" vê as linhas, quem pode editar o "pai" altera as linhas.
   */
  detailOf?: string;
  /** Permite anexar arquivos a cada registro */
  anexos?: boolean;
  /** Importação de CSV/Excel (padrão: ligada, exceto no núcleo e em sub-tabelas) */
  importar?: boolean;
  /**
   * Campo booleano que diz se o registro está ativo (ex.: 'ativa'). Inativos somem dos selects de relação
   * dos outros cadastros — menos o valor que o registro já tem — mas continuam nos filtros e na listagem.
   */
  activeField?: string;
}

/** Registro genérico vindo da API */
export type Row = {
  id: number;
  criado_em?: string | null;
  atualizado_em?: string | null;
  [key: string]: unknown;
};

export interface ListResponse<T = Row> {
  rows: T[];
  total: number;
  /** Somas das colunas com `total: 'sum'` (sobre todos os registros filtrados) */
  totais?: Record<string, number>;
  page: number;
  pageSize: number;
}

export type FieldErrors = Record<string, string>;

export interface ApiErrorBody {
  error: string;
  errors?: FieldErrors;
  /** Código para o front reagir (ex.: TROCAR_SENHA) */
  code?: string;
}

/** Item de select de relação (GET /api/:entity/opcoes) */
export interface RelationOption {
  value: number;
  label: string;
}

/** Resumo genérico do dashboard: total por cadastro que o usuário pode ver */
export interface DashboardSummary {
  totais: { entidade: string; total: number }[];
}

/** Sessão aberta do usuário (página Meu perfil) */
export interface SessionInfo {
  id: string;
  atual: boolean;
  lembrar: boolean;
  criado_em: string;
  ultimo_uso: string;
  ip: string | null;
  user_agent: string | null;
}

/** Versão do sistema (GET /api/health) */
export interface VersionInfo {
  /** Versão do sistema (a do frame quando não há sistema próprio) */
  version: string;
  commit: string;
  /** Versão do frame (package.json da raiz) */
  frame?: string;
}

export interface LogRow {
  id: number;
  entidade: string | null;
  registro_id: number | null;
  acao: string;
  detalhe: string | null;
  usuario: string | null;
  usuario_id: number | null;
  ip: string | null;
  /** Diferença campo a campo: { campo: { de, para } } */
  alteracoes: Record<string, { de?: unknown; para?: unknown }> | null;
  criado_em: string;
}

export interface BackupInfo {
  arquivo: string;
  tamanho: number;
  modificado: string | null;
  tabelas: { tabela: string; registros: number }[];
}

/** Ação em lote (POST /api/:entity/lote) */
export interface BulkRequest {
  acao: 'excluir' | 'restaurar' | 'editar' | 'excluir_definitivo';
  ids: number[];
  /** Para 'editar': campos e valores a aplicar em todos */
  dados?: Record<string, unknown>;
}

export interface BulkResponse {
  ok: number;
  erros: { id: number; error: string }[];
}

/** Arquivo anexado a um registro */
export interface Anexo {
  id: number;
  nome: string;
  tipo: string;
  tamanho: number;
  usuario_nome?: string | null;
  criado_em: string;
}

/** Prévia da importação: como cada linha do arquivo vai virar registro */
export interface ImportPreview {
  /** Colunas encontradas no arquivo */
  colunas: string[];
  /** Campos que podem receber dados */
  campos: { name: string; label: string; required: boolean }[];
  /** coluna do arquivo → campo ('' = ignorar) */
  mapa: Record<string, string>;
  total: number;
  validas: number;
  invalidas: number;
  /** Primeiras linhas (até 200), com os erros de cada uma */
  linhas: { linha: number; valores: Record<string, string>; erros: Record<string, string> }[];
}

export interface ImportResult {
  importados: number;
  erros: { linha: number; error: string }[];
}
