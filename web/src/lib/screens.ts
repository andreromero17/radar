// =============================================================================
// Telas plugáveis. Toda entidade usa a listagem e o formulário genéricos, mas
// pode trocar qualquer um deles por uma tela própria — inteira ou reaproveitando
// a genérica com conteúdo extra (<CrudList entity="x" before={...} />).
// Também dá para criar páginas novas (relatórios, painéis) com rota e permissão.
// Registre em web/src/app/screens.tsx.
// =============================================================================
import type { ComponentType } from 'react';
import type { Action } from '@frame/shared';

export interface EntityScreens {
  /** Substitui a listagem em /:entidade */
  list?: ComponentType;
  /** Substitui o formulário em /:entidade/novo e /:entidade/:id (use useParams para o id) */
  form?: ComponentType;
}

export interface CustomPage {
  /** Caminho sem a barra inicial, ex.: 'relatorios/fluxo-de-caixa' */
  path: string;
  component: ComponentType;
  /** Permissão exigida [recurso, ação]; sem ela, qualquer usuário logado acessa */
  perm?: [string, Action];
}

const screens: Record<string, EntityScreens> = {};
const pages: CustomPage[] = [];

export function registerScreens(entity: string, s: EntityScreens) {
  screens[entity] = { ...screens[entity], ...s };
}

export function registerPage(page: CustomPage) {
  if (pages.some((p) => p.path === page.path)) throw new Error(`Página "${page.path}" já registrada`);
  pages.push(page);
}

export const screensOf = (entity: string | undefined): EntityScreens => (entity && screens[entity]) || {};
export const customPages = (): readonly CustomPage[] => pages;
