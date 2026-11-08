// =============================================================================
// Registro de entidades = aplicação (app/entities.ts) + núcleo (core/entities.ts).
// Todo o resto do frame (API, telas, permissões, migrações) lê daqui.
// =============================================================================
import { appEntities } from './app/entities';
import { coreEntities } from './core/entities';
import type { EntityDef } from './types';

export const entities: Record<string, EntityDef> = { ...appEntities, ...coreEntities };

/** Entidades que pertencem ao núcleo do frame */
export const isCoreEntity = (name: string) => Object.hasOwn(coreEntities, name);

/**
 * Registra entidades em tempo de execução (ex.: entidades de exemplo nos testes,
 * módulos carregados dinamicamente). Não substitui uma entidade já existente.
 */
export function registerEntities(defs: Record<string, EntityDef>) {
  for (const [k, v] of Object.entries(defs)) {
    if (Object.hasOwn(entities, k)) throw new Error(`Entidade "${k}" já registrada`);
    entities[k] = v;
  }
}

/** Retorna a definição da entidade ou `undefined` se não existir. */
export function getEntity(name: string | undefined): EntityDef | undefined {
  return name && Object.hasOwn(entities, name) ? entities[name] : undefined;
}

/** Campos que o usuário pode preencher (exclui somente-leitura e gerados). */
export function editableFields(ent: EntityDef) {
  return ent.fields.filter((f) => !f.readonly && !f.auto);
}
