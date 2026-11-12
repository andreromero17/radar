import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, ButtonGroup, Card, Dropdown, Form, Spinner, ToggleButton } from 'react-bootstrap';
import type { ConjuntoInfo, LinhaPivo, Pivo } from '@frame/shared';
import { api, errorMessage } from '../lib/api';
import { formatar, montarLink } from '../lib/paineis';
import { mesIso, nomeMes } from '../lib/meses';
import { mesPadrao } from '../lib/periodoGlobal';
import { useOrigem } from '../lib/voltar';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import PageHeader from '../components/PageHeader';
import MonthPicker from '../components/MonthPicker';
import { GraficoSerie } from '../components/painel/widgets';
import NotFound from './NotFound';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const pad = (n: number) => String(n).padStart(2, '0');
const fimDoMes = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return `${m}-${pad(new Date(y, mm, 0).getDate())}`;
};
const somaMeses = (m: string, n: number) => {
  const [y, mm] = m.split('-').map(Number);
  return mesIso(y, mm - 1 + n);
};
const MAX_SEL = 8;

let cacheInfo: ConjuntoInfo[] | null = null;
function useConjuntos() {
  const [lista, setLista] = useState<ConjuntoInfo[] | null>(cacheInfo);
  useEffect(() => {
    if (cacheInfo) return;
    api
      .get<ConjuntoInfo[]>('/relatorios')
      .then((r) => {
        cacheInfo = r;
        setLista(r);
      })
      .catch(() => setLista([]));
  }, []);
  return lista;
}

