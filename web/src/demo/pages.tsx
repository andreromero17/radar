// =============================================================================
// Telas próprias do módulo de demonstração — três jeitos de customizar:
//   1. Movimentos: listagem genérica + cards de resumo em cima (slot `before`)
//   2. Categorias: listagem trocada por cards (com opção de voltar à tabela genérica)
//   3. Resumo por categoria: página nova, com rota e permissão próprias
// =============================================================================
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, ButtonGroup, Card, Col, ProgressBar, Row as BsRow, Spinner } from 'react-bootstrap';
import type { ListResponse, Row } from '@frame/shared';
import { api, errorMessage } from '../lib/api';
import { fmtMoney } from '../lib/format';
import { asMonth, monthLabel, monthRange } from '../lib/listParams';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import CrudList from '../pages/CrudList';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import ValueBadge from '../components/ValueBadge';
import PeriodNav from '../components/list/PeriodNav';

/** Filtro de período da URL (o mesmo que a listagem usa) */
function usePeriodo() {
  const [params, setParams] = useSearchParams();
  const de = params.get('data__de');
  const ate = params.get('data__ate');
  return { params, setParams, de, ate, qs: `${de ? `&data__de=${de}` : ''}${ate ? `&data__ate=${ate}` : ''}` };
}

// ---------------------------------------------------------------- 1. slot
function ResumoPeriodo() {
  const { de, ate, qs, params } = usePeriodo();
  const [tot, setTot] = useState<{ receitas: number; despesas: number } | null>(null);
  const pronto = !!(de || ate || params.get('periodo') === 'todos');
  useEffect(() => {
    if (!pronto) return;
    const soma = (tipo: string) =>
      api.get<ListResponse>(`/demo_movimentos?tipo=${tipo}&pageSize=1${qs}`).then((r) => r.totais?.valor ?? 0);
    Promise.all([soma('Receita'), soma('Despesa')])
      .then(([receitas, despesas]) => setTot({ receitas, despesas }))
      .catch(() => setTot(null));
  }, [qs, pronto]);
  return (
    <BsRow className="g-3 mb-3">
      <Col md={4}>
        <StatCard label="Receitas" icon="arrow-up-circle" color="green" value={tot && fmtMoney(tot.receitas)} />
      </Col>
      <Col md={4}>
        <StatCard label="Despesas" icon="arrow-down-circle" color="red" value={tot && fmtMoney(tot.despesas)} />
      </Col>
      <Col md={4}>
        <StatCard
          label="Saldo do período"
          icon="wallet2"
          color="blue"
          value={tot && fmtMoney(tot.receitas + tot.despesas)}
        />
      </Col>
    </BsRow>
  );
}

// ---------------------------------------------------------------- 2. lista própria
export function CategoriasCards() {
  const { can } = useAuth();
  const toast = useToast();
  const [modo, setModo] = useState<'cards' | 'tabela'>('cards');
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    if (modo !== 'cards') return;
    api
      .get<ListResponse>('/demo_categorias?pageSize=200&sort=nome&dir=asc')
      .then((r) => setRows(r.rows))
      .catch((e) => toast.error(errorMessage(e)));
  }, [modo, toast]);

  const alternar = (
    <ButtonGroup size="sm" className="mb-3">
      <Button variant={modo === 'cards' ? 'primary' : 'light'} onClick={() => setModo('cards')}>
        <i className="bi bi-grid-3x3-gap me-1" /> Cards
      </Button>
      <Button variant={modo === 'tabela' ? 'primary' : 'light'} onClick={() => setModo('tabela')}>
        <i className="bi bi-table me-1" /> Tabela
      </Button>
    </ButtonGroup>
  );

  // a tabela genérica continua disponível dentro da tela própria
  if (modo === 'tabela') return <CrudList entity="demo_categorias" before={alternar} />;

  return (
    <>
      <PageHeader title="Categorias (demo)" icon="tags" subtitle="Tela própria (web/src/demo/pages.tsx)">
        {can('demo_categorias', 'criar') && (
          <Link to="/demo_categorias/novo" className="btn btn-primary">
            <i className="bi bi-plus-lg me-1" /> Nova categoria
          </Link>
        )}
      </PageHeader>
      {alternar}
      {!rows ? (
        <div className="text-center py-5">
          <Spinner />
        </div>
      ) : (
        <BsRow className="g-3">
          {rows.map((c) => (
            <Col key={c.id} xs={6} md={4} xl={3}>
              <Link to={`/demo_categorias/${c.id}`} className="text-decoration-none">
                <Card className="card-app h-100 categoria-card" style={{ borderTop: `4px solid ${String(c.cor)}` }}>
                  <Card.Body>
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <span className="color-dot" style={{ background: String(c.cor) }} />
                      <span className="fw-bold text-body">{String(c.nome)}</span>
                    </div>
                    <ValueBadge value={c.tipo} colors={{ Receita: '#2b8a5a', Despesa: '#e03e3e' }} />
                  </Card.Body>
                </Card>
              </Link>
            </Col>
          ))}
        </BsRow>
      )}
    </>
  );
}

