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
  /** Valor inicial ao criar um registro */
  default?: string | number | boolean;
  /** Exibido mas não editável */
  readonly?: boolean;
  /** Gerado pelo servidor na criação */
  auto?: 'protocol';
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
  page: number;
  pageSize: number;
}

export type FieldErrors = Record<string, string>;

export interface ApiErrorBody {
  error: string;
  errors?: FieldErrors;
}

export interface DashboardData {
  cards: Record<
    | 'abertos'
    | 'urgentes'
    | 'aguardando'
    | 'emAtendimento'
    | 'concluidos'
    | 'semResponsavel'
    | 'clientesAtivos'
    | 'noMes',
    number
  >;
  porStatus: { status: string; total: number }[];
  ultimos: { id: number; protocolo: string; assunto: string; status: string; cliente: string | null }[];
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
