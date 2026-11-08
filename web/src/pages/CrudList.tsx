import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Card, Form, InputGroup, Pagination, Spinner, Table } from 'react-bootstrap';
import { getEntity, type FieldDef, type ListResponse, type Row } from '@frame/shared';
import { api, errorMessage } from '../lib/api';
import { fmtDate, fmtMoney } from '../lib/format';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import Forbidden from './Forbidden';
import PageHeader from '../components/PageHeader';
import ValueBadge from '../components/ValueBadge';
import ConfirmModal from '../components/ConfirmModal';
import NotFound from './NotFound';

const PAGE_SIZE = 10;
const BOOL_COLORS = { Sim: '#2b8a5a', Não: '#adb5bd' };

function renderCell(f: FieldDef, row: Row) {
  const v = row[f.name];
  switch (f.type) {
    case 'relation':
      return (row[`${f.name}__label`] as string) ?? <span className="text-muted">—</span>;
    case 'boolean':
      return <ValueBadge value={v ? 'Sim' : 'Não'} colors={BOOL_COLORS} />;
    case 'select':
      return f.colors ? <ValueBadge value={v} colors={f.colors} /> : String(v ?? '—');
    case 'money':
      return fmtMoney(v);
    case 'date':
      return fmtDate(v);
    case 'datetime':
      return v ? fmtDate(v, true) : <span className="text-muted">—</span>;
    default:
      return v == null || v === '' ? <span className="text-muted">—</span> : String(v);
  }
}

export default function CrudList() {
  const { entity = '' } = useParams();
  const ent = getEntity(entity);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const allowed = !!ent && can(entity, 'ver');

  const q = params.get('q') || '';
  const page = Number(params.get('page')) || 1;
  const [term, setTerm] = useState(q);
  const [data, setData] = useState<ListResponse>({ rows: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState<Row | null>(null);

  useEffect(() => setTerm(q), [q]);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams(params);
    qs.set('page', String(page));
    qs.set('pageSize', String(PAGE_SIZE));
    api
      .get<ListResponse>(`/${entity}?${qs}`)
      .then(setData)
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [entity, params, page, toast]);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  if (!ent) return <NotFound />;
  if (!allowed) return <Forbidden />;
  const podeCriar = can(entity, 'criar');
  const podeEditar = can(entity, 'editar');
  const podeExcluir = can(entity, 'excluir');

  const cols = ent.fields.filter((f) => f.list);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  // filtros vindos da URL (ex.: ?status=Aberto) viram "chips" removíveis
  const filters = ent.fields.filter((f) => params.get(f.name));

  const setParam = (key: string, value: string | number | null) => {
    const next = new URLSearchParams(params);
    if (value === '' || value == null) next.delete(key);
    else next.set(key, String(value));
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await api.del(`/${entity}/${toDelete.id}`);
      toast.success(`${ent.singular} excluído`);
      setToDelete(null);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title={ent.label} icon={ent.icon} subtitle={`${data.total} registro(s)`}>
        {podeCriar && (
          <Link to={`/${entity}/novo`} className="btn btn-primary">
            <i className="bi bi-plus-lg me-1" /> Novo {ent.singular.toLowerCase()}
          </Link>
        )}
      </PageHeader>

      <Card className="card-app">
        <Card.Header className="flex-wrap">
          <Form
            className="flex-grow-1"
            style={{ maxWidth: 420 }}
            onSubmit={(e) => {
              e.preventDefault();
              setParam('q', term.trim());
            }}
          >
            <InputGroup>
              <InputGroup.Text className="bg-white">
                <i className="bi bi-search" />
              </InputGroup.Text>
              <Form.Control placeholder="Buscar..." value={term} onChange={(e) => setTerm(e.target.value)} />
              {q && (
                <Button variant="light" onClick={() => setParam('q', '')} aria-label="Limpar busca">
                  <i className="bi bi-x-lg" />
                </Button>
              )}
            </InputGroup>
          </Form>
          {filters.map((f) => (
            <span key={f.name} className="filter-chip">
              {f.label}: {f.type === 'boolean' ? (params.get(f.name) === '1' ? 'Sim' : 'Não') : params.get(f.name)}
              <button onClick={() => setParam(f.name, '')} aria-label="Remover filtro">
                <i className="bi bi-x" />
              </button>
            </span>
          ))}
        </Card.Header>

        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : data.rows.length === 0 ? (
            <div className="text-center text-muted py-5">
              <i className="bi bi-inbox fs-1 d-block mb-2" />
              Nenhum registro encontrado
            </div>
          ) : (
            <Table responsive hover className="table-app mb-0">
              <thead>
                <tr>
                  <th className="ps-4">#</th>
                  {cols.map((f) => (
                    <th key={f.name}>{f.label}</th>
                  ))}
                  <th className="text-end pe-4">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="cursor-pointer" onClick={() => navigate(`/${entity}/${row.id}`)}>
                    <td className="ps-4 text-muted">{row.id}</td>
                    {cols.map((f) => (
                      <td key={f.name}>{renderCell(f, row)}</td>
                    ))}
                    <td className="text-end pe-4 text-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Link
                        to={`/${entity}/${row.id}`}
                        className="btn btn-sm btn-light me-1"
                        title={podeEditar ? 'Editar' : 'Visualizar'}
                      >
                        <i className={`bi bi-${podeEditar ? 'pencil' : 'eye'}`} />
                      </Link>
                      {podeExcluir && (
                        <Button
                          size="sm"
                          variant="light"
                          className="text-danger"
                          title="Excluir"
                          onClick={() => setToDelete(row)}
                        >
                          <i className="bi bi-trash" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>

        {pages > 1 && (
          <Card.Footer className="bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span className="small text-muted">
              Página {page} de {pages}
            </span>
            <Pagination className="mb-0" size="sm">
              <Pagination.Prev disabled={page <= 1} onClick={() => setParam('page', page - 1)} />
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((p) => Math.abs(p - page) <= 2 || p === 1 || p === pages)
                .map((p, i, arr) => (
                  <span key={p} className="d-flex">
                    {i > 0 && p - arr[i - 1] > 1 && <Pagination.Ellipsis disabled />}
                    <Pagination.Item active={p === page} onClick={() => setParam('page', p)}>
                      {p}
                    </Pagination.Item>
                  </span>
                ))}
              <Pagination.Next disabled={page >= pages} onClick={() => setParam('page', page + 1)} />
            </Pagination>
          </Card.Footer>
        )}
      </Card>

      <ConfirmModal
        show={!!toDelete}
        title={`Excluir ${ent.singular.toLowerCase()}`}
        message={
          <>
            Tem certeza que deseja excluir <b>{String(toDelete?.[ent.labelField] ?? '')}</b>? Essa ação não pode ser
            desfeita.
          </>
        }
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
