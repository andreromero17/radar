// Regras de negócio por entidade (o que não dá para declarar em entities.ts).
// Aqui ficam as do núcleo; as da aplicação vão em server/src/app/hooks.ts.
import { appHooks } from '../app/hooks';
import { perfisHooks } from './perfis';
import { usuariosHooks } from './usuarios';
import type { EntityHooks } from './types';

export type { EntityHooks, ExtraRow, HookContext } from './types';

export const hooks: Record<string, EntityHooks> = {
  ...appHooks,
  usuarios: usuariosHooks,
  perfis: perfisHooks,
};
