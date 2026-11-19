// Regras de negócio das entidades do Radar (beforeSave, afterSave, beforeDelete).
import type { EntityHooks } from '../hooks/types';
import { empresasHooks, pessoasHooks } from './hooks/cadastros';

export const appHooks: Record<string, EntityHooks> = {
  empresas: empresasHooks,
  pessoas: pessoasHooks,
};
