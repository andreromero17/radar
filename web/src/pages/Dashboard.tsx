import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Col, Row, Spinner, Table } from 'react-bootstrap';
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { getEntity, type DashboardData } from '@frame/shared';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import StatCard, { type StatCardProps } from '../components/StatCard';
import ValueBadge from '../components/ValueBadge';

ChartJS.register(ArcElement, Tooltip, Legend);
ChartJS.defaults.font.family = "'Nunito', system-ui, -apple-system, sans-serif";

// Cards do topo — id = campo em /api/dashboard -> cards
const CARDS: (Omit<StatCardProps, 'value'> & { id: keyof DashboardData['cards'] })[] = [
  { id: 'abertos', label: 'Chamados Abertos', icon: 'ticket-perforated', color: 'blue', to: '/chamados' },
  { id: 'urgentes', label: 'Urgentes Ativos', icon: 'exclamation-triangle', color: 'red', to: '/chamados?prioridade=Urgente' },
  { id: 'aguardando', label: 'Aguardando Cliente', icon: 'hourglass-split', color: 'amber', to: '/chamados?status=Aguardando cliente' },
  { id: 'emAtendimento', label: 'Em Atendimento', icon: 'headset', color: 'purple', to: '/chamados?status=Em atendimento' },
  { id: 'concluidos', label: 'Concluídos', icon: 'check-circle', color: 'green', to: '/chamados?status=Resolvido' },
  { id: 'semResponsavel', label: 'Sem Responsável', icon: 'person-x', color: 'yellow' },
  { id: 'clientesAtivos', label: 'Clientes Ativos', icon: 'people', color: 'orange', to: '/clientes?ativo=1' },
  { id: 'noMes', label: 'Chamados no Mês', icon: 'calendar3', color: 'teal' },
];

export default function Dashboard() {
  const statusColors = getEntity('chamados')?.fields.find((f) => f.name === 'status')?.colors ?? {};
  const [data, setData] = useState<DashboardData | null>(null);
  const toast = useToast();

  useEffect(() => {
    api
      .get<DashboardData>('/dashboard')
      .then(setData)
      .catch((e) => toast.error(errorMessage(e)));
  }, [toast]);

  if (!data) return <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>;

  const chart = {
    labels: data.porStatus.map((s) => s.status),
    datasets: [
      {
        data: data.porStatus.map((s) => s.total),
        backgroundColor: data.porStatus.map((s) => statusColors[s.status]),
        borderColor: '#fff',
        borderWidth: 3,
      },
    ],
  };

  return (
    <>
      <Row xs={2} xl={4} className="g-2 g-md-3 mb-4">
        {CARDS.map((c) => (
          <Col key={c.id}>
            <StatCard {...c} value={data.cards[c.id]} />
          </Col>
        ))}
      </Row>

      <Row className="g-3">
        <Col lg={5}>
          <Card className="card-app h-100">
            <Card.Header>
              <i className="bi bi-graph-up" /> Visão Geral
              <span className="ms-auto text-muted small fw-normal">Chamados por status</span>
            </Card.Header>
            <Card.Body className="d-flex align-items-center justify-content-center">
              <div style={{ maxWidth: 360, width: '100%' }}>
                <Doughnut
                  data={chart}
                  options={{
                    cutout: '62%',
                    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14} } },
                  }}
                />
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={7}>
          <Card className="card-app h-100">
            <Card.Header>
              <i className="bi bi-clock-history" /> Últimos Chamados
              <Link to="/chamados" className="btn btn-outline-primary btn-sm ms-auto">Ver todos</Link>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover className="table-app mb-0">
                <thead>
                  <tr>
                    <th className="ps-4">#</th>
                    <th>Assunto</th>
                    <th>Cliente</th>
                    <th className="text-end pe-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ultimos.map((c, i) => (
                    <tr key={c.id}>
                      <td className="ps-4 fw-bold">{i + 1}</td>
                      <td>
                        <Link to={`/chamados/${c.id}`} className="fw-bold text-body text-decoration-none">{c.assunto}</Link>
                        <div className="small text-muted">#{c.protocolo}</div>
                      </td>
                      <td className="text-muted">{c.cliente}</td>
                      <td className="text-end pe-4"><ValueBadge value={c.status} colors={statusColors} /></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
