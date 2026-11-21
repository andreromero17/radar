// Regras de negócio das entidades do Radar (beforeSave, afterSave, beforeDelete).
import type { EntityHooks } from '../hooks/types';
import { empresasHooks, pessoasHooks } from './hooks/cadastros';
import { tagsHooks } from './services/tags';

export const appHooks: Record<string, EntityHooks> = {
  empresas: empresasHooks,
  pessoas: pessoasHooks,
  tags: tagsHooks,
};
