// =============================================================================
// Registro de entidades = aplicação (app/entities.ts) + núcleo (core/entities.ts).
// Todo o resto do frame (API, telas, permissões, migrações) lê daqui.
// =============================================================================
import { appEntities } from './app/entities';
import { coreEntities } from './core/entities';
import type { EntityDef, FieldDef } from './types';

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

const pad = (n: number) => String(n).padStart(2, '0');

/** Valor padrão do campo, com 'hoje' (date) e 'agora' (datetime) calculados no momento */
export function defaultValue(f: FieldDef): string | number | boolean | undefined {
  const d = new Date();
  const hoje = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (f.type === 'date' && f.default === 'hoje') return hoje;
  if (f.type === 'datetime' && f.default === 'agora') return `${hoje} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return f.default;
}

/** Campos do "pai" preenchidos pela soma das sub-tabelas */
export const summedFields = (ent: EntityDef) => new Set((ent.details ?? []).flatMap((d) => Object.keys(d.sum ?? {})));

/** Campos que o usuário pode preencher (exclui somente-leitura, gerados, calculados e somas). */
export function editableFields(ent: EntityDef) {
  const somas = summedFields(ent);
  return ent.fields.filter((f) => !f.readonly && !f.auto && !f.compute && !somas.has(f.name));
}

/** Entidades que aparecem como cadastro próprio (exclui sub-tabelas) */
export const mainEntities = () => Object.entries(entities).filter(([, e]) => !e.detailOf);

/** A entidade aceita importação de CSV/Excel? (padrão: sim, menos núcleo e sub-tabelas) */
export const canImport = (name: string, ent: EntityDef) => ent.importar ?? (!isCoreEntity(name) && !ent.detailOf);
