// Migrações do NÚCLEO do frame, em ordem de aplicação (escritas à mão).
// As da aplicação ficam em src/app/migrations (geradas pelo `npm run db:diff`).
// Migração já aplicada não se edita: crie uma nova.
import type { Migration } from '../migrator';
import * as m20261108000000 from './20261108000000_nucleo';
import * as m20261109000000 from './20261109000000_anexos';
import * as m20261110000000 from './20261110000000_aparencia';
import * as m20261111000000 from './20261111000000_tamanho_texto';

export const migrations: Migration[] = [m20261108000000, m20261109000000, m20261110000000, m20261111000000];
