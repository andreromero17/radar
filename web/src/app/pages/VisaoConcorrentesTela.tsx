import { Card, Col, Row, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import type { VisaoConcorrentes } from '@frame/shared';
import StatCard from '../../components/StatCard';
import LogoEmpresa from '../components/LogoEmpresa';
import { Barras, BarrasEmpilhadas, Rosca } from '../components/Graficos';
import { compacto, dataCurta } from '../lib/universo';

const num = (n: number | null, casas = 1) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  if (atual === anterior) return null;
  return atual > anterior ? (
    <i className="bi bi-arrow-up radar-var-up ms-1" title={`Período anterior: ${anterior}`} />
  ) : (
    <i className="bi bi-arrow-down radar-var-down ms-1" title={`Período anterior: ${anterior}`} />
  );
}

/** Visão geral dos concorrentes: comparativo, fatia da conversa, tipos de movimento e o que mais engaja */
export default function VisaoConcorrentesTela({ d }: { d: VisaoConcorrentes }) {
  const conc = d.linhas.filter((l) => !l.nos);
  const comPosts = conc.filter((l) => l.posts > 0);
  const maxEngaja = Math.max(1, ...d.engaja.map((e) => e.media));
  return (
    <>
      <Row className="g-3 mb-3">
        <Col sm={6} xl={3}>
          <StatCard label="Movimentos" value={d.kpis.movimentos} icon="lightning-charge" color="purple" to="/sinais" />
        </Col>
        <Col sm={6} xl={3}>
          <StatCard label="De severidade alta" value={d.kpis.alta} icon="exclamation-diamond" color="red" />
        </Col>
        <Col sm={6} xl={3}>
          <StatCard label="Posts publicados" value={d.kpis.posts} icon="file-text" color="blue" to="/publicacoes" />
        </Col>
        <Col sm={6} xl={3}>
          <StatCard label="Audiência somada" value={compacto(d.kpis.audiencia)} icon="people" color="teal" />
        </Col>
      </Row>

      <Card className="card-app mb-3">
        <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <span className="fw-semibold">Comparativo</span>
          <span className="small text-muted">
            Engajamento = interações por post ÷ seguidores · setas: período anterior
          </span>
        </Card.Header>
        <div className="table-responsive">
          <Table hover className="mb-0 radar-tabela">
            <thead>
              <tr>
                <th>Empresa</th>
                <th className="text-end">Seguidores</th>
                <th className="text-end">Posts</th>
                <th className="text-end">Reposts</th>
                <th className="text-end">Curtidas/post</th>
                <th className="text-end">Coment./post</th>
                <th className="text-end">Compart./post</th>
                <th className="text-end">Engajamento</th>
                <th className="text-end">Movimentos</th>
                <th className="text-end">Alta</th>
                <th className="text-end">Último post</th>
              </tr>
            </thead>
            <tbody>
              {d.linhas.map((l) => (
                <tr key={l.id} className={l.nos ? 'radar-nos' : undefined}>
                  <td>
                    <Link
                      to={`/empresas/${l.id}`}
                      className="d-flex align-items-center gap-2 text-reset text-decoration-none"
                    >
                      <LogoEmpresa nome={l.nome} logo={l.logo} tamanho={1.75} />
                      <span className="fw-semibold">{l.nome}</span>
                      {l.nos && <span className="radar-chip">Nós</span>}
                    </Link>
                  </td>
                  <td className="text-end">
                    {compacto(l.seguidores)}
                    {l.seguidores_var != null && l.seguidores_var !== 0 && (
                      <span className={l.seguidores_var > 0 ? 'radar-var-up ms-1' : 'radar-var-down ms-1'}>
                        {l.seguidores_var > 0 ? '+' : ''}
                        {compacto(l.seguidores_var)}
                      </span>
                    )}
                  </td>
                  <td className="text-end">
                    {l.posts}
                    <Variacao atual={l.posts} anterior={l.posts_anterior} />
                  </td>
                  <td className="text-end text-muted">{l.reposts || '—'}</td>
                  <td className="text-end">{num(l.curtidas_post)}</td>
                  <td className="text-end">{num(l.comentarios_post)}</td>
                  <td className="text-end">{num(l.compartilhamentos_post)}</td>
                  <td className="text-end">{l.engajamento == null ? '—' : `${num(l.engajamento, 2)}%`}</td>
                  <td className="text-end">{l.movimentos || '—'}</td>
                  <td className="text-end">
                    {l.alta ? <span className="radar-chip radar-sev-alta">{l.alta}</span> : '—'}
                  </td>
                  <td className="text-end text-muted">{dataCurta(l.ultimo_post)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <Row className="g-3 mb-3">
        <Col lg={5}>
          <Card className="card-app h-100">
            <Card.Header className="fw-semibold">Fatia da conversa</Card.Header>
            <Card.Body>
              {comPosts.length ? (
                <Rosca rotulos={comPosts.map((l) => l.nome)} valores={comPosts.map((l) => l.posts)} altura={11} />
              ) : (
                <p className="text-muted mb-0">Sem posts no período.</p>
              )}
              <p className="small text-muted mt-2 mb-0">
                Participação de cada concorrente nos posts próprios do período.
              </p>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={7}>
          <Card className="card-app h-100">
            <Card.Header className="fw-semibold">Movimentos por concorrente</Card.Header>
            <Card.Body>
              {d.tipos.empresas.length ? (
                <BarrasEmpilhadas
                  rotulos={d.tipos.empresas.map((e) => e.nome)}
                  series={d.tipos.tipos.map((t, i) => ({
                    nome: t,
                    valores: d.tipos.empresas.map((e) => e.valores[i]),
                  }))}
                />
              ) : (
                <p className="text-muted mb-0">Sem movimentos classificados no período.</p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-3">
        <Col lg={7}>
          <Card className="card-app h-100">
            <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span className="fw-semibold">O que mais engaja</span>
              <span className="small text-muted">Média de interações por post · ideias para o Marketing</span>
            </Card.Header>
            <Card.Body>
              {d.engaja.length ? (
                <ul className="radar-lista">
                  {d.engaja.map((e) => (
                    <li key={e.tipo} className="flex-column">
                      <div className="d-flex justify-content-between gap-2">
                        <span className="fw-semibold">{e.tipo}</span>
                        <span className="small text-muted">
                          {num(e.media)} interações/post · {e.posts} post(s)
                        </span>
                      </div>
                      <div className="radar-barra">
                        <span style={{ width: `${(e.media / maxEngaja) * 100}%` }} />
                      </div>
                      {e.exemplos.map((x) => (
                        <a
                          key={x.id}
                          href={x.url ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="small text-truncate d-block text-decoration-none"
                          title={x.titulo}
                        >
                          <i className="bi bi-box-arrow-up-right me-1" />
                          {x.empresa}: {x.titulo} <span className="text-muted">({x.interacoes})</span>
                        </a>
                      ))}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted mb-0">Ainda sem posts classificados no período.</p>
              )}
              <p className="small text-muted mt-2 mb-0">
                Por tipo de movimento até a classificação por assunto (próxima entrega) chegar a todos os posts
                coletados.
              </p>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={5}>
          <Card className="card-app h-100">
            <Card.Header className="fw-semibold">Movimentos por semana</Card.Header>
            <Card.Body>
              <Barras rotulos={d.semanas.map((s) => dataCurta(s.inicio))} valores={d.semanas.map((s) => s.n)} />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