// ---------------------------------------------------------------- 3. página nova
export function ResumoCategorias() {
  const { params, setParams, de, ate, qs } = usePeriodo();
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);

  // abre no mês atual, como a listagem
  useEffect(() => {
    if (de || ate || params.get('periodo') === 'todos') return;
    const hoje = new Date();
    const r = monthRange(hoje.getFullYear(), hoje.getMonth());
    setParams({ data__de: r.de, data__ate: r.ate }, { replace: true });
  }, [de, ate, params, setParams]);

  useEffect(() => {
    if (!de && !ate && params.get('periodo') !== 'todos') return;
    setRows(null);
    api
      .get<ListResponse>(`/demo_movimentos?pageSize=1000${qs}`)
      .then((r) => setRows(r.rows))
      .catch((e) => toast.error(errorMessage(e)));
  }, [qs, de, ate, params, toast]);

  const grupos = (tipo: string) => {
    const m = new Map<string, number>();
    for (const r of rows ?? [])
      if (r.tipo === tipo) {
        const k = String(r.categoria_id__label ?? 'Sem categoria');
        m.set(k, (m.get(k) ?? 0) + Math.abs(Number(r.valor)));
      }
    const lista = [...m].sort((a, b) => b[1] - a[1]);
    const total = lista.reduce((a, [, v]) => a + v, 0);
    return { lista, total };
  };
  const mes = asMonth(de, ate);

  return (
    <>
      <PageHeader
        title="Resumo por categoria"
        icon="pie-chart"
        subtitle={mes ? monthLabel(mes.year, mes.month) : 'Página própria registrada com registerPage()'}
      />
      <div className="mb-3">
        <PeriodNav field="data" params={params} setParams={setParams} />
      </div>
      {!rows ? (
        <div className="text-center py-5">
          <Spinner />
        </div>
      ) : (
        <BsRow className="g-3">
          {(['Despesa', 'Receita'] as const).map((tipo) => {
            const { lista, total } = grupos(tipo);
            return (
              <Col key={tipo} lg={6}>
                <Card className="card-app h-100">
                  <Card.Header>
                    {tipo === 'Despesa' ? 'Despesas' : 'Receitas'}
                    <span className={`ms-auto ${tipo === 'Despesa' ? 'text-danger' : 'text-success'}`}>
                      {fmtMoney(total)}
                    </span>
                  </Card.Header>
                  <Card.Body>
                    {lista.length === 0 && <p className="text-muted mb-0">Nada no período.</p>}
                    {lista.map(([nome, valor]) => (
                      <div key={nome} className="mb-3">
                        <div className="d-flex justify-content-between small fw-semibold mb-1">
                          <span>{nome}</span>
                          <span>
                            {fmtMoney(valor)} <span className="text-muted">({Math.round((valor / total) * 100)}%)</span>
                          </span>
                        </div>
                        <ProgressBar
                          now={(valor / total) * 100}
                          variant={tipo === 'Despesa' ? 'danger' : 'success'}
                          style={{ height: 8 }}
                        />
                      </div>
                    ))}
                  </Card.Body>
                </Card>
              </Col>
            );
          })}
        </BsRow>
      )}
    </>
  );
}

export function MovimentosComResumo() {
  return <CrudList entity="demo_movimentos" before={<ResumoPeriodo />} />;
}
