// Registro das migrações, em ordem de aplicação.
// `npm run db:diff -- descricao` cria o arquivo novo e o registra aqui sozinho.
// Migração já aplicada não se edita: crie uma nova.
import type { Migration } from '../migrator';
import * as m20261108000000 from './20261108000000_nucleo';
import * as m20261109000000 from './20261109000000_anexos';
// @diff:imports

export const migrations: Migration[] = [
  m20261108000000,
  m20261109000000,
  // @diff:list
];
