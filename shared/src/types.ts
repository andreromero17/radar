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
  | 'permissions'
  /**
   * Imagem pequena (logo, foto, ícone) gravada no próprio registro como data URL. A tela reduz para no máximo
   * 256 px antes de enviar; não vai para exportação/importação e no log aparece só "(alterada)".
   */
  | 'image';

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
  /**
   * Coluna técnica: gravada e devolvida pela API, mas fora das telas (formulário, listagem, colunas, filtros,
   * exportação, importação) e não editável pela API — quem preenche são os hooks. Ex.: id de um grupo de parcelas.
   * Ainda dá para filtrar pela URL (?grupo=abc).
   */
  hidden?: boolean;
  /**
   * Campo sim/não alterado direto na listagem (liga/desliga na linha), com permissão de editar.
   * Uma função decide por registro (ex.: compra no cartão é sempre paga → `(row) => !row.cartao_id`).
   */
  inlineEdit?: boolean | ((row: Row) => boolean);
  /** Só preenchido na criação: some do formulário de edição e é ignorado nas atualizações (ex.: "parcelar em") */
  createOnly?: boolean;
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
  /**
   * Coluna "emprestada" de uma relação desta entidade, só para mostrar, ordenar e buscar na listagem: não é
   * gravada, não vai para o formulário nem para a importação. Ex.: { relacao: 'ativo_id', campo: 'codigo' }
   */
  deRelacao?: { relacao: string; campo: string };
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
  /** Singular feminino: "Nova categoria" em vez de "Novo categoria" */
  feminino?: boolean;
  /** Ícone do Bootstrap Icons, sem o prefixo "bi-" */
  icon: string;
  /** Campo usado como "nome" do registro em relações, logs e confirmações */
  labelField: string;
  /**
   * Na importação de OUTRA entidade que aponta para esta (relação), além do nome (`labelField`) aceita o valor
   * destes campos — use campos únicos, como um código (ex.: ['codigo'] → "PETR4" acha o ativo "Petrobras")
   */
  chavesImportacao?: string[];
  /**
   * Listagem agrupada por este campo (ex.: 'classe'): um título por grupo, com a quantidade, que abre e fecha (o que
   * ficou fechado é lembrado por usuário). Em `select`, os grupos seguem a ordem das opções; vazio = "Sem <rótulo>".
   */
  agrupar?: string;
  fields: FieldDef[];
  /** Exclusão vai para a lixeira (coluna `excluido_em`), de onde dá para restaurar */
  lixeira?: boolean;
  /** Campo de data usado no seletor de período da listagem (ex.: mês a mês) */
  periodField?: string;
  /** Opções de "registros por página" da listagem (padrão: 10, 25, 50, 100) */
  pageSizes?: number[];
  /** Registros por página ao abrir a listagem (padrão: a primeira opção de pageSizes) */
  pageSize?: number;
  /** Ordenação padrão da listagem (padrão: id decrescente) */
  defaultSort?: { field: string; dir: 'asc' | 'desc' };
  /** Ordem das colunas da listagem (os campos citados vêm primeiro, nessa ordem; o resto na ordem dos campos). O
   * formulário segue a ordem de `fields`. */
  listOrder?: string[];
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

/**
 * Linha "de fora" que a aplicação mostra junto na listagem (hook `listExtras`): outra entidade, só para
 * consulta — sem seleção nem edição na linha; o clique abre `link`. Não entra nos totais.
 */
export interface ExtraInfo {
  /** Selo mostrado na linha (ex.: "Transferência") */
  rotulo: string;
  /** Para onde o clique leva (ex.: "/transferencias/3") */
  link?: string;
  /** Ícone do Bootstrap Icons, sem o prefixo "bi-" */
  icon?: string;
  /** Coluna onde o selo aparece (padrão: o labelField); vazia na linha extra = só o selo */
  campo?: string;
  /**
   * Linha separadora (ex.: "Saldo do final do dia"): ocupa a largura toda, centralizada, com `rotulo` e o
   * `destaque` em negrito; sem colunas, seleção nem clique (a não ser que tenha `link`)
   */
  separador?: boolean;
  destaque?: string;
}

export interface ListResponse<T = Row> {
  rows: T[];
  /** Linhas na listagem (para a paginação), incluindo as extras */
  total: number;
  /** Quantas das `total` são linhas extras (`row.__extra`) */
  extras?: number;
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
/** Identidade do sistema derivado (shared/src/app/info.ts) */
export interface AppInfo {
  /** Nome do sistema: padrão do nome nas Configurações e no tooltip da versão */
  nome?: string;
  /** Versão do sistema (a do frame fica no package.json da raiz) */
  versao?: string;
  /** Ícone padrão (Bootstrap Icons, sem "bi-") nas Configurações */
  icone?: string;
}

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

/** Configuração própria do sistema derivado (shared/src/app/settings.ts) */
export interface AppSettingDef {
  /** Nome interno (gravado como `app.<chave>` na tabela configuracoes) */
  chave: string;
  label: string;
  type: 'select' | 'boolean' | 'number' | 'text';
  default: string | number | boolean;
  /** Opções do select */
  options?: { value: string; label: string }[];
  /** Texto de ajuda abaixo do campo */
  help?: string;
  min?: number;
  max?: number;
}

export type AppSettings = Record<string, string | number | boolean>;
