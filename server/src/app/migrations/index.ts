// Migrações da APLICAÇÃO, em ordem de aplicação (as do núcleo ficam em src/db/migrations).
// `npm run db:diff -- descricao` cria o arquivo nesta pasta e o registra aqui sozinho.
// Migração já aplicada não se edita: crie uma nova.
import type { Migration } from '../../db/migrator';
import * as m20261119200457 from './20261119200457_entidades_do_radar';
// @diff:imports

export const appMigrations: Migration[] = [
  m20261119200457,
  // @diff:list
];
