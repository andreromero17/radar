import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Col, Row, Spinner } from 'react-bootstrap';
import { getEntity, type DashboardSummary, type ListResponse, type LogRow } from '@frame/shared';
import { AppDashboard } from '../app/dashboard';
import { api, errorMessage } from '../lib/api';
import { fmtDate } from '../lib/format';
import { areaLabel } from '../lib/areas';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import StatCard, { type StatCardProps } from '../components/StatCard';

const CORES: NonNullable<StatCardProps['color']>[] = [
  'blue',
  'purple',
  'teal',
  'orange',
  'green',
  'red',
  'amber',
  'yellow',
];

const ACAO_ICONE: Record<string, string> = {
  criação: 'plus-circle text-success',
  alteração: 'pencil text-primary',
  exclusão: 'trash text-danger',
  login: 'box-arrow-in-right text-info',
  logout: 'box-arrow-left text-secondary',
  'login falhou': 'exclamation-triangle text-danger',
};

const saudacao = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

/** Página inicial: o painel da aplicação, se houver; senão o genérico do frame */
export default function Dashboard() {
  return AppDashboard ? <AppDashboard /> : <GenericDashboard />;
}

function GenericDashboard() {
  const { user, can } = useAuth();
  const toast = useToast();
  const [resumo, setResumo] = useState<DashboardSummary | null>(null);
  const [atividade, setAtividade] = useState<LogRow[] | null>(null);
  const podeVerLogs = can('logs', 'ver');

  useEffect(() => {
    api
      .get<DashboardSummary>('/dashboard/resumo')
      .then(setResumo)
      .catch((e) => toast.error(errorMessage(e)));
    if (podeVerLogs)
      api
        .get<ListResponse<LogRow>>('/logs?pageSize=8')
        .then((r) => setAtividade(r.rows))
        .catch(() => setAtividade([]));
  }, [toast, podeVerLogs]);

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <div className="mb-4">
        <h1 className="page-title">
          {saudacao()}, {user?.nome.split(' ')[0]}!
        </h1>
        <div className="text-muted text-capitalize-first">{hoje}</div>
      </div>

      {!resumo ? (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
        </div>
      ) : resumo.totais.length === 0 ? (
        <Card className="card-app">
          <Card.Body className="p-4 text-muted">
            Seu perfil ({user?.perfil}) ainda não tem acesso a nenhum cadastro. Fale com o administrador do sistema.
          </Card.Body>
        </Card>
      ) : (
        <Row xs={2} lg={3} xl={4} className="g-2 g-md-3 mb-4">
          {resumo.totais.map((t, i) => {
            const ent = getEntity(t.entidade);
            return (
              <Col key={t.entidade}>
                <StatCard
                  label={ent?.label ?? t.entidade}
                  value={t.total}
                  icon={ent?.icon ?? 'table'}
                  color={CORES[i % CORES.length]}
                  to={`/${t.entidade}`}
                />
              </Col>
            );
          })}
        </Row>
      )}

      {podeVerLogs && (
        <Card className="card-app">
          <Card.Header>
            <i className="bi bi-clock-history" /> Atividade recente
            <Link to="/logs" className="btn btn-outline-primary btn-sm ms-auto">
              Ver tudo
            </Link>
          </Card.Header>
          <Card.Body className="p-0">
            {!atividade ? (
              <div className="text-center py-4">
                <Spinner animation="border" size="sm" variant="primary" />
              </div>
            ) : atividade.length === 0 ? (
              <div className="text-muted p-4">Nada registrado ainda.</div>
            ) : (
              <ul className="activity-list">
                {atividade.map((l) => (
                  <li key={l.id}>
                    <i className={`bi bi-${ACAO_ICONE[l.acao] ?? 'dot text-muted'}`} />
                    <div className="flex-grow-1 min-w-0">
                      <div className="text-truncate">
                        <b>{l.usuario ?? 'Sistema'}</b> · {l.acao}
                        {l.detalhe ? <span className="text-muted"> · {l.detalhe}</span> : null}
                      </div>
                      <div className="small text-muted">
                        {areaLabel(l.entidade)} · {fmtDate(l.criado_em, true)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card.Body>
        </Card>
      )}
    </>
  );
}
