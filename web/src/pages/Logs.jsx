import { useEffect, useState } from 'react';
import { Card, Pagination, Spinner, Table } from 'react-bootstrap';
import { api } from '../lib/api';
import { fmtDate } from '../lib/format';
import PageHeader from '../components/PageHeader';
import ValueBadge from '../components/ValueBadge';

const ACAO_COLORS = { criação: '#2b8a5a', alteração: '#2f6fed', exclusão: '#e03e3e', backup: '#7048e8', seed: '#7a8290', configuração: '#f08c2e' };
const PAGE_SIZE = 15;

export default function Logs() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/logs?page=${page}&pageSize=${PAGE_SIZE}`).then(setData);
  }, [page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader title="Logs" icon="journal-text" subtitle="Histórico de ações no sistema" />
      <Card className="card-app">
        <Card.Body className="p-0">
          {!data ? (
            <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
          ) : (
            <Table responsive hover className="table-app mb-0">
              <thead>
                <tr>
                  <th className="ps-4">Data</th>
                  <th>Ação</th>
                  <th>Entidade</th>
                  <th>Registro</th>
                  <th>Detalhe</th>
                  <th className="pe-4">Usuário</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((l) => (
                  <tr key={l.id}>
                    <td className="ps-4 text-nowrap">{fmtDate(l.criado_em, true)}</td>
                    <td><ValueBadge value={l.acao} colors={ACAO_COLORS} /></td>
                    <td className="text-capitalize">{l.entidade}</td>
                    <td className="text-muted">{l.registro_id ?? '—'}</td>
                    <td>{l.detalhe}</td>
                    <td className="pe-4 text-muted">{l.usuario}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
        {pages > 1 && (
          <Card.Footer className="bg-white d-flex justify-content-end">
            <Pagination size="sm" className="mb-0">
              <Pagination.Prev disabled={page <= 1} onClick={() => setPage(page - 1)} />
              <Pagination.Item active>{page} / {pages}</Pagination.Item>
              <Pagination.Next disabled={page >= pages} onClick={() => setPage(page + 1)} />
            </Pagination>
          </Card.Footer>
        )}
      </Card>
    </>
  );
}
