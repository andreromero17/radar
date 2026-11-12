// Desenho de cada tipo de widget a partir dos dados da fonte (o grid e a personalização ficam em PainelWidgets)
import { Link, useNavigate } from 'react-router-dom';
import { Table } from 'react-bootstrap';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import type { DadosRanking, DadosSerie, DadosTabela, FormatoValor } from '@frame/shared';
import { fmtDate } from '../../lib/format';
import { compacto, corCanvas, formatar } from '../../lib/paineis';
import { chartTheme, useThemeVersion } from '../../lib/themeVars';
import { useOrigem } from '../../lib/voltar';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
);

export function GraficoSerie({
  dados,
  tipo = 'barra',
  altura = 16,
  rotulo,
}: {
  dados: DadosSerie;
  tipo?: 'barra' | 'linha';
  altura?: number;
  rotulo: string;
}) {
  const versao = useThemeVersion();
  const t = chartTheme();
  const muitas = dados.series.length > 1;
  return (
    <div style={{ height: `${altura}rem` }}>
      <Chart
        type="bar"
        key={versao}
        aria-label={rotulo}
        data={{
          labels: dados.rotulos,
          datasets: dados.series.map((s, i) => {
            const cor = corCanvas(s.cor, i);
            return (s.tipo ?? tipo) === 'linha'
              ? {
                  type: 'line' as const,
                  label: s.nome,
                  data: s.valores,
                  borderColor: cor,
                  backgroundColor: cor,
                  borderWidth: 2,
                  pointRadius: dados.rotulos.length > 40 ? 0 : 3,
                  pointHoverRadius: 5,
                  tension: 0.25,
                }
              : {
                  type: 'bar' as const,
                  label: s.nome,
                  data: s.valores,
                  backgroundColor: cor,
                  borderRadius: 4,
                  maxBarThickness: 22,
                  categoryPercentage: 0.6,
                };
          }),
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: muitas,
              position: 'top',
              align: 'end',
              labels: { color: t.text, boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 },
            },
            tooltip: {
              callbacks: { label: (c) => `${c.dataset.label}: ${formatar(Number(c.parsed.y), dados.formato)}` },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: t.text, maxRotation: 0, autoSkip: true } },
            y: {
              beginAtZero: true,
              border: { display: false },
              grid: { color: t.grid },
              ticks: {
                color: t.text,
                callback: (v) => (dados.formato === 'moeda' || !dados.formato ? compacto(Number(v)) : String(v)),
              },
            },
          },
        }}
      />
    </div>
  );
}

/** Lista com barra proporcional na cor do item (rótulo e valor sempre em texto); o que passar de `max` vira "Outros" */
export function Ranking({ dados, max = 7, vazio }: { dados: DadosRanking; max?: number; vazio?: string }) {
  const origem = useOrigem();
  const itens = dados.itens.filter((i) => i.valor > 0);
  if (!itens.length) return <p className="text-muted mb-0">{vazio ?? 'Nada no período.'}</p>;
  const total = itens.reduce((a, c) => a + c.valor, 0);
  const resto = itens.slice(max);
  const lista = resto.length
    ? [
        ...itens.slice(0, max),
        {
          rotulo: `Outros (${resto.length})`,
          cor: 'var(--text-subtle)',
          valor: resto.reduce((a, c) => a + c.valor, 0),
          link: null,
          detalhe: null,
        },
      ]
    : itens;
  const maior = Math.max(...lista.map((c) => c.valor));
  return (
    <ul className="list-unstyled mb-0 widget-ranking">
      {lista.map((c, i) => (
        <li key={`${c.rotulo}-${i}`}>
          <div className="d-flex justify-content-between small mb-1">
            <span className="fw-semibold text-truncate">
              <span className="color-dot" style={{ background: c.cor ?? 'var(--text-subtle)' }} />
              {c.link ? (
                <Link to={c.link} state={origem} className="link-body-emphasis">
                  {c.rotulo}
                </Link>
              ) : (
                c.rotulo
              )}
            </span>
            <span className="text-nowrap ms-2">
              {formatar(c.valor, dados.formato)}{' '}
              <span className="text-muted">{Math.round((c.valor / total) * 100)}%</span>
            </span>
          </div>
          <div className="ranking-trilho">
            <div
              className="ranking-barra"
              style={{ width: `${(c.valor / maior) * 100}%`, background: c.cor ?? 'var(--text-subtle)' }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

const celula = (v: unknown, formato?: FormatoValor | 'data' | 'texto') => {
  if (v == null || v === '') return '—';
  if (formato === 'data') return fmtDate(v);
  if (formato === 'moeda' || formato === 'numero' || formato === 'percentual') return formatar(Number(v), formato);
  return String(v);
};

export function TabelaDados({ dados, vazio }: { dados: DadosTabela; vazio?: string }) {
  const navigate = useNavigate();
  const origem = useOrigem();
  if (!dados.linhas.length) return <p className="text-muted p-3 mb-0">{vazio ?? 'Nada no período.'}</p>;
  const numerica = (f?: string) => f === 'moeda' || f === 'numero' || f === 'percentual';
  return (
    <Table responsive hover className="table-app mb-0 widget-tabela">
      <thead>
        <tr>
          {dados.colunas.map((c) => (
            <th key={c.id} className={numerica(c.formato) ? 'text-end' : undefined}>
              {c.rotulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {dados.linhas.map((l, i) => (
          <tr
            key={i}
            className={l.__link ? 'cursor-pointer' : undefined}
            onClick={l.__link ? () => navigate(l.__link!, { state: origem }) : undefined}
          >
            {dados.colunas.map((c) => {
              const v = l[c.id];
              const n = Number(v);
              const sinal = c.sinal && v != null && n !== 0 ? (n < 0 ? 'valor-negativo' : 'valor-positivo') : '';
              return (
                <td key={c.id} className={`${numerica(c.formato) ? 'text-end text-nowrap ' : ''}${sinal}`}>
                  {celula(v, c.formato)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
