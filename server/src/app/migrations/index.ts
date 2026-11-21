// Migrações da APLICAÇÃO, em ordem de aplicação (as do núcleo ficam em src/db/migrations).
// `npm run db:diff -- descricao` cria o arquivo nesta pasta e o registra aqui sozinho.
// Migração já aplicada não se edita: crie uma nova.
import type { Migration } from '../../db/migrator';
import * as m20261119200457 from './20261119200457_entidades_do_radar';
import * as m20261119210141 from './20261119210141_lixeira_empresas_pessoas';
import * as m20261119220717 from './20261119220717_run_apify_nas_coletas';
import * as m20261120111113 from './20261120111113_metricas_e_universo_nos';
import * as m20261120132936 from './20261120132936_assuntos_das_publicacoes';
import * as m20261120153021 from './20261120153021_vagas_nas_metricas';
import * as m20261120180824 from './20261120180824_universo_das_publicacoes';
import * as m20261120193519 from './20261120193519_historico_de_posts';
import * as m20261120200840 from './20261120200840_apollo';
import * as m20261121070206 from './20261121070206_tags';
// @diff:imports

export const appMigrations: Migration[] = [
  m20261119200457,
  m20261119210141,
  m20261119220717,
  m20261120111113,
  m20261120132936,
  m20261120153021,
  m20261120180824,
  m20261120193519,
  m20261120200840,
  m20261121070206,
  // @diff:list
];
