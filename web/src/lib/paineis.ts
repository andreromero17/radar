// =============================================================================
// Widgets dos painéis (Fase 4). Um painel é uma LISTA de widgets: cada um aponta
// para uma fonte de dados do servidor (`registerDados`) e diz como desenhar
// (card, gráfico, ranking, tabela) — ou é um componente próprio do sistema.
// O usuário pode ocultar e reordenar (guardado por usuário no servidor).
//
//   <PainelWidgets id="inicio" widgets={[...]} de={de} ate={ate} />
// =============================================================================
import type { ComponentType } from 'react';
import type { Action, DadosFonte, FormatoValor } from '@frame/shared';
import type { StatCardProps } from '../components/StatCard';
import { fmtMoney, fmtPercent } from './format';
import { cssVar } from './themeVars';

export interface WidgetProps {
  de: string | null;
  ate: string | null;
  params: Record<string, string>;
}

export type Largura = Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl', number>>;

export interface WidgetDef {
  /** Identificador estável (guarda a ordem/oculto do usuário) */
  id: string;
  titulo: string;
  icone?: string;
  /** Texto pequeno à direita do título (ex.: "últimos 6 meses") */
  subtitulo?: string;
  tipo: 'card' | 'grafico' | 'ranking' | 'tabela' | 'componente';
  /** Nome da fonte de dados no servidor (GET /api/dados/:fonte) */
  fonte?: string;
  /** Parâmetros extras da fonte (somados aos do painel) */
  params?: Record<string, string>;
  /** Fonte com várias partes: qual usar */
  parte?: string;
  /** Card: chave do valor (fonte do tipo 'valores') */
  campo?: string;
  /** Card: cor do gradiente */
  cor?: StatCardProps['color'];
  /** Gráfico: barras (padrão) ou linhas */
  grafico?: 'barra' | 'linha';
  /** Gráfico: altura em rem (padrão 16) */
  altura?: number;
  /** Ranking: quantos itens antes de "Outros" (padrão 7) */
  max?: number;
  /** Texto quando não há dados */
  vazio?: string;
  /** Link do card ou do "ver tudo" do quadro; {de} e {ate} viram o período do painel */
  link?: string;
  linkRotulo?: string;
  /** Colunas do grid (react-bootstrap Col). Padrão: card { sm: 6, xl: 4 }; quadro { lg: 6 } */
  largura?: Largura;
  /** Só aparece para quem tem a permissão */
  perm?: [string, Action];
  /** Começa oculto (o usuário pode mostrar em "Personalizar") */
  oculto?: boolean;
  /** tipo 'componente': o que desenhar (recebe o período) */
  componente?: ComponentType<WidgetProps>;
  /** Componente: desenha o próprio quadro (sem o cartão com título do frame) */
  semQuadro?: boolean;
}

/** Preferência do usuário para um painel */
export interface PrefPainel {
  ocultos: string[];
  /** Ids na ordem escolhida (os novos entram no fim, na ordem do código) */
  ordem: string[];
  /** Ids que o usuário MOSTROU mesmo vindo ocultos por padrão */
  mostrados?: string[];
}

export function formatar(v: number, formato: FormatoValor | undefined = 'moeda') {
  if (formato === 'percentual') return fmtPercent(v);
  if (formato === 'numero') return v.toLocaleString('pt-BR');
  return fmtMoney(v);
}

/** Moeda compacta para eixos ("R$ 12,5 mil") */
export const compacto = (v: number) =>
  v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1, style: 'currency', currency: 'BRL' });

/** Troca {de} e {ate} do link pelo período */
export const montarLink = (link: string | null | undefined, de: string | null, ate: string | null) =>
  link ? link.replaceAll('{de}', de ?? '').replaceAll('{ate}', ate ?? '') : null;

/** Parte pedida de uma fonte com partes (ou a própria fonte) */
export function parteDe(d: DadosFonte | undefined, parte?: string): DadosFonte | undefined {
  if (!d) return undefined;
  if (d.tipo === 'partes') return parte ? d.partes[parte] : undefined;
  return d;
}

/** Ordem final dos widgets segundo a preferência (novos no fim) */
export function ordenar(widgets: WidgetDef[], pref: PrefPainel | null): WidgetDef[] {
  if (!pref?.ordem.length) return widgets;
  const pos = new Map(pref.ordem.map((id, i) => [id, i]));
  return [...widgets].sort(
    (a, b) => (pos.get(a.id) ?? 1000 + widgets.indexOf(a)) - (pos.get(b.id) ?? 1000 + widgets.indexOf(b)),
  );
}

export const estaOculto = (w: WidgetDef, pref: PrefPainel | null) =>
  pref?.ocultos.includes(w.id) || (!!w.oculto && !pref?.mostrados?.includes(w.id));
/** Cor para canvas: 'var(--x)' vira o valor do tema; sem cor, a paleta categórica (--serie-1..8) em ordem */
export function corCanvas(cor: string | null | undefined, i: number) {
  if (cor?.startsWith('var(')) return cssVar(cor.slice(4, -1).trim());
  return cor || cssVar(`--serie-${(i % 8) + 1}`);
}
