import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Dropdown, Form, InputGroup, Pagination, Spinner, Table } from 'react-bootstrap';
import {
  canImport,
  getEntity,
  type BulkRequest,
  type BulkResponse,
  type FieldDef,
  type ListResponse,
  type RelationOption,
  type Row,
} from '@frame/shared';
import { api, download, errorMessage } from '../lib/api';
import { activeFilters, bulkEditableFields, filterableFields, listableFields, monthRange } from '../lib/listParams';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import Forbidden from './Forbidden';
import NotFound from './NotFound';
import PageHeader from '../components/PageHeader';
import ConfirmModal from '../components/ConfirmModal';
import type { Option } from '../components/FieldInput';
import { isNumeric, renderCell, renderTotal } from '../components/list/cells';
import PeriodNav from '../components/list/PeriodNav';
import FilterPanel from '../components/list/FilterPanel';
import ColumnChooser from '../components/list/ColumnChooser';
import BulkEditModal from '../components/list/BulkEditModal';
import ImportModal from '../components/list/ImportModal';

const PAGE_SIZES = [10, 25, 50, 100];

/** Colunas visíveis: guardadas por usuário e entidade neste navegador */
const colsKey = (userId: number | undefined, entity: string) => `frame:colunas:${userId ?? 0}:${entity}`;
function loadCols(key: string): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
function saveCols(key: string, cols: string[] | null) {
  try {
    if (cols) localStorage.setItem(key, JSON.stringify(cols));
    else localStorage.removeItem(key);
  } catch {
    /* navegador sem storage: só não lembra */
  }
}

type Confirm = { kind: 'excluir' | 'definitivo' | 'lote_excluir' | 'lote_definitivo'; row?: Row } | null;

interface Props {
  /** Entidade (padrão: a da URL) — para telas próprias que reaproveitam a listagem genérica */
  entity?: string;
  /** Conteúdo extra entre o título e a tabela (cards, avisos, gráficos...) */
  before?: ReactNode;
}

