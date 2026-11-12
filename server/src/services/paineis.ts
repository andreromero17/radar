// =============================================================================
// Painéis e relatórios configuráveis: registro das FONTES DE DADOS (o que os widgets
// desenham) e dos CONJUNTOS (movimentos planos para o relatório dinâmico), e o
// cálculo da tabela dinâmica (linhas × meses). O sistema registra os seus em
// server/src/app/paineis.ts; o módulo de demonstração, em server/src/demo/paineis.ts.
// =============================================================================
import type { Action, AuthUser, ConjuntoInfo, DadosFonte, LinhaPivo, Pivo } from '@frame/shared';
import type { Db } from '../db/knex';
import { HttpError } from '../utils/http';

export interface ContextoDados {
  db: Db;
  user: AuthUser;
  /** Período pedido ('AAAA-MM-DD'); padrão: mês atual */
  de: string;
  ate: string;
  /** Demais parâmetros da URL (?tipo=Despesa&dias=90...) */
  params: Record<string, string>;
}

export interface FonteDef {
  /** Permissão exigida [recurso, ação]; sem ela, qualquer usuário logado */
  perm?: [string, Action];
  carregar(ctx: ContextoDados): Promise<DadosFonte>;
}

/** Um movimento do conjunto: data, valor e o valor de cada dimensão */
export interface RegistroConjunto {
  data: string;
  valor: number;
  dims: Record<string, { id: string; rotulo: string; cor?: string | null }>;
}

export interface ConjuntoDef extends Omit<ConjuntoInfo, 'nome'> {
  perm?: [string, Action];
  /** Movimentos com data entre `de` e `ate` (pode trazer a mais: o frame recorta) */
  carregar(ctx: ContextoDados): Promise<RegistroConjunto[]>;
  /**
   * Detalhamento de uma linha: URL com `{de}` e `{ate}` (o frame troca pelo mês ou período clicado).
   * Recebe a dimensão das linhas, o id da linha e os filtros aplicados. null = sem detalhe.
   */
  link?(dimensao: string, id: string, filtros: Record<string, string[]>): string | null;
  /** Subir é ruim ou bom com estes filtros (colore as variações do comparativo); padrão: neutro */
  sentido?(filtros: Record<string, string[]>, dimensao: string): 'menor-melhor' | 'maior-melhor' | null;
}

const fontes = new Map<string, FonteDef>();
const conjuntos = new Map<string, ConjuntoDef>();

export function registerDados(nome: string, def: FonteDef) {
  fontes.set(nome, def);
}

export function registerConjunto(nome: string, def: ConjuntoDef) {
  if (!def.dimensoes.some((d) => d.id === def.linhasPadrao))
    throw new Error(`Conjunto "${nome}": linhasPadrao "${def.linhasPadrao}" não é uma dimensão`);
  conjuntos.set(nome, def);
}

export const fonteDados = (nome: string) => fontes.get(nome);
export const conjunto = (nome: string) => conjuntos.get(nome);

export function conjuntosInfo(pode: (perm?: [string, Action]) => boolean): ConjuntoInfo[] {
  return [...conjuntos.entries()]
    .filter(([, c]) => pode(c.perm))
    .map(([nome, c]) => ({
      nome,
      rotulo: c.rotulo,
      descricao: c.descricao,
      icone: c.icone,
      medida: c.medida,
      dimensoes: c.dimensoes,
      linhasPadrao: c.linhasPadrao,
      filtrosPadrao: c.filtrosPadrao,
    }));
}

// ---------------------------------------------------------------- tabela dinâmica

const r2 = (n: number) => Math.round(n * 100) / 100 || 0;

