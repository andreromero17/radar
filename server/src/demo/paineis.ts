// Exemplo de painel e relatório dinâmico sobre os movimentos de demonstração (DEMO=true).
// Mostra os dois jeitos de alimentar a Fase 4: uma FONTE DE DADOS com várias partes (cards, gráfico,
// ranking e tabela do mesmo cálculo) e um CONJUNTO para o relatório dinâmico (/relatorios/demo_movimentos).
import type { Db } from '../db/knex';
import { mesesEntre, registerConjunto, registerDados, type RegistroConjunto } from '../services/paineis';

type Mov = {
  id: number;
  descricao: string;
  data: string;
  tipo: string;
  valor: number;
  forma: string | null;
  categoria_id: number | null;
  categoria: string | null;
  cor: string | null;
  cliente_id: number | null;
  cliente: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100 || 0;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

async function movimentos(db: Db, de: string, ate: string): Promise<Mov[]> {
  return (await db('demo_movimentos as m')
    .leftJoin('demo_categorias as c', 'c.id', 'm.categoria_id')
    .leftJoin('demo_clientes as k', 'k.id', 'm.cliente_id')
    .whereNull('m.excluido_em')
    .whereBetween('m.data', [de, ate])
    .select(
      'm.id',
      'm.descricao',
      'm.data',
      'm.tipo',
      'm.valor',
      'm.forma',
      'm.categoria_id',
      'c.nome as categoria',
      'c.cor',
      'm.cliente_id',
      'k.nome as cliente',
    )) as Mov[];
}

export function registerDemoPaineis() {
  registerDados('demo.resumo', {
    perm: ['demo_movimentos', 'ver'],
    async carregar({ db, de, ate }) {
      // gráfico: os 6 meses que terminam no fim do período
      const fim = ate.slice(0, 7);
      const [y, m] = fim.split('-').map(Number);
      const ini = new Date(y, m - 6, 1);
      const de6 = `${ini.getFullYear()}-${String(ini.getMonth() + 1).padStart(2, '0')}-01`;
      const todos = await movimentos(db, de < de6 ? de : de6, ate);
      const doPeriodo = todos.filter((x) => x.data >= de);
      const soma = (l: Mov[]) => r2(l.reduce((a, x) => a + Math.abs(Number(x.valor)), 0));
      const rec = doPeriodo.filter((x) => x.tipo === 'Receita');
      const desp = doPeriodo.filter((x) => x.tipo === 'Despesa');
      const meses = mesesEntre(de6, ate);

      const porCat = new Map<string, { rotulo: string; cor: string | null; valor: number; id: number | null }>();
      for (const x of desp) {
        const k = String(x.categoria_id);
        const c = porCat.get(k) ?? { rotulo: x.categoria ?? 'Sem categoria', cor: x.cor, valor: 0, id: x.categoria_id };
        c.valor += Math.abs(Number(x.valor));
        porCat.set(k, c);
      }

      return {
        tipo: 'partes',
        partes: {
          totais: {
            tipo: 'valores',
            formato: 'moeda',
            valores: { receitas: soma(rec), despesas: soma(desp), saldo: r2(soma(rec) - soma(desp)) },
          },
          meses: {
            tipo: 'serie',
            formato: 'moeda',
            rotulos: meses.map(mesCurto),
            series: (['Receita', 'Despesa'] as const).map((t) => ({
              nome: t === 'Receita' ? 'Receitas' : 'Despesas',
              cor: t === 'Receita' ? 'var(--positive)' : 'var(--negative)',
              valores: meses.map((mm) => soma(todos.filter((x) => x.tipo === t && x.data.startsWith(mm)))),
            })),
          },
          categorias: {
            tipo: 'ranking',
            formato: 'moeda',
            itens: [...porCat.values()]
              .sort((a, b) => b.valor - a.valor)
              .map((c) => ({
                rotulo: c.rotulo,
                cor: c.cor,
                valor: r2(c.valor),
                link: c.id ? `/demo_movimentos?categoria_id=${c.id}&data__de=${de}&data__ate=${ate}` : null,
              })),
          },
          ultimos: {
            tipo: 'tabela',
            colunas: [
              { id: 'data', rotulo: 'Data', formato: 'data' },
              { id: 'descricao', rotulo: 'Descrição' },
              { id: 'valor', rotulo: 'Valor', formato: 'moeda', sinal: true },
            ],
            linhas: [...doPeriodo]
              .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id)
              .slice(0, 6)
              .map((x) => ({
                data: x.data,
                descricao: x.descricao,
                valor: Number(x.valor),
                __link: `/demo_movimentos/${x.id}`,
              })),
          },
        },
      };
    },
  });

  registerConjunto('demo_movimentos', {
    rotulo: 'Movimentos (demonstração)',
    descricao: 'Receitas e despesas de demonstração por categoria, forma de pagamento ou cliente, mês a mês.',
    icone: 'arrow-left-right',
    perm: ['demo_movimentos', 'ver'],
    medida: { rotulo: 'Valor', formato: 'moeda' },
    dimensoes: [
      { id: 'tipo', rotulo: 'Tipo', agrupavel: true },
      { id: 'categoria', rotulo: 'Categoria' },
      { id: 'forma', rotulo: 'Forma de pagamento' },
      { id: 'cliente', rotulo: 'Cliente' },
    ],
    linhasPadrao: 'categoria',
    filtrosPadrao: { tipo: ['Despesa'] },
    async carregar({ db, de, ate }) {
      return (await movimentos(db, de, ate)).map((x): RegistroConjunto => ({
        data: x.data,
        valor: Math.abs(Number(x.valor)),
        dims: {
          tipo: { id: x.tipo, rotulo: x.tipo, cor: x.tipo === 'Receita' ? 'var(--positive)' : 'var(--negative)' },
          categoria: { id: String(x.categoria_id ?? ''), rotulo: x.categoria ?? 'Sem categoria', cor: x.cor },
          forma: { id: x.forma ?? '', rotulo: x.forma ?? 'Não informada' },
          cliente: { id: String(x.cliente_id ?? ''), rotulo: x.cliente ?? 'Sem cliente' },
        },
      }));
    },
    sentido(filtros) {
      const t = filtros.tipo ?? [];
      return t.length === 1 ? (t[0] === 'Despesa' ? 'menor-melhor' : 'maior-melhor') : null;
    },
    link(dim, id) {
      const base = '/demo_movimentos?data__de={de}&data__ate={ate}';
      if (dim === 'categoria' && id) return `${base}&categoria_id=${id}`;
      if (dim === 'cliente' && id) return `${base}&cliente_id=${id}`;
      if (dim === 'tipo') return `${base}&tipo=${encodeURIComponent(id)}`;
      if (dim === 'forma' && id) return `${base}&forma=${encodeURIComponent(id)}`;
      return null;
    },
  });
}