export default function CrudList(props: Props) {
  const params0 = useParams();
  const entity = props.entity ?? params0.entity ?? '';
  const ent = getEntity(entity);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can, user } = useAuth();
  const allowed = !!ent && can(entity, 'ver');
  const trash = params.get('lixeira') === '1';

  const q = params.get('q') || '';
  const page = Number(params.get('page')) || 1;
  const pageSize = PAGE_SIZES.includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 10;
  const sort = params.get('sort') || '';
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc';

  const [term, setTerm] = useState(q);
  const [data, setData] = useState<ListResponse>({ rows: [], total: 0, page: 1, pageSize });
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkErrors, setBulkErrors] = useState<BulkResponse['erros']>([]);
  const [relOptions, setRelOptions] = useState<Record<string, Option[]>>({});

  const key = colsKey(user?.id, entity);
  const [savedCols, setSavedCols] = useState<string[] | null>(() => loadCols(key));
  useEffect(() => setSavedCols(loadCols(key)), [key]);
  useEffect(() => setTerm(q), [q]);

  // Entidade com período: abre no mês atual (a menos que o usuário tenha escolhido outro)
  const periodField = ent?.periodField;
  useEffect(() => {
    if (!periodField) return;
    if (params.has(`${periodField}__de`) || params.has(`${periodField}__ate`) || params.get('periodo') === 'todos')
      return;
    const hoje = new Date();
    const r = monthRange(hoje.getFullYear(), hoje.getMonth());
    const next = new URLSearchParams(params);
    next.set(`${periodField}__de`, r.de);
    next.set(`${periodField}__ate`, r.ate);
    setParams(next, { replace: true });
  }, [periodField, params, setParams]);
  const waitingPeriod =
    !!periodField &&
    !params.has(`${periodField}__de`) &&
    !params.has(`${periodField}__ate`) &&
    params.get('periodo') !== 'todos';

  // Opções das relações usadas nos filtros e na edição em lote
  useEffect(() => {
    if (!ent || !allowed) return;
    const rels = [...filterableFields(ent), ...bulkEditableFields(ent)].filter(
      (f, i, arr) => f.type === 'relation' && getEntity(f.entity) && arr.findIndex((x) => x.name === f.name) === i,
    );
    for (const f of rels)
      api
        .get<RelationOption[]>(`/${f.entity}/opcoes?todos=1`)
        .then((opts) => setRelOptions((o) => ({ ...o, [f.name]: opts })))
        .catch(() => {});
  }, [ent, allowed]);

  const queryString = useCallback(
    (extra: Record<string, string> = {}) => {
      const qs = new URLSearchParams(params);
      qs.delete('periodo');
      for (const [k, v] of Object.entries(extra)) qs.set(k, v);
      return qs.toString();
    },
    [params],
  );

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<ListResponse>(`/${entity}?${queryString({ page: String(page), pageSize: String(pageSize) })}`)
      .then((d) => {
        setData(d);
        setSelected(new Set());
      })
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [entity, queryString, page, pageSize, toast]);

  useEffect(() => {
    if (allowed && !waitingPeriod) load();
  }, [allowed, waitingPeriod, load]);

  const available = useMemo(() => (ent ? listableFields(ent) : []), [ent]);
  const defaultCols = useMemo(() => available.filter((f) => f.list).map((f) => f.name), [available]);
  const labels = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(relOptions).map(([k, opts]) => [
          k,
          Object.fromEntries(opts.map((o) => [String(o.value), o.label])),
        ]),
      ),
    [relOptions],
  );

  if (!ent) return <NotFound />;
  if (!allowed) return <Forbidden />;
  const podeCriar = can(entity, 'criar');
  const podeEditar = can(entity, 'editar');
  const podeExcluir = can(entity, 'excluir');
  const podeImportar = !trash && podeCriar && canImport(entity, ent);

  const colNames = (savedCols ?? defaultCols).filter((n) => available.some((f) => f.name === n));
  const cols = available.filter((f) => colNames.includes(f.name));
  const pages = Math.max(1, Math.ceil(data.total / pageSize));
  const filters = activeFilters(ent, params, labels);
  const hasTotals = cols.some((f) => data.totais && f.name in data.totais);
  const selectable = podeExcluir || (podeEditar && !trash && bulkEditableFields(ent).length > 0);
  const allChecked = data.rows.length > 0 && data.rows.every((r) => selected.has(r.id));

  const update = (changes: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === '' || v == null) next.delete(k);
      else next.set(k, v);
    }
    if (!keepPage) next.delete('page');
    setParams(next);
  };

  const removeFilter = (keys: string[]) => {
    const next = new URLSearchParams(params);
    keys.forEach((k) => next.delete(k));
    next.delete('page');
    setParams(next);
  };

  const clickSort = (f: FieldDef) => {
    if (sort !== f.name) update({ sort: f.name, dir: 'asc' }, true);
    else if (dir === 'asc') update({ sort: f.name, dir: 'desc' }, true);
    else update({ sort: null, dir: null }, true);
  };

  const exportar = (formato: 'csv' | 'xlsx') => {
    download(`/${entity}/exportar?${queryString({ formato, colunas: colNames.join(',') })}`);
  };

  const toggleRow = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const runBulk = async (acao: BulkRequest['acao'], dados?: Record<string, unknown>) => {
    try {
      const r = await api.post<BulkResponse>(`/${entity}/lote`, { acao, ids: [...selected], dados });
      const verbo = {
        excluir: ent.lixeira ? 'enviado(s) à lixeira' : 'excluído(s)',
        excluir_definitivo: 'excluído(s) definitivamente',
        restaurar: 'restaurado(s)',
        editar: 'atualizado(s)',
      }[acao];
      if (r.ok) toast.success(`${r.ok} registro(s) ${verbo}`);
      if (r.erros.length) toast.error(`${r.erros.length} registro(s) não puderam ser alterados`);
      setBulkErrors(r.erros);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const removeOne = async (row: Row, definitivo: boolean) => {
    try {
      const r = await api.del<{ lixeira?: boolean } | null>(`/${entity}/${row.id}${definitivo ? '?definitivo=1' : ''}`);
      toast.success(r?.lixeira ? `${ent.singular} enviado para a lixeira` : `${ent.singular} excluído`);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // liga/desliga na linha (campos com inlineEdit): grava só o campo, com as regras da edição
  const toggleInline = async (f: FieldDef, row: Row) => {
    const novo = !row[f.name];
    setToggling(row.id);
    try {
      const salvo = await api.put<Row>(`/${entity}/${row.id}`, { [f.name]: novo });
      setData((d) => ({ ...d, rows: d.rows.map((r) => (r.id === row.id ? { ...r, ...salvo } : r)) }));
      if (!!salvo[f.name] !== novo) toast.info(`${f.label}: não foi possível alterar este registro`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setToggling(null);
    }
  };

  const restoreOne = async (row: Row) => {
    try {
      await api.post(`/${entity}/${row.id}/restaurar`);
      toast.success(`${ent.singular} restaurado`);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === 'excluir' && c.row) await removeOne(c.row, false);
    if (c.kind === 'definitivo' && c.row) await removeOne(c.row, true);
    if (c.kind === 'lote_excluir') await runBulk('excluir');
    if (c.kind === 'lote_definitivo') await runBulk('excluir_definitivo');
  };

  const nomeDe = (row?: Row) => String(row?.[ent.labelField] ?? '');
  const confirmText: Record<NonNullable<Confirm>['kind'], { title: string; msg: ReactNode; label: string }> = {
    excluir: ent.lixeira
      ? {
          title: 'Enviar para a lixeira',
          msg: (
            <>
              Enviar <b>{nomeDe(confirm?.row)}</b> para a lixeira? Dá para restaurar depois.
            </>
          ),
          label: 'Enviar',
        }
      : {
          title: `Excluir ${ent.singular.toLowerCase()}`,
          msg: (
            <>
              Tem certeza que deseja excluir <b>{nomeDe(confirm?.row)}</b>? Essa ação não pode ser desfeita.
            </>
          ),
          label: 'Excluir',
        },
    definitivo: {
      title: 'Excluir definitivamente',
      msg: (
        <>
          Excluir <b>{nomeDe(confirm?.row)}</b> para sempre? Essa ação não pode ser desfeita.
        </>
      ),
      label: 'Excluir',
    },
    lote_excluir: {
      title: ent.lixeira ? 'Enviar para a lixeira' : 'Excluir registros',
      msg: ent.lixeira
        ? `Enviar ${selected.size} registro(s) para a lixeira?`
        : `Excluir ${selected.size} registro(s)? Essa ação não pode ser desfeita.`,
      label: ent.lixeira ? 'Enviar' : 'Excluir',
    },
    lote_definitivo: {
      title: 'Excluir definitivamente',
      msg: `Excluir ${selected.size} registro(s) para sempre? Essa ação não pode ser desfeita.`,
      label: 'Excluir',
    },
  };
  const ct = confirm ? confirmText[confirm.kind] : null;

  const sortIcon = (f: FieldDef) =>
    sort === f.name ? (
      <i className={`bi bi-arrow-${dir === 'asc' ? 'up' : 'down'} ms-1`} />
    ) : (
      <i className="bi bi-arrow-down-up ms-1 sort-idle" />
    );

  return (
    <>
      <PageHeader
        title={trash ? `Lixeira · ${ent.label}` : ent.label}
        icon={trash ? 'trash3' : ent.icon}
        subtitle={`${data.total} registro(s)`}
        back={trash ? `/${entity}` : undefined}
      >
        {!trash && ent.lixeira && podeExcluir && (
          <Link to={`/${entity}?lixeira=1`} className="btn btn-light border" title="Lixeira">
            <i className="bi bi-trash3" />
            <span className="d-none d-md-inline ms-1">Lixeira</span>
          </Link>
        )}
        {!trash && podeCriar && (
          <Link to={`/${entity}/novo`} className="btn btn-primary">
            <i className="bi bi-plus-lg me-1" /> Novo {ent.singular.toLowerCase()}
          </Link>
        )}
      </PageHeader>

      {trash && (
        <Alert variant="light" className="border small">
          <i className="bi bi-info-circle me-2" />
          Registros na lixeira não aparecem nas telas nem nos relatórios. Restaure para voltar a usá-los.
        </Alert>
      )}

      {props.before}

      {bulkErrors.length > 0 && (
        <Alert variant="warning" dismissible onClose={() => setBulkErrors([])} className="small">
          <div className="fw-bold mb-1">Alguns registros não foram alterados:</div>
          <ul className="mb-0 ps-3">
            {bulkErrors.slice(0, 10).map((e) => (
              <li key={e.id}>
                #{e.id}: {e.error}
              </li>
            ))}
            {bulkErrors.length > 10 && <li>… e mais {bulkErrors.length - 10}</li>}
          </ul>
        </Alert>
      )}

      <Card className="card-app">
        <Card.Header className="list-toolbar">
          {periodField && <PeriodNav field={periodField} params={params} setParams={setParams} />}
          <Form
            className="list-search"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: term.trim() });
            }}
          >
            <InputGroup size="sm">
              <InputGroup.Text className="bg-body">
                <i className="bi bi-search" />
              </InputGroup.Text>
              <Form.Control placeholder="Buscar..." value={term} onChange={(e) => setTerm(e.target.value)} />
              {q && (
                <Button variant="light" onClick={() => update({ q: '' })} aria-label="Limpar busca">
                  <i className="bi bi-x-lg" />
                </Button>
              )}
            </InputGroup>
          </Form>
          <div className="list-actions">
            <Button variant="light" size="sm" className="border" onClick={() => setShowFilters(true)}>
              <i className="bi bi-funnel" />
              <span className="d-none d-xl-inline ms-1">Filtros</span>
              {filters.length > 0 && <span className="badge rounded-pill bg-primary ms-1">{filters.length}</span>}
            </Button>
            <ColumnChooser
              fields={available}
              visible={colNames}
              onChange={(c) => {
                setSavedCols(c);
                saveCols(key, c);
              }}
              onReset={() => {
                setSavedCols(null);
                saveCols(key, null);
              }}
            />
            <Dropdown align="end">
              <Dropdown.Toggle
                variant="light"
                size="sm"
                className="border"
                title={podeImportar ? 'Exportar ou importar planilha' : 'Exportar'}
              >
                <i className={`bi bi-${podeImportar ? 'file-earmark-spreadsheet' : 'download'}`} />
                <span className="d-none d-xl-inline ms-1">{podeImportar ? 'Planilha' : 'Exportar'}</span>
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Header>Exportar o que está na tela</Dropdown.Header>
                <Dropdown.Item onClick={() => exportar('xlsx')}>
                  <i className="bi bi-file-earmark-excel me-2 text-success" />
                  Excel (.xlsx)
                </Dropdown.Item>
                <Dropdown.Item onClick={() => exportar('csv')}>
                  <i className="bi bi-filetype-csv me-2" />
                  CSV
                </Dropdown.Item>
                {podeImportar && (
                  <>
                    <Dropdown.Divider />
                    <Dropdown.Item onClick={() => setShowImport(true)}>
                      <i className="bi bi-upload me-2" />
                      Importar planilha...
                    </Dropdown.Item>
                  </>
                )}
              </Dropdown.Menu>
            </Dropdown>
          </div>
          {filters.length > 0 && (
            <div className="list-chips">
              {filters.map((f) => (
                <span key={f.keys.join()} className="filter-chip">
                  {f.text}
                  <button onClick={() => removeFilter(f.keys)} aria-label="Remover filtro">
                    <i className="bi bi-x" />
                  </button>
                </span>
              ))}
              {filters.length > 1 && (
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 ms-1"
                  onClick={() => removeFilter(filters.flatMap((f) => f.keys))}
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          )}
        </Card.Header>

        {selected.size > 0 && (
          <div className="bulk-bar">
            <span className="fw-bold">{selected.size} selecionado(s)</span>
            <div className="d-flex gap-2 flex-wrap">
              {trash ? (
                <>
                  <Button size="sm" variant="light" onClick={() => runBulk('restaurar')}>
                    <i className="bi bi-arrow-counterclockwise me-1" /> Restaurar
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setConfirm({ kind: 'lote_definitivo' })}>
                    <i className="bi bi-x-octagon me-1" /> Excluir definitivamente
                  </Button>
                </>
              ) : (
                <>
                  {podeEditar && bulkEditableFields(ent).length > 0 && (
                    <Button size="sm" variant="light" onClick={() => setShowBulkEdit(true)}>
                      <i className="bi bi-pencil-square me-1" /> Editar
                    </Button>
                  )}
                  {podeExcluir && (
                    <Button size="sm" variant="danger" onClick={() => setConfirm({ kind: 'lote_excluir' })}>
                      <i className="bi bi-trash me-1" /> {ent.lixeira ? 'Enviar à lixeira' : 'Excluir'}
                    </Button>
                  )}
                </>
              )}
              <Button size="sm" variant="link" className="text-white" onClick={() => setSelected(new Set())}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : data.rows.length === 0 ? (
            <div className="text-center text-muted py-5">
              <i className={`bi bi-${trash ? 'trash3' : 'inbox'} fs-1 d-block mb-2`} />
              {trash ? 'A lixeira está vazia' : 'Nenhum registro encontrado'}
            </div>
          ) : (
            <Table responsive hover className="table-app mb-0">
              <thead>
                <tr>
                  {selectable && (
                    <th className="ps-4 col-check">
                      <Form.Check
                        aria-label="Selecionar todos"
                        checked={allChecked}
                        onChange={() => setSelected(allChecked ? new Set() : new Set(data.rows.map((r) => r.id)))}
                      />
                    </th>
                  )}
                  {cols.map((f) => (
                    <th
                      key={f.name}
                      className={`sortable${isNumeric(f) ? ' text-end' : ''}${sort === f.name ? ' sorted' : ''}`}
                      onClick={() => clickSort(f)}
                      aria-sort={sort === f.name ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {f.label}
                      {sortIcon(f)}
                    </th>
                  ))}
                  <th className="text-end pe-4">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`${trash ? '' : 'cursor-pointer'}${selected.has(row.id) ? ' table-active' : ''}`}
                    onClick={() => !trash && navigate(`/${entity}/${row.id}`)}
                  >
                    {selectable && (
                      <td className="ps-4 col-check" onClick={(e) => e.stopPropagation()}>
                        <Form.Check
                          aria-label={`Selecionar ${nomeDe(row)}`}
                          checked={selected.has(row.id)}
                          onChange={() => toggleRow(row.id)}
                        />
                      </td>
                    )}
                    {cols.map((f) => (
                      <td key={f.name} className={isNumeric(f) ? 'text-end text-nowrap' : undefined}>
                        {renderCell(
                          f,
                          row,
                          podeEditar && !trash ? { onToggle: toggleInline, busy: toggling === row.id } : undefined,
                        )}
                      </td>
                    ))}
                    <td className="text-end pe-4 text-nowrap" onClick={(e) => e.stopPropagation()}>
                      {trash ? (
                        <>
                          <Button
                            size="sm"
                            variant="light"
                            className="me-1"
                            title="Restaurar"
                            onClick={() => restoreOne(row)}
                          >
                            <i className="bi bi-arrow-counterclockwise" />
                          </Button>
                          <Button
                            size="sm"
                            variant="light"
                            className="text-danger"
                            title="Excluir definitivamente"
                            onClick={() => setConfirm({ kind: 'definitivo', row })}
                          >
                            <i className="bi bi-x-octagon" />
                          </Button>
                        </>
                      ) : (
                        <>
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
                              title={ent.lixeira ? 'Enviar à lixeira' : 'Excluir'}
                              onClick={() => setConfirm({ kind: 'excluir', row })}
                            >
                              <i className="bi bi-trash" />
                            </Button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {hasTotals && (
                <tfoot>
                  <tr className="table-total">
                    {selectable && <td className="ps-4" />}
                    {cols.map((f, i) => (
                      <td key={f.name} className={isNumeric(f) ? 'text-end text-nowrap' : undefined}>
                        {data.totais && f.name in data.totais
                          ? renderTotal(f, data.totais[f.name])
                          : i === 0
                            ? `Total (${data.total})`
                            : null}
                      </td>
                    ))}
                    <td className="pe-4" />
                  </tr>
                </tfoot>
              )}
            </Table>
          )}
        </Card.Body>

        {data.total > PAGE_SIZES[0] && (
          <Card.Footer className="bg-body d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div className="d-flex align-items-center gap-2 small text-muted">
              <Form.Select
                size="sm"
                style={{ width: 'auto' }}
                value={pageSize}
                aria-label="Registros por página"
                onChange={(e) => update({ pageSize: e.target.value })}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} por página
                  </option>
                ))}
              </Form.Select>
              <span>
                Página {page} de {pages}
              </span>
            </div>
            {pages > 1 && (
              <Pagination className="mb-0" size="sm">
                <Pagination.Prev disabled={page <= 1} onClick={() => update({ page: String(page - 1) }, true)} />
                {Array.from({ length: pages }, (_, i) => i + 1)
                  .filter((p) => Math.abs(p - page) <= 2 || p === 1 || p === pages)
                  .map((p, i, arr) => (
                    <span key={p} className="d-flex">
                      {i > 0 && p - arr[i - 1] > 1 && <Pagination.Ellipsis disabled />}
                      <Pagination.Item active={p === page} onClick={() => update({ page: String(p) }, true)}>
                        {p}
                      </Pagination.Item>
                    </span>
                  ))}
                <Pagination.Next disabled={page >= pages} onClick={() => update({ page: String(page + 1) }, true)} />
              </Pagination>
            )}
          </Card.Footer>
        )}
      </Card>

      <FilterPanel
        show={showFilters}
        onHide={() => setShowFilters(false)}
        ent={ent}
        params={params}
        onApply={(next) => setParams(next)}
        relOptions={relOptions}
      />

      {podeImportar && (
        <ImportModal show={showImport} entity={entity} ent={ent} onHide={() => setShowImport(false)} onDone={load} />
      )}

      <BulkEditModal
        show={showBulkEdit}
        ent={ent}
        count={selected.size}
        relOptions={relOptions}
        onCancel={() => setShowBulkEdit(false)}
        onConfirm={(dados) => {
          setShowBulkEdit(false);
          runBulk('editar', dados);
        }}
      />

      <ConfirmModal
        show={!!ct}
        title={ct?.title}
        message={ct?.msg ?? ''}
        confirmLabel={ct?.label}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