/** Meses ('AAAA-MM') de `de` até `ate`, inclusive */
export function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  let [y, m] = de.slice(0, 7).split('-').map(Number);
  const fim = ate.slice(0, 7);
  for (let k = 0; k < 240; k++) {
    const mes = `${y}-${String(m).padStart(2, '0')}`;
    if (mes > fim) break;
    out.push(mes);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** Agrupa os movimentos por uma dimensão (linhas) e por mês (colunas), com filtros por dimensão */
export function pivotar(
  nome: string,
  def: ConjuntoDef,
  registros: RegistroConjunto[],
  q: { de: string; ate: string; dimensao: string; filtros: Record<string, string[]> },
): Pivo {
  const meses = mesesEntre(q.de, q.ate);
  const idx = new Map(meses.map((m, i) => [m, i]));
  const noPeriodo = registros.filter((r) => r.data >= q.de && r.data <= q.ate);

  // opções dos filtros: o que aparece no período (sem os filtros, para dar para trocar)
  const opcoes: Pivo['opcoes'] = {};
  for (const d of def.dimensoes.filter((x) => x.filtravel !== false)) {
    const vistos = new Map<string, string>();
    for (const r of noPeriodo) {
      const v = r.dims[d.id];
      if (v) vistos.set(v.id, v.rotulo);
    }
    opcoes[d.id] = [...vistos.entries()]
      .map(([id, rotulo]) => ({ id, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  }

  const filtros = Object.fromEntries(Object.entries(q.filtros).filter(([, v]) => v.length));
  const passa = (r: RegistroConjunto) =>
    Object.entries(filtros).every(([d, ids]) => r.dims[d] != null && ids.includes(r.dims[d].id));

  const grupos = new Map<string, { rotulo: string; cor: string | null; valores: number[] }>();
  const totais = meses.map(() => 0);
  for (const r of noPeriodo) {
    if (!passa(r)) continue;
    const i = idx.get(r.data.slice(0, 7));
    if (i == null) continue;
    const v = r.dims[q.dimensao] ?? { id: '', rotulo: '(sem)', cor: null };
    const g = grupos.get(v.id) ?? { rotulo: v.rotulo, cor: v.cor ?? null, valores: meses.map(() => 0) };
    g.valores[i] += r.valor;
    totais[i] += r.valor;
    grupos.set(v.id, g);
  }

  const n = meses.length || 1;
  const linhas: LinhaPivo[] = [...grupos.entries()]
    .map(([id, g]) => {
      const valores = g.valores.map(r2);
      const total = r2(valores.reduce((a, x) => a + x, 0));
      return {
        id,
        rotulo: g.rotulo,
        cor: g.cor,
        valores,
        total,
        media: r2(total / n),
        link: def.link?.(q.dimensao, id, filtros) ?? null,
      };
    })
    .filter((l) => l.valores.some((x) => Math.abs(x) >= 0.005))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  const tv = totais.map(r2);
  const total = r2(tv.reduce((a, x) => a + x, 0));

  return {
    conjunto: nome,
    de: q.de,
    ate: q.ate,
    meses,
    linhas,
    total: { valores: tv, total, media: r2(total / n) },
    dimensao: q.dimensao,
    filtros,
    opcoes,
    sentido: def.sentido?.(filtros, q.dimensao) ?? null,
  };
}

/** Lê os filtros da URL: f_<dimensão>=id1,id2 */
export function filtrosDaQuery(def: ConjuntoDef, query: Record<string, unknown>): Record<string, string[]> | null {
  const out: Record<string, string[]> = {};
  let algum = false;
  for (const d of def.dimensoes) {
    const v = query[`f_${d.id}`];
    if (v == null) continue;
    algum = true;
    out[d.id] = String(v)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return algum ? out : null;
}

export function validarDimensao(def: ConjuntoDef, dim: unknown): string {
  if (dim == null || dim === '') return def.linhasPadrao;
  const d = def.dimensoes.find((x) => x.id === dim && x.agrupavel !== false);
  if (!d) throw new HttpError(422, 'Agrupamento inválido');
  return d.id;
}

/** Nomes das fontes de dados registradas (teste de isolamento percorre todas) */
export const fontesRegistradas = () => [...fontes.keys()];
