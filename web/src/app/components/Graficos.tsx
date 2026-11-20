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
export function Rosca({ rotulos, valores, altura = 14 }: { rotulos: string[]; valores: number[]; altura?: number }) {
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
          options={{ maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: false } } }}
        />
      </div>
      <ul className="list-unstyled mb-0 flex-grow-1 small" style={{ minWidth: '12rem' }}>
        {rotulos.map((r, i) => (
          <li key={r} className="d-flex align-items-center gap-2 py-1">
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
}: {
  rotulos: string[];
  series: { nome: string; valores: number[] }[];
  altura?: number;
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
