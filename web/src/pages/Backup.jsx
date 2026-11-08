import { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Spinner, Table } from 'react-bootstrap';
import { api } from '../lib/api';
import { fmtBytes, fmtDate } from '../lib/format';
import PageHeader from '../components/PageHeader';

export default function Backup() {
  const [info, setInfo] = useState(null);
  const load = () => api.get('/backup/info').then(setInfo);
  useEffect(() => { load(); }, []);

  const download = () => {
    window.location.href = '/api/backup';
    setTimeout(load, 1500);
  };

  return (
    <>
      <PageHeader title="Backup" icon="database" subtitle="Cópia de segurança do banco SQLite">
        <Button onClick={download}><i className="bi bi-download me-1" /> Baixar backup agora</Button>
      </PageHeader>
      {!info ? (
        <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
      ) : (
        <Row className="g-3">
          <Col md={5}>
            <Card className="card-app h-100">
              <Card.Header><i className="bi bi-hdd" /> Banco de dados</Card.Header>
              <Card.Body>
                <dl className="row mb-0">
                  <dt className="col-5">Arquivo</dt><dd className="col-7"><code>{info.arquivo}</code></dd>
                  <dt className="col-5">Tamanho</dt><dd className="col-7">{fmtBytes(info.tamanho)}</dd>
                  <dt className="col-5">Modificado</dt><dd className="col-7">{fmtDate(info.modificado, true)}</dd>
                </dl>
                <p className="small text-muted mt-3 mb-0">
                  O backup gera uma cópia consistente do arquivo <code>.db</code>, mesmo com o sistema em uso.
                  Para restaurar, substitua <code>server/data/app.db</code> pelo arquivo baixado com o servidor parado.
                </p>
              </Card.Body>
            </Card>
          </Col>
          <Col md={7}>
            <Card className="card-app h-100">
              <Card.Header><i className="bi bi-table" /> Tabelas</Card.Header>
              <Card.Body className="p-0">
                <Table className="table-app mb-0">
                  <thead><tr><th className="ps-4">Tabela</th><th className="text-end pe-4">Registros</th></tr></thead>
                  <tbody>
                    {info.tabelas.map((t) => (
                      <tr key={t.tabela}><td className="ps-4 text-capitalize">{t.tabela}</td><td className="text-end pe-4 fw-bold">{t.registros}</td></tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
    </>
  );
}
