// =============================================================================
// Definição das entidades do sistema.
// O frame é "dirigido por configuração": cada entidade descrita aqui ganha
// automaticamente tabela no SQLite, rotas CRUD na API e telas de lista/formulário
// no front. Para um novo sistema, basta editar/adicionar entidades aqui.
//
// Tipos de campo suportados: text, email, textarea, number, money, date,
// select (com options), boolean, relation (com entity -> outra entidade).
//
// Propriedades úteis:
//   required  -> obrigatório        list   -> aparece na listagem
//   search    -> entra na busca     col    -> largura no formulário (1-12)
//   default   -> valor inicial      colors -> cor do badge por opção (select)
//   readonly  -> não editável       auto   -> gerado pelo servidor
// =============================================================================

export const STATUS_CHAMADO = [
  'Aberto',
  'Em análise',
  'Em atendimento',
  'Aguardando cliente',
  'Resolvido',
  'Fechado',
];

export const entities = {
  clientes: {
    label: 'Clientes',
    singular: 'Cliente',
    icon: 'people',
    labelField: 'nome',
    fields: [
      { name: 'nome', label: 'Nome', type: 'text', required: true, list: true, search: true },
      { name: 'email', label: 'E-mail', type: 'email', list: true, search: true },
      { name: 'telefone', label: 'Telefone', type: 'text', list: true },
      { name: 'documento', label: 'CPF/CNPJ', type: 'text', search: true },
      { name: 'ativo', label: 'Ativo', type: 'boolean', list: true, default: true },
      { name: 'observacoes', label: 'Observações', type: 'textarea', col: 12 },
    ],
  },

  usuarios: {
    label: 'Usuários',
    singular: 'Usuário',
    icon: 'person-gear',
    labelField: 'nome',
    fields: [
      { name: 'nome', label: 'Nome', type: 'text', required: true, list: true, search: true },
      { name: 'email', label: 'E-mail', type: 'email', required: true, list: true, search: true },
      {
        name: 'perfil',
        label: 'Perfil',
        type: 'select',
        options: ['Administrador', 'Operador', 'Leitura'],
        default: 'Operador',
        list: true,
        colors: { Administrador: '#7048e8', Operador: '#2f6fed', Leitura: '#7a8290' },
      },
      { name: 'ativo', label: 'Ativo', type: 'boolean', list: true, default: true },
    ],
  },

  chamados: {
    label: 'Chamados',
    singular: 'Chamado',
    icon: 'ticket-perforated',
    labelField: 'assunto',
    fields: [
      { name: 'protocolo', label: 'Protocolo', type: 'text', list: true, search: true, readonly: true, auto: 'protocol' },
      { name: 'assunto', label: 'Assunto', type: 'text', required: true, list: true, search: true, col: 8 },
      {
        name: 'prioridade',
        label: 'Prioridade',
        type: 'select',
        options: ['Baixa', 'Média', 'Alta', 'Urgente'],
        default: 'Média',
        list: true,
        col: 4,
        colors: { Baixa: '#7a8290', Média: '#2f6fed', Alta: '#f08c2e', Urgente: '#e03e3e' },
      },
      { name: 'cliente_id', label: 'Cliente', type: 'relation', entity: 'clientes', required: true, list: true, col: 4 },
      { name: 'responsavel_id', label: 'Responsável', type: 'relation', entity: 'usuarios', col: 4 },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: STATUS_CHAMADO,
        default: 'Aberto',
        list: true,
        col: 4,
        colors: {
          Aberto: '#2f6fed',
          'Em análise': '#7048e8',
          'Em atendimento': '#38c3a0',
          'Aguardando cliente': '#f08c2e',
          Resolvido: '#2b8a5a',
          Fechado: '#7a8290',
        },
      },
      { name: 'descricao', label: 'Descrição', type: 'textarea', col: 12 },
    ],
  },
};
