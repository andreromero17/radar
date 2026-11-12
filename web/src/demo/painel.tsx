// Painel de demonstração montado só com CONFIGURAÇÃO (Fase 4): cards, gráfico, ranking e tabela vêm da fonte
// `demo.resumo` (server/src/demo/paineis.ts); o usuário oculta e reordena em "Personalizar painel".
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PeriodNav from '../components/list/PeriodNav';
import PainelWidgets from '../components/painel/PainelWidgets';
import type { WidgetDef } from '../lib/paineis';
import { periodoPadrao } from '../lib/periodoGlobal';

const LISTA = '/demo_movimentos?data__de={de}&data__ate={ate}';

const WIDGETS: WidgetDef[] = [
  {
    id: 'receitas',
    titulo: 'Receitas',
    tipo: 'card',
    fonte: 'demo.resumo',
    parte: 'totais',
    campo: 'receitas',
    icone: 'arrow-up-circle',
    cor: 'green',
    link: `${LISTA}&tipo=Receita`,
  },
  {
    id: 'despesas',
    titulo: 'Despesas',
    tipo: 'card',
    fonte: 'demo.resumo',
    parte: 'totais',
    campo: 'despesas',
    icone: 'arrow-down-circle',
    cor: 'red',
    link: `${LISTA}&tipo=Despesa`,
  },
  {
    id: 'saldo',
    titulo: 'Saldo do período',
    tipo: 'card',
    fonte: 'demo.resumo',
    parte: 'totais',
    campo: 'saldo',
    icone: 'graph-up',
    cor: 'purple',
  },
  {
    id: 'meses',
    titulo: 'Receitas × despesas',
    subtitulo: 'últimos 6 meses',
    tipo: 'grafico',
    fonte: 'demo.resumo',
    parte: 'meses',
    icone: 'bar-chart',
    largura: { lg: 7 },
  },
  {
    id: 'categorias',
    titulo: 'Despesas por categoria',
    tipo: 'ranking',
    fonte: 'demo.resumo',
    parte: 'categorias',
    icone: 'pie-chart',
    largura: { lg: 5 },
    link: '/relatorios/demo_movimentos',
    linkRotulo: 'evolução',
  },
  {
    id: 'ultimos',
    titulo: 'Últimos movimentos',
    tipo: 'tabela',
    fonte: 'demo.resumo',
    parte: 'ultimos',
    icone: 'clock-history',
    largura: { xs: 12 },
    link: LISTA,
  },
];

export default function PainelDemo() {
  const [params, setParams] = useSearchParams();
  const de = params.get('data__de');
  const ate = params.get('data__ate');
  useEffect(() => {
    if (de || ate) return;
    const p = periodoPadrao();
    if (p) setParams({ ...(p.de && { data__de: p.de }), ...(p.ate && { data__ate: p.ate }) }, { replace: true });
  }, [de, ate, setParams]);

  return (
    <>
      <PageHeader title="Painel (demo)" icon="grid-1x2" subtitle="Montado com widgets: web/src/demo/painel.tsx" />
      <div className="mb-3">
        <PeriodNav field="data" params={params} setParams={setParams} />
      </div>
      <PainelWidgets id="demo" widgets={WIDGETS} de={de} ate={ate} />
    </>
  );
}
