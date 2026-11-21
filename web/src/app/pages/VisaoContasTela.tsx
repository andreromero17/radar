import { Card, Col, Row, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import type { VisaoContas } from '@frame/shared';
import StatCard from '../../components/StatCard';
import LogoEmpresa from '../components/LogoEmpresa';
import { TagsDaEmpresa } from '../components/TagPill';
import { useTags } from '../lib/tags';
import { Barras } from '../components/Graficos';
import { cssVar } from '../../lib/themeVars';
import { dataCurta } from '../lib/universo';

export const ChipSeveridade = ({ s }: { s: string }) => (
  <span className={`radar-chip ${s === 'Alta' ? 'radar-sev-alta' : s === 'Média' ? 'radar-sev-media' : ''}`}>{s}</span>
);

/** Visão geral das contas-alvo: onde agir nos próximos dias */
export default function VisaoContasTela({ d }: { d: VisaoContas }) {
  const { porId: porTag } = useTags();
  const maxTipo = Math.max(1, ...d.tipos.map((t) => t.n));
  return (
    <>
      <Row className="g-3 mb-3">
        <Col sm={6} xl={3}>
          <StatCard
            label="Sinais no período"
            value={d.kpis.sinais}
            icon="lightning-charge"
            color="green"
            to="/sinais"
          />
        </Col>
        <Col sm={6} xl={3}>
          <StatCard label="De severidade alta" value={d.kpis.alta} icon="exclamation-diamond" color="red" />
        </Col>
        <Col sm={6} xl={3}>
          <StatCard
            label="Contas com sinal"
            value={`${d.kpis.contas_com_sinal} de ${d.kpis.contas}`}
            icon="building"
            color="blue"
            to="/empresas"
          />
        </Col>
        <Col sm={6} xl={3}>
          <StatCard
            label="Pessoas-chave que publicaram"
            value={`${d.kpis.pessoas_ativas} de ${d.kpis.pessoas}`}
            icon="people"
            color="purple"
            to="/pessoas"
          />
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col lg={7}>
          <Card className="card-app h-100">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Agir esta semana</span>
              <Link to="/sinais" className="small fw-semibold">
                Abrir caixa de sinais
              </Link>
            </Card.Header>
            <Card.Body>
              {d.agir.length ? (
                <ul className="radar-lista">
                  {d.agir.map((s) => (
                    <li key={s.id}>
                      {s.empresa && <LogoEmpresa nome={s.empresa.nome} logo={s.empresa.logo} tamanho={2.25} />}
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          {s.empresa && (
                            <Link
                              to={`/empresa/${s.empresa.id}`}
                              className="fw-semibold text-reset text-decoration-none"
                            >
                              {s.empresa.nome}
                            </Link>
                          )}
                          <ChipSeveridade s={s.severidade} />
                          <span className="radar-chip">{s.tipo}</span>
                          <span className="small text-muted ms-auto">{dataCurta(s.data)}</span>
                        </div>
                        <Link to={`/sinais/${s.id}`} className="d-block text-reset text-decoration-none">
                          {s.titulo}
                        </Link>
                        {s.gancho && <div className="radar-gancho">{s.gancho}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted mb-0">Nenhum sinal novo de severidade alta ou média no período.</p>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col lg={5}>
          <Card className="card-app mb-3">
            <Card.Header className="fw-semibold">Sinais por semana</Card.Header>
            <Card.Body>
              <Barras
                rotulos={d.semanas.map((s) => dataCurta(s.inicio))}
                valores={d.semanas.map((s) => s.n)}
                cor={cssVar('--positive')}
              />
            </Card.Body>
          </Card>
          <Card className="card-app">
            <Card.Header className="fw-semibold">Tipos de sinal</Card.Header>
            <Card.Body>
              {d.tipos.map((t) => (
                <div key={t.tipo} className="mb-2">
                  <div className="d-flex justify-content-between small">
                    <span>{t.tipo}</span>
                    <span className="text-muted">{t.n}</span>
                  </div>
                  <div className="radar-barra">
                    <span style={{ width: `${(t.n / maxTipo) * 100}%` }} />
                  </div>
                </div>
              ))}
              {!d.tipos.length && <p className="text-muted mb-0">Sem sinais no período.</p>}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="card-app">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <span className="fw-semibold">Contas em destaque</span>
          <Link to="/empresas" className="small fw-semibold">
            Ver todas
          </Link>
        </Card.Header>
        <div className="table-responsive">
          <Table hover className="mb-0 radar-tabela">
            <thead>
              <tr>
                <th>Conta</th>
                <th>Dono</th>
                <th className="text-end">Sinais</th>
                <th className="text-end">Alta</th>
                <th style={{ minWidth: '10rem' }}>Score Radar</th>
              </tr>
            </thead>
            <tbody>
              {d.destaque.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link
                      to={`/empresa/${e.id}`}
                      className="d-flex align-items-center gap-2 text-reset text-decoration-none"
                    >
                      <LogoEmpresa nome={e.nome} logo={e.logo} tamanho={1.75} />
                      <span className="fw-semibold">{e.nome}</span>
                      <TagsDaEmpresa ids={e.tags} porId={porTag} />
                    </Link>
                  </td>
                  <td className="text-muted">{e.dono ?? '—'}</td>
                  <td className="text-end">{e.sinais}</td>
                  <td className="text-end">
                    {e.alta ? <span className="radar-chip radar-sev-alta">{e.alta}</span> : '—'}
                  </td>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <div className="radar-barra flex-grow-1">
                        <span style={{ width: `${e.score}%` }} />
                      </div>
                      <span className="small text-muted">{e.score}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {!d.destaque.length && (
                <tr>
                  <td colSpan={5} className="text-muted">
                    Nenhuma conta com sinal no período.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </Card>
    </>
  );
}