/** Lista dos relatórios dinâmicos que o usuário pode ver */
export function Relatorios() {
  const lista = useConjuntos();
  if (!lista)
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );
  return (
    <>
      <PageHeader title="Relatórios" icon="bar-chart-line" subtitle="Evolução mês a mês e comparativos" />
      {lista.length === 0 && <p className="text-muted">Nenhum relatório disponível para o seu perfil.</p>}
      <div className="row g-3">
        {lista.map((c) => (
          <div key={c.nome} className="col-md-6 col-xl-4">
            <Link to={`/relatorios/${c.nome}`} className="card card-app h-100 text-decoration-none text-body">
              <div className="card-body">
                <div className="fw-bold mb-1">
                  <i className={`bi bi-${c.icone ?? 'table'} me-2`} />
                  {c.rotulo}
                </div>
                {c.descricao && <div className="small text-muted">{c.descricao}</div>}
              </div>
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Relatório dinâmico de um conjunto: linhas (a dimensão escolhida) × meses, com filtros, gráfico das linhas
 * escolhidas, comparativo do mês com a média dos anteriores, CSV e impressão. Tudo fica na URL.
 */
export default function Relatorio() {
  const { conjunto = '' } = useParams();
  const lista = useConjuntos();
  const info = lista?.find((c) => c.nome === conjunto);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const origem = useOrigem();
  const toast = useToast();
  const { settings } = useSettings();
  const [p, setP] = useState<Pivo | null>(null);

  const visao = params.get('visao') === 'comparativo' ? 'comparativo' : 'evolucao';
  const mes = /^\d{4}-\d{2}$/.test(params.get('mes') ?? '') ? params.get('mes')! : mesPadrao();
  const n = [3, 6, 12, 24].includes(Number(params.get('n'))) ? Number(params.get('n')) : 12;
  const base = [1, 3, 6, 12].includes(Number(params.get('base'))) ? Number(params.get('base')) : 3;
  const linhas = params.get('linhas') ?? info?.linhasPadrao ?? '';
  const primeiro = visao === 'evolucao' ? somaMeses(mes, -(n - 1)) : somaMeses(mes, -base);
  const de = `${primeiro}-01`;
  const ate = fimDoMes(mes);

  const atualizar = (mudar: Record<string, string | null>) => {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudar)) {
      if (v == null) q.delete(k);
      else q.set(k, v);
    }
    setParams(q, { replace: true, state: origem.voltarState });
  };

  // filtros da URL (f_<dim>); sem nenhum, o servidor aplica os padrões do conjunto
  const filtrosUrl = [...params.entries()].filter(([k]) => k.startsWith('f_'));
  const chave = new URLSearchParams([['de', de], ['ate', ate], ['linhas', linhas], ...filtrosUrl]).toString();
  useEffect(() => {
    if (!info) return;
    setP(null);
    api
      .get<Pivo>(`/relatorios/${conjunto}?${chave}`)
      .then(setP)
      .catch((e) => toast.error(errorMessage(e)));
  }, [conjunto, chave, info, toast]);

  // linhas no gráfico: as escolhidas ou as 5 maiores
  const selUrl = params.get('sel');
  const selecionadas = useMemo(() => {
    if (!p) return [];
    const ids = selUrl ? selUrl.split(',') : p.linhas.slice(0, 5).map((l) => l.id);
    return p.linhas.filter((l) => ids.includes(l.id));
  }, [p, selUrl]);
  const alternarSel = (l: LinhaPivo) => {
    const ids = selecionadas.map((x) => x.id);
    const novo = ids.includes(l.id) ? ids.filter((x) => x !== l.id) : [...ids, l.id].slice(-MAX_SEL);
    atualizar({ sel: novo.join(',') || '-' });
  };

  if (lista && !info) return <NotFound />;
  if (!info)
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );

  const dimRotulo = (id: string) => info.dimensoes.find((d) => d.id === id)?.rotulo ?? id;
  const filtraveis = info.dimensoes.filter((d) => d.filtravel !== false);
  const agrupaveis = info.dimensoes.filter((d) => d.agrupavel !== false);
  // na tabela, moeda sem o "R$" em cada célula (o título da coluna diz); nos totais e no gráfico, completa
  const fmt = (v: number) =>
    info.medida.formato === 'moeda'
      ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : formatar(v, info.medida.formato);
  const abrir = (link: string | null, d1: string, d2: string) => {
    const url = montarLink(link, d1, d2);
    if (url) navigate(url, { state: origem });
  };
  const descricaoFiltros = p
    ? Object.entries(p.filtros)
        .map(
          ([d, ids]) =>
            `${dimRotulo(d)}: ${ids.map((i) => p.opcoes[d]?.find((o) => o.id === i)?.rotulo ?? i).join(', ')}`,
        )
        .join(' · ')
    : '';

  const exportarCsv = () => {
    if (!p) return;
    const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
    const num = (v: number) => v.toFixed(2).replace('.', ',');
    const cab = [dimRotulo(p.dimensao), ...p.meses.map(mesCurto), 'Total', 'Média'];
    const corpo = p.linhas.map((l) => [esc(l.rotulo), ...l.valores.map(num), num(l.total), num(l.media)].join(';'));
    const tot = ['Total', ...p.total.valores.map(num), num(p.total.total), num(p.total.media)].join(';');
    const blob = new Blob([`\ufeff${[cab.join(';'), ...corpo, tot].join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${conjunto}-${p.meses[0]}-a-${p.meses[p.meses.length - 1]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader title={info.rotulo} icon={info.icone ?? 'bar-chart-line'} subtitle={info.descricao}>
        <Button variant="light" className="border" onClick={exportarCsv} disabled={!p}>
          <i className="bi bi-filetype-csv me-1" />
          CSV
        </Button>
        <Button variant="light" className="border" onClick={() => window.print()} disabled={!p}>
          <i className="bi bi-printer me-1" />
          Imprimir
        </Button>
      </PageHeader>

      <div className="so-impressao mb-3">
        <div className="fw-bold">{settings.organizacao || settings.nome_sistema}</div>
        <div className="fs-5 fw-bold">
          {info.rotulo} · {visao === 'evolucao' ? 'Evolução' : 'Comparativo'}
        </div>
        <div className="small">
          {nomeMes(primeiro)} a {nomeMes(mes)} · por {dimRotulo(linhas).toLowerCase()}
          {descricaoFiltros && ` · ${descricaoFiltros}`} · gerado em {new Date().toLocaleString('pt-BR')}
        </div>
      </div>

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3 nao-imprimir">
        <ButtonGroup size="sm">
          {(['evolucao', 'comparativo'] as const).map((v) => (
            <ToggleButton
              key={v}
              id={`rel-visao-${v}`}
              type="radio"
              variant="outline-secondary"
              value={v}
              checked={visao === v}
              onChange={() => atualizar({ visao: v === 'evolucao' ? null : v, sel: null })}
            >
              {v === 'evolucao' ? 'Evolução' : 'Comparativo'}
            </ToggleButton>
          ))}
        </ButtonGroup>
        <MonthPicker value={mes} onChange={(m) => atualizar({ mes: m })} />
        {visao === 'evolucao' ? (
          <Form.Select
            size="sm"
            className="w-auto"
            aria-label="Quantidade de meses"
            value={n}
            onChange={(e) => atualizar({ n: e.target.value })}
          >
            {[3, 6, 12, 24].map((x) => (
              <option key={x} value={x}>
                últimos {x} meses
              </option>
            ))}
          </Form.Select>
        ) : (
          <Form.Select
            size="sm"
            className="w-auto"
            aria-label="Comparar com"
            value={base}
            onChange={(e) => atualizar({ base: e.target.value })}
          >
            {[1, 3, 6, 12].map((x) => (
              <option key={x} value={x}>
                {x === 1 ? 'vs. mês anterior' : `vs. média dos ${x} meses anteriores`}
              </option>
            ))}
          </Form.Select>
        )}
        <Form.Select
          size="sm"
          className="w-auto"
          aria-label="Agrupar por"
          value={linhas}
          onChange={(e) => atualizar({ linhas: e.target.value, sel: null })}
        >
          {agrupaveis.map((d) => (
            <option key={d.id} value={d.id}>
              por {d.rotulo.toLowerCase()}
            </option>
          ))}
        </Form.Select>
        {p &&
          filtraveis.map((d) => {
            const ativos = p.filtros[d.id] ?? [];
            const opcoes = p.opcoes[d.id] ?? [];
            const marcar = (id: string) => {
              const novo = ativos.includes(id) ? ativos.filter((x) => x !== id) : [...ativos, id];
              // mantém os demais filtros efetivos na URL (o padrão do servidor só vale sem nenhum f_)
              const q: Record<string, string | null> = { sel: null };
              for (const dd of filtraveis) q[`f_${dd.id}`] = (p.filtros[dd.id] ?? []).join(',');
              q[`f_${d.id}`] = novo.join(',');
              atualizar(q);
            };
            if (opcoes.length < 2 && !ativos.length) return null;
            return (
              <Dropdown key={d.id} autoClose="outside">
                <Dropdown.Toggle
                  size="sm"
                  variant={ativos.length ? 'primary' : 'light'}
                  className={ativos.length ? '' : 'border'}
                >
                  {d.rotulo}
                  {ativos.length
                    ? `: ${ativos.length === 1 ? (opcoes.find((o) => o.id === ativos[0])?.rotulo ?? ativos[0]) : ativos.length}`
                    : ''}
                </Dropdown.Toggle>
                <Dropdown.Menu className="p-2" style={{ maxHeight: '20rem', overflowY: 'auto', minWidth: '14rem' }}>
                  {opcoes.map((o) => (
                    <Form.Check
                      key={o.id}
                      id={`f-${d.id}-${o.id}`}
                      label={o.rotulo}
                      checked={ativos.includes(o.id)}
                      onChange={() => marcar(o.id)}
                      className="py-1"
                    />
                  ))}
                  {ativos.length > 0 && (
                    <Button
                      size="sm"
                      variant="link"
                      className="p-0 mt-1"
                      onClick={() => {
                        const q: Record<string, string | null> = { sel: null };
                        for (const dd of filtraveis) q[`f_${dd.id}`] = (p.filtros[dd.id] ?? []).join(',');
                        q[`f_${d.id}`] = '';
                        atualizar(q);
                      }}
                    >
                      Limpar
                    </Button>
                  )}
                </Dropdown.Menu>
              </Dropdown>
            );
          })}
      </div>

      {!p ? (
        <div className="text-center py-5">
          <Spinner />
        </div>
      ) : p.linhas.length === 0 ? (
        <Card className="card-app">
          <Card.Body className="text-muted">Nada no período com esses filtros.</Card.Body>
        </Card>
      ) : visao === 'evolucao' ? (
        <Evolucao
          p={p}
          selecionadas={selecionadas}
          alternar={alternarSel}
          fmt={fmt}
          abrir={abrir}
          rotuloDim={`${dimRotulo(p.dimensao)}${info.medida.formato === 'moeda' ? ' (R$)' : ''}`}
        />
      ) : (
        <Comparativo
          p={p}
          base={base}
          fmt={fmt}
          abrir={abrir}
          rotuloDim={`${dimRotulo(p.dimensao)}${info.medida.formato === 'moeda' ? ' (R$)' : ''}`}
        />
      )}
    </>
  );
}

type Abrir = (link: string | null, de: string, ate: string) => void;

function Evolucao({
  p,
  selecionadas,
  alternar,
  fmt,
  abrir,
  rotuloDim,
}: {
  p: Pivo;
  selecionadas: LinhaPivo[];
  alternar: (l: LinhaPivo) => void;
  fmt: (v: number) => string;
  abrir: Abrir;
  rotuloDim: string;
}) {
  const de = `${p.meses[0]}-01`;
  const ate = fimDoMes(p.meses[p.meses.length - 1]);
  const ids = new Set(selecionadas.map((l) => l.id));
  return (
    <>
      <Card className="card-app mb-3">
        <Card.Header>
          <i className="bi bi-graph-up" /> Evolução
          <span className="ms-auto small text-muted fw-normal nao-imprimir">
            marque até {MAX_SEL} linhas na tabela para comparar
          </span>
        </Card.Header>
        <Card.Body>
          {selecionadas.length ? (
            <GraficoSerie
              tipo="linha"
              rotulo="Evolução mês a mês"
              altura={18}
              dados={{
                tipo: 'serie',
                rotulos: p.meses.map(mesCurto),
                series: selecionadas.map((l) => ({ nome: l.rotulo, valores: l.valores, cor: l.cor })),
              }}
            />
          ) : (
            <p className="text-muted mb-0">Marque linhas na tabela para ver no gráfico.</p>
          )}
        </Card.Body>
      </Card>
      <Card className="card-app">
        <div className="pivo-scroll">
          <table className="pivo-tabela">
            <thead>
              <tr>
                <th className="pivo-nome">{rotuloDim}</th>
                {p.meses.map((m) => (
                  <th key={m}>{mesCurto(m)}</th>
                ))}
                <th className="pivo-total">Total</th>
                <th>Média</th>
              </tr>
            </thead>
            <tbody>
              {p.linhas.map((l) => (
                <tr key={l.id}>
                  <th scope="row" className="pivo-nome">
                    <Form.Check
                      inline
                      className="me-1 nao-imprimir"
                      id={`sel-${l.id}`}
                      aria-label={`Mostrar ${l.rotulo} no gráfico`}
                      checked={ids.has(l.id)}
                      onChange={() => alternar(l)}
                    />
                    <span className="color-dot" style={{ background: l.cor ?? 'var(--text-subtle)' }} />
                    {l.rotulo}
                  </th>
                  {l.valores.map((v, i) => (
                    <td
                      key={p.meses[i]}
                      className={`pivo-valor${l.link && v ? ' pivo-link' : ''}`}
                      onClick={l.link && v ? () => abrir(l.link, `${p.meses[i]}-01`, fimDoMes(p.meses[i])) : undefined}
                      title={l.link && v ? 'Ver o que entrou neste valor' : undefined}
                    >
                      {Math.abs(v) < 0.005 ? <span className="pivo-zero">–</span> : fmt(v)}
                    </td>
                  ))}
                  <td
                    className={`pivo-valor pivo-total${l.link ? ' pivo-link' : ''}`}
                    onClick={l.link ? () => abrir(l.link, de, ate) : undefined}
                  >
                    {fmt(l.total)}
                  </td>
                  <td className="pivo-valor text-muted">{fmt(l.media)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="pivo-nome">Total</th>
                {p.total.valores.map((v, i) => (
                  <td key={p.meses[i]} className="pivo-valor">
                    {fmt(v)}
                  </td>
                ))}
                <td className="pivo-valor">{fmt(p.total.total)}</td>
                <td className="pivo-valor">{fmt(p.total.media)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}

function Comparativo({
  p,
  base,
  fmt,
  abrir,
  rotuloDim,
}: {
  p: Pivo;
  base: number;
  fmt: (v: number) => string;
  abrir: Abrir;
  rotuloDim: string;
}) {
  const [ordem, setOrdem] = useState<'valor' | 'variacao'>('valor');
  const ultimo = p.meses.length - 1;
  const mes = p.meses[ultimo];
  const media = (vals: number[]) => {
    const ant = vals.slice(Math.max(0, ultimo - base), ultimo);
    return ant.length ? ant.reduce((a, x) => a + x, 0) / ant.length : 0;
  };
  const linhas = p.linhas
    .map((l) => {
      const atual = l.valores[ultimo];
      const ref = media(l.valores);
      const delta = atual - ref;
      return { l, atual, ref, delta, pct: ref ? (delta / Math.abs(ref)) * 100 : null };
    })
    .filter((x) => Math.abs(x.atual) >= 0.005 || Math.abs(x.ref) >= 0.005)
    .sort((a, b) =>
      ordem === 'valor' ? Math.abs(b.atual) - Math.abs(a.atual) : Math.abs(b.delta) - Math.abs(a.delta),
    );
  const totAtual = p.total.valores[ultimo];
  const totRef = media(p.total.valores);
  const cls = (delta: number) =>
    Math.abs(delta) < 0.005 || !p.sentido
      ? ''
      : delta > 0 === (p.sentido === 'menor-melhor')
        ? 'var-alta'
        : 'var-baixa';
  const seta = (delta: number) => (Math.abs(delta) < 0.005 ? '' : delta > 0 ? '▲ ' : '▼ ');
  const rotuloRef = base === 1 ? mesCurto(p.meses[ultimo - 1]) : `Média ${base} meses`;
  const topo = linhas.slice(0, 10);

  return (
    <>
      <Card className="card-app mb-3">
        <Card.Header>
          <i className="bi bi-bar-chart" /> {nomeMes(mes)} ×{' '}
          {base === 1 ? 'mês anterior' : `média dos ${base} meses anteriores`}
          <span className="ms-auto small fw-normal">
            {formatar(totAtual, 'moeda')} <span className="text-muted">vs. {formatar(totRef, 'moeda')}</span>{' '}
            <span className={cls(totAtual - totRef)}>
              {seta(totAtual - totRef)}
              {totRef ? `${Math.abs(((totAtual - totRef) / Math.abs(totRef)) * 100).toFixed(0)}%` : ''}
            </span>
          </span>
        </Card.Header>
        <Card.Body>
          <GraficoSerie
            rotulo="Comparativo"
            altura={18}
            dados={{
              tipo: 'serie',
              rotulos: topo.map((x) => (x.l.rotulo.length > 16 ? `${x.l.rotulo.slice(0, 15)}…` : x.l.rotulo)),
              series: [
                { nome: mesCurto(mes), valores: topo.map((x) => x.atual), cor: 'var(--serie-1)' },
                { nome: rotuloRef, valores: topo.map((x) => Math.round(x.ref * 100) / 100), cor: 'var(--text-subtle)' },
              ],
            }}
          />
        </Card.Body>
      </Card>
      <Card className="card-app">
        <Card.Header className="nao-imprimir">
          <span className="small text-muted fw-normal">Ordenar por</span>
          <ButtonGroup size="sm" className="ms-2">
            {(['valor', 'variacao'] as const).map((o) => (
              <ToggleButton
                key={o}
                id={`cmp-ordem-${o}`}
                type="radio"
                variant="outline-secondary"
                value={o}
                checked={ordem === o}
                onChange={() => setOrdem(o)}
              >
                {o === 'valor' ? `maior em ${mesCurto(mes)}` : 'maior variação'}
              </ToggleButton>
            ))}
          </ButtonGroup>
        </Card.Header>
        <div className="pivo-scroll">
          <table className="pivo-tabela">
            <thead>
              <tr>
                <th className="pivo-nome">{rotuloDim}</th>
                <th className="pivo-total">{mesCurto(mes)}</th>
                <th>{rotuloRef}</th>
                <th>Diferença</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((x) => (
                <tr key={x.l.id}>
                  <th scope="row" className="pivo-nome">
                    <span className="color-dot" style={{ background: x.l.cor ?? 'var(--text-subtle)' }} />
                    {x.l.rotulo}
                  </th>
                  <td
                    className={`pivo-valor pivo-total${x.l.link && x.atual ? ' pivo-link' : ''}`}
                    onClick={x.l.link && x.atual ? () => abrir(x.l.link, `${mes}-01`, fimDoMes(mes)) : undefined}
                  >
                    {fmt(x.atual)}
                  </td>
                  <td className="pivo-valor text-muted">{fmt(x.ref)}</td>
                  <td className={`pivo-valor ${cls(x.delta)}`}>
                    {seta(x.delta)}
                    {fmt(Math.abs(x.delta))}
                  </td>
                  <td className={`pivo-valor ${cls(x.delta)}`}>
                    {x.pct == null ? 'novo' : `${x.pct > 0 ? '+' : ''}${x.pct.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="pivo-nome">Total</th>
                <td className="pivo-valor">{fmt(totAtual)}</td>
                <td className="pivo-valor">{fmt(totRef)}</td>
                <td className={`pivo-valor ${cls(totAtual - totRef)}`}>
                  {seta(totAtual - totRef)}
                  {fmt(Math.abs(totAtual - totRef))}
                </td>
                <td className={`pivo-valor ${cls(totAtual - totRef)}`}>
                  {totRef
                    ? `${totAtual - totRef > 0 ? '+' : ''}${(((totAtual - totRef) / Math.abs(totRef)) * 100).toFixed(0)}%`
                    : ''}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <p className="small text-muted mt-2 nao-imprimir">Clique no valor do mês para ver o que entrou nele.</p>
    </>
  );
}
