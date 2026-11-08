// Regras de negócio das entidades da APLICAÇÃO (beforeSave, afterSave, beforeDelete).
// Crie um arquivo por entidade (ex.: app/hooks/lancamentos.ts) e registre aqui.
// Veja os exemplos do núcleo em server/src/hooks/usuarios.ts e perfis.ts.
import type { EntityHooks } from '../hooks/types';

export const appHooks: Record<string, EntityHooks> = {};
