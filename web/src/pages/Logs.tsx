import { Fragment, useEffect, useState } from 'react';
import { Card, Form, Pagination, Spinner, Table } from 'react-bootstrap';
import { entities, getEntity, type ListResponse, type LogRow } from '@frame/shared';
import { api, errorMessage } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import ValueBadge from '../components/ValueBadge';

const ACAO_COLORS: Record<string, string> = {
  criação: '#2b8a5a',
  alteração: '#2f6fed',
  exclusão: '#e03e3e',
  login: '#0ea5e9',
  logout: '#64748b',
  'login falhou': '#e03e3e',
  'senha alterada': '#7048e8',
  'senha redefinida': '#7048e8',
  'redefinição solicitada': '#a855f7',
  'acesso recuperado': '#f08c2e',
  backup: '#7048e8',
  seed: '#7a8290',
  configuração: '#f08c2e',
};
const PAGE_SIZE = 15;

const ENTIDADES = [
  ...Object.entries(entities).map(([k, e]) => ({ value: k, label: e.label })),
  { value: 'auth', label: 'Acessos (login/senha)' },
  { value: 'sistema', label: 'Sistema' },
];

const entityLabel = (key: string | null) => ENTIDADES.find((e) => e.value === key)?.label ?? key ?? '—';

function fmtValue(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    if (!entries.length) return '(nenhuma)';
    return entries.map(([k, a]) => `${entityLabel(k)}: ${Array.isArray(a) ? a.join(', ') : String(a)}`).join(' · ');
  }
  return String(v);
}

/** Tabela "campo / antes / depois" de um log */
function Changes({ log }: { log: LogRow }) {
  const ent = getEntity(log.entidade ?? undefined);
  const label = (campo: string) => ent?.fields.find((f) => f.name === campo)?.label ?? campo;
  const rows = Object.entries(log.alteracoes ?? {});
  const temDe = rows.some(([, c]) => 'de' in c);
  const temPara = rows.some(([, c]) => 'para' in c);
  return (
    <Table size="sm" className="changes-table mb-0">
      <thead>
        <tr>
          <th>Campo</th>
          {temDe && <th>{temPara ? 'Antes' : 'Valor'}</th>}
          {temPara && <th>{temDe ? 'Depois' : 'Valor'}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(([campo, c]) => (
          <tr key={campo}>
            <td className="fw-semibold text-nowrap">{label(campo)}</td>
            {temDe && <td className={temPara ? 'text-danger-emphasis' : ''}>{fmtValue(c.de)}</td>}
            {temPara && <td className={temDe ? 'text-success-emphasis' : ''}>{fmtValue(c.para)}</td>}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default function Logs() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [entidade, setEntidade] = useState('');
  const [data, setData] = useState<ListResponse<LogRow> | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (entidade) qs.set('entidade', entidade);
    api
      .get<ListResponse<LogRow>>(`/logs?${qs}`)
      .then(setData)
      .catch((e) => toast.error(errorMessage(e)));
  }, [page, entidade, toast]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader title="Logs" icon="journal-text" subtitle="Quem fez o quê, quando e de onde">
        <Form.Select
          size="sm"
          value={entidade}
          onChange={(e) => {
            setEntidade(e.target.value);
            setPage(1);
          }}
          style={{ minWidth: 220 }}
          aria-label="Filtrar por área"
        >
          <option value="">Todas as áreas</option>
          {ENTIDADES.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </Form.Select>
      </PageHeader>
      <Card className="card-app">
        <Card.Body className="p-0">
          {!data ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : data.rows.length === 0 ? (
            <div className="text-center text-muted py-5">Nenhum registro</div>
          ) : (
            <Table responsive hover className="table-app mb-0">
              <thead>
                <tr>
                  <th className="ps-4">Data</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Área</th>
                  <th>Detalhe</th>
                  <th className="pe-4">IP</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((l) => {
                  const temDiff = !!l.alteracoes && Object.keys(l.alteracoes).length > 0;
                  const open = aberto === l.id;
                  return (
                    <Fragment key={l.id}>
                      <tr
                        className={temDiff ? 'cursor-pointer' : ''}
                        onClick={() => temDiff && setAberto(open ? null : l.id)}
                        aria-expanded={temDiff ? open : undefined}
                      >
                        <td className="ps-4 text-nowrap">
                          {temDiff && <i className={`bi bi-chevron-${open ? 'down' : 'right'} me-1 small`} />}
                          {fmtDate(l.criado_em, true)}
                        </td>
                        <td className="text-nowrap">{l.usuario ?? '—'}</td>
                        <td>
                          <ValueBadge value={l.acao} colors={ACAO_COLORS} />
                        </td>
                        <td>
                          {entityLabel(l.entidade)}
                          {l.registro_id ? <span className="text-muted small"> #{l.registro_id}</span> : null}
                        </td>
                        <td>{l.detalhe}</td>
                        <td className="pe-4 text-muted small text-nowrap">{l.ip ?? '—'}</td>
                      </tr>
                      {open && (
                        <tr className="changes-row">
                          <td colSpan={6} className="px-4 py-3">
                            <Changes log={l} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card.Body>
        {pages > 1 && (
          <Card.Footer className="bg-white d-flex justify-content-end">
            <Pagination size="sm" className="mb-0">
              <Pagination.Prev disabled={page <= 1} onClick={() => setPage(page - 1)} />
              <Pagination.Item active>
                {page} / {pages}
              </Pagination.Item>
              <Pagination.Next disabled={page >= pages} onClick={() => setPage(page + 1)} />
            </Pagination>
          </Card.Footer>
        )}
      </Card>
    </>
  );
}
