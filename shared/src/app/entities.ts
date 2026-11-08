// =============================================================================
// Entidades da APLICAÇÃO: o negócio do sistema construído sobre o frame.
// O frame vem vazio; cada sistema descreve aqui os seus cadastros.
//
// Cada entidade ganha automaticamente: rotas CRUD na API (/api/<chave>),
// validação (form e API), listagem/formulário, linha na matriz de permissões
// e log de alterações. Depois de editar:
//   npm run db:diff -- descricao   (gera a migração)
//   npm run db:migrate             (aplica)
// e inclua o item em web/src/app/menu.ts.
//
// Tipos de campo: text, email, textarea, number, money, date, datetime,
// select (options), boolean, relation (entity), password, permissions.
// Propriedades: required, list, search, col (1-12), default, readonly,
// maxLength, help, colors (select), disabledWhen, auto: 'code' + prefix.
//
// Exemplo:
//   contas: {
//     label: 'Contas', singular: 'Conta', icon: 'bank', labelField: 'nome',
//     fields: [
//       { name: 'nome', label: 'Nome', type: 'text', required: true, list: true, search: true },
//       { name: 'tipo', label: 'Tipo', type: 'select', options: ['Corrente', 'Poupança'], list: true },
//       { name: 'saldo_inicial', label: 'Saldo inicial', type: 'money', list: true },
//     ],
//   },
// =============================================================================
import type { EntityDef } from '../types';

export const appEntities: Record<string, EntityDef> = {};
