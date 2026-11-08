// Regras de negócio por entidade (o que não dá para declarar em entities.ts).
// Para uma entidade nova, crie hooks/<entidade>.ts e registre aqui.
import { perfisHooks } from './perfis';
import { usuariosHooks } from './usuarios';
import type { EntityHooks } from './types';

export type { EntityHooks, HookContext } from './types';

export const hooks: Record<string, EntityHooks> = {
  usuarios: usuariosHooks,
  perfis: perfisHooks,
};
