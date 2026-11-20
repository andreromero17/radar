// Gráficos do Radar (Chart.js), com as cores do tema.
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { chartTheme, cssVar, useThemeVersion } from '../../lib/themeVars';

ChartJS.register(
  ArcElement,
  DoughnutController,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

const serie = (i: number) => cssVar(`--serie-${(i % 8) + 1}`);

/** Rosca com legenda ao lado (ex.: fatia de posts por concorrente) */
export function Rosca({
  rotulos,
  valores,
  altura = 14,
  onClick,
}: {
  rotulos: string[];
  valores: number[];
  altura?: number;
  /** Clique numa fatia ou na legenda: índice do rótulo */
  onClick?: (i: number) => void;
}) {
  const v = useThemeVersion();
  const t = chartTheme();
  const total = valores.reduce((s, x) => s + x, 0) || 1;
  return (
    <div className="d-flex flex-wrap align-items-center gap-3">
      <div style={{ width: `${altura}rem`, height: `${altura}rem` }}>
        <Chart
          key={v}
          type="doughnut"
          data={{
            labels: rotulos,
            datasets: [
              {
                data: valores,
                backgroundColor: rotulos.map((_, i) => serie(i)),
                borderColor: t.surface,
                borderWidth: 2,
              },
            ],
          }}
          options={{
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: { legend: { display: false } },
            onClick: (_e, els) => {
              if (onClick && els[0]) onClick(els[0].index);
            },
            onHover: (e, els) => {
              const alvo = e.native?.target as HTMLElement | undefined;
              if (alvo && onClick) alvo.style.cursor = els.length ? 'pointer' : 'default';
            },
          }}
        />
      </div>
      <ul className="list-unstyled mb-0 flex-grow-1 small" style={{ minWidth: '12rem' }}>
        {rotulos.map((r, i) => (
          <li
            key={r}
            className="d-flex align-items-center gap-2 py-1"
            role={onClick ? 'button' : undefined}
            onClick={onClick ? () => onClick(i) : undefined}
            style={onClick ? { cursor: 'pointer' } : undefined}
          >
            <span
              style={{ width: '0.7rem', height: '0.7rem', borderRadius: '50%', background: serie(i), flex: '0 0 auto' }}
            />
            <span className="flex-grow-1 text-truncate">{r}</span>
            <span className="text-muted">{Math.round((valores[i] / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras verticais simples (ex.: sinais por semana) */
export function Barras({
  rotulos,
  valores,
  altura = 12,
  cor,
}: {
  rotulos: string[];
  valores: number[];
  altura?: number;
  cor?: string;
}) {
  const v = useThemeVersion();
  const t = chartTheme();
  return (
    <div style={{ height: `${altura}rem` }}>
      <Chart
        key={v}
        type="bar"
        data={{
          labels: rotulos,
          datasets: [{ data: valores, backgroundColor: cor ?? t.brand, borderRadius: 4, maxBarThickness: 36 }],
        }}
        options={{
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: t.text } },
            y: { beginAtZero: true, grid: { color: t.grid }, ticks: { color: t.text, precision: 0 } },
          },
        }}
      />
    </div>
  );
}

/** Barras horizontais empilhadas (ex.: tipos de movimento por concorrente) */
export function BarrasEmpilhadas({
  rotulos,
  series,
  altura,
  onClick,
}: {
  rotulos: string[];
  series: { nome: string; valores: number[] }[];
  altura?: number;
  /** Clique num pedaço: série (dataset) e linha (rótulo) */
  onClick?: (serie: number, linha: number) => void;
}) {
  const v = useThemeVersion();
  const t = chartTheme();
  return (
    <div style={{ height: `${altura ?? Math.max(10, rotulos.length * 2.2 + 4)}rem` }}>
      <Chart
        key={v}
        type="bar"
        data={{
          labels: rotulos,
          datasets: series.map((s, i) => ({
            label: s.nome,
            data: s.valores,
            backgroundColor: serie(i),
            borderWidth: 0,
            maxBarThickness: 22,
          })),
        }}
        options={{
          indexAxis: 'y',
          maintainAspectRatio: false,
          onClick: (_e, els) => {
            if (onClick && els[0]) onClick(els[0].datasetIndex, els[0].index);
          },
          onHover: (e, els) => {
            const alvo = e.native?.target as HTMLElement | undefined;
            if (alvo && onClick) alvo.style.cursor = els.length ? 'pointer' : 'default';
          },
          plugins: { legend: { position: 'bottom', labels: { color: t.text, boxWidth: 10, font: { size: 11 } } } },
          scales: {
            x: { stacked: true, beginAtZero: true, grid: { color: t.grid }, ticks: { color: t.text, precision: 0 } },
            y: { stacked: true, grid: { display: false }, ticks: { color: t.text } },
          },
        }}
      />
    </div>
  );
}

/** Barras horizontais com valor (ex.: média de interações por assunto), ordenadas como vierem */
export function BarrasHorizontais({
  rotulos,
  valores,
  detalhe,
  onClick,
}: {
  rotulos: string[];
  valores: number[];
  /** Texto extra no tooltip, por barra */
  detalhe?: string[];
  onClick?: (i: number) => void;
}) {
  const v = useThemeVersion();
  const t = chartTheme();
  return (
    <div style={{ height: `${Math.max(9, rotulos.length * 2.1 + 2)}rem` }}>
      <Chart
        key={v}
        type="bar"
        data={{
          labels: rotulos,
          datasets: [{ data: valores, backgroundColor: t.brand, borderRadius: 4, maxBarThickness: 22 }],
        }}
        options={{
          indexAxis: 'y',
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { afterLabel: (c) => detalhe?.[c.dataIndex] ?? '' } },
          },
          scales: {
            x: { beginAtZero: true, grid: { color: t.grid }, ticks: { color: t.text } },
            y: { grid: { display: false }, ticks: { color: t.text } },
          },
          onClick: (_e, els) => {
            if (onClick && els[0]) onClick(els[0].index);
          },
          onHover: (e, els) => {
            const alvo = e.native?.target as HTMLElement | undefined;
            if (alvo && onClick) alvo.style.cursor = els.length ? 'pointer' : 'default';
          },
        }}
      />
    </div>
  );
}
