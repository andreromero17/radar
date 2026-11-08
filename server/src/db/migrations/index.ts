// Registro das migrações, em ordem de aplicação.
// `npm run db:diff -- descricao` cria o arquivo novo e o registra aqui sozinho.
// Migração já aplicada não se edita: crie uma nova.
import type { Migration } from '../migrator';
import * as m20261107000000 from './20261107000000_inicial';
// @diff:imports

export const migrations: Migration[] = [
  m20261107000000,
  // @diff:list
];
