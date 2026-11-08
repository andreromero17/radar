// =============================================================================
// Entidades de EXEMPLO usadas só nos testes do motor genérico (CRUD, relações,
// selects, códigos automáticos, permissões). Não fazem parte do frame.
// Compartilhadas pelos testes de shared, server e web.
// =============================================================================
import { getEntity, registerEntities, type EntityDef } from '../src';

export const STATUS = ['Aberto', 'Em análise', 'Em atendimento', 'Aguardando cliente', 'Resolvido', 'Fechado'];

export const fixtureEntities: Record<string, EntityDef> = {
  clientes: {
    label: 'Clientes',
    singular: 'Cliente',
    icon: 'people',
    labelField: 'nome',
    fields: [
      { name: 'nome', label: 'Nome', type: 'text', required: true, list: true, search: true, maxLength: 120 },
      { name: 'email', label: 'E-mail', type: 'email', list: true, search: true },
      { name: 'telefone', label: 'Telefone', type: 'text', list: true },
      { name: 'documento', label: 'CPF/CNPJ', type: 'text', search: true },
      { name: 'limite', label: 'Limite', type: 'money' },
      { name: 'ativo', label: 'Ativo', type: 'boolean', list: true, default: true },
      { name: 'observacoes', label: 'Observações', type: 'textarea', col: 12 },
    ],
  },
  chamados: {
    label: 'Chamados',
    singular: 'Chamado',
    icon: 'ticket-perforated',
    labelField: 'assunto',
    fields: [
      {
        name: 'protocolo',
        label: 'Protocolo',
        type: 'text',
        list: true,
        search: true,
        readonly: true,
        auto: 'code',
        prefix: 'CH',
      },
      { name: 'assunto', label: 'Assunto', type: 'text', required: true, list: true, search: true, maxLength: 150 },
      {
        name: 'prioridade',
        label: 'Prioridade',
        type: 'select',
        options: ['Baixa', 'Média', 'Alta', 'Urgente'],
        default: 'Média',
        list: true,
      },
      { name: 'cliente_id', label: 'Cliente', type: 'relation', entity: 'clientes', required: true, list: true },
      { name: 'responsavel_id', label: 'Responsável', type: 'relation', entity: 'usuarios' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS, default: 'Aberto', list: true },
      { name: 'descricao', label: 'Descrição', type: 'textarea', col: 12 },
    ],
  },
};

/** Registra as entidades de exemplo (idempotente) */
export function registerFixtureEntities() {
  if (!getEntity('clientes')) registerEntities(fixtureEntities);
}
