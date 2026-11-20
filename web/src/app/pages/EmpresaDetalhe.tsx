import { useEffect, useState } from 'react';
import { Alert, Card, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import { Link, useParams } from 'react-router-dom';
import type { DetalheEmpresa, PostDetalhe } from '@frame/shared';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../lib/api';
import ApolloEmpresa from '../components/ApolloEmpresa';
import LogoEmpresa from '../components/LogoEmpresa';
import { Barras } from '../components/Graficos';
import { compacto, dataCurta } from '../lib/universo';
import { ChipSeveridade } from './VisaoContasTela';
import { FiltroSeveridade } from './Sinais';

const num = (n: number | null | undefined, casas = 1) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
const PERIODOS = [30, 90, 180];
const voltarPara = (universo: string) =>
  universo === 'Concorrente' || universo === 'Nós' ? '/?u=concorrentes' : '/?u=contas';

function LinhaPost({ p, mostrarAutor }: { p: PostDetalhe; mostrarAutor?: boolean }) {
  return (
    <tr>
      <td className="text-muted">{dataCurta(p.data)}</td>
      <td style={{ maxWidth: '28rem' }}>
        <a
          href={p.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="d-block text-truncate text-reset"
          title={p.titulo}
        >
          {p.titulo || '(sem texto)'}
        </a>
        <div className="d-flex flex-wrap gap-1 mt-1">
          {!p.proprio && <span className="radar-chip">Repost</span>}
          {mostrarAutor && p.autor && <span className="radar-chip">{p.autor}</span>}
          {p.assuntos.map((a) => (
            <span key={a} className="radar-chip">
              {a}
            </span>
          ))}
          {p.sinal && (
            <Link
              to={`/sinais/${p.sinal.id}`}
              className={`radar-chip ${p.sinal.severidade === 'Alta' ? 'radar-sev-alta' : ''}`}
            >
              <i className="bi bi-lightning-charge me-1" />
              {p.sinal.tipo}
            </Link>
          )}
        </div>
      </td>
      <td className="text-end">{num(p.curtidas, 0)}</td>
      <td className="text-end">{num(p.comentarios, 0)}</td>
      <td className="text-end">{num(p.compartilhamentos, 0)}</td>
      <td className="text-end fw-semibold">{p.interacoes}</td>
    </tr>
  );
}

const CabecalhoPosts = () => (
  <thead>
    <tr>
      <th>Data</th>
      <th>Post</th>
      <th className="text-end">Curtidas</th>
      <th className="text-end">Coment.</th>
      <th className="text-end">Compart.</th>
      <th className="text-end">Interações</th>
    </tr>
  </thead>
);

/** Página da empresa: posts, assuntos, engajamento, seguidores, sinais e pessoas-chave */
export default function EmpresaDetalhe() {
  const { id } = useParams();
  const [dias, setDias] = useState(90);
  const [d, setD] = useState<DetalheEmpresa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [severidade, setSeveridade] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const { can } = useAuth();

  async function refazerHistorico() {
    try {
      await api.post(`/radar/empresas/${id}/refazer-historico`, {});
      setAviso(
        'Pronto: na próxima coleta de posts (diária ou "Coletar agora") esta empresa e as pessoas dela recebem os últimos 30 dias.',
      );
    } catch (e) {
      setAviso(errorMessage(e));
    }
  }

  useEffect(() => {
    let vivo = true;
    setErro(null);
    api
      .get<DetalheEmpresa>(`/radar/empresas/${id}/detalhe?dias=${dias}`)
      .then((x) => vivo && setD(x))
      .catch((e) => vivo && setErro(errorMessage(e)));
    return () => {
      vivo = false;
    };
  }, [id, dias, recarga]);

  if (erro) return <Alert variant="danger">{erro}</Alert>;
  if (!d || String(d.empresa.id) !== id)
    return (
      <div className="text-center py-5">
        <Spinner animation="border" size="sm" />
      </div>
    );
  const e = d.empresa;
  const k = d.kpis;
  const maxAssunto = Math.max(1, ...d.assuntos.map((a) => a.media));
  const posts = d.posts;
  const sinais = severidade ? d.sinais.filter((s) => s.severidade === severidade) : d.sinais;

  return (
    <>
      <PageHeader title={e.nome} back={voltarPara(e.universo)}>
        <Form.Select
          size="sm"
          value={dias}
          onChange={(x) => setDias(Number(x.target.value))}
          aria-label="Período"
          style={{ width: 'auto' }}
        >
          {PERIODOS.map((p) => (
            <option key={p} value={p}>
              Últimos {p} dias
            </option>
          ))}
        </Form.Select>
        {can('empresas', 'editar') && (
          <button
            type="button"
            className="btn btn-light border btn-sm"
            onClick={refazerHistorico}
            title="Na próxima coleta, busca de novo os posts dos últimos 30 dias desta empresa"
          >
            <i className="bi bi-clock-history me-1" />
            Buscar 30 dias
          </button>
        )}
        <Link to={`/empresas/${e.id}`} className="btn btn-light border btn-sm">
          <i className="bi bi-pencil me-1" />
          Editar cadastro
        </Link>
      </PageHeader>
      {aviso && (
        <Alert variant="info" dismissible onClose={() => setAviso(null)}>
          {aviso}
        </Alert>
      )}

      <Card className="card-app mb-3">
        <Card.Body className="d-flex flex-wrap align-items-center gap-3">
          <LogoEmpresa nome={e.nome} logo={e.logo} tamanho={6.5} />
          <div className="flex-grow-1">
            <div className="fw-semibold fs-4">{e.nome_completo}</div>
            <div className="d-flex flex-wrap gap-2 mt-1 align-items-center">
              <span className="radar-chip">{e.universo}</span>
              {e.tier && <span className="radar-chip">Tier {e.tier}</span>}
              {e.segmento && <span className="radar-chip">{e.segmento}</span>}
              {e.uf && <span className="radar-chip">{e.uf}</span>}
              {e.dono && <span className="small text-muted">Dono: {e.dono}</span>}
            </div>
          </div>
          <div className="d-flex gap-2">
            {e.linkedin_url && (
              <a href={e.linkedin_url} target="_blank" rel="noreferrer" className="btn btn-light border btn-sm">
                <i className="bi bi-linkedin me-1" />
                LinkedIn
              </a>
            )}
            {e.site && (
              <a
                href={/^https?:/.test(e.site) ? e.site : `https://${e.site}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-light border btn-sm"
              >
                <i className="bi bi-globe me-1" />
                Site
              </a>
            )}
          </div>
        </Card.Body>
      </Card>

      <Row className="g-3 mb-3">
        <Col sm={6} lg={3}>
          <StatCard
            label={
              k.seguidores_var
                ? `Seguidores (${k.seguidores_var > 0 ? '+' : ''}${compacto(k.seguidores_var)} na semana)`
                : 'Seguidores'
            }
            value={compacto(e.seguidores)}
            icon="people"
            color="teal"
          />
        </Col>
        <Col sm={6} lg={3}>
          <StatCard
            label={`Posts próprios (antes: ${k.posts_anterior})`}
            value={k.posts}
            icon="file-text"
            color="blue"
          />
        </Col>
        <Col sm={6} lg={3}>
          <StatCard label="Interações por post" value={num(k.interacoes_post)} icon="hand-thumbs-up" color="purple" />
        </Col>
        <Col sm={6} lg={3}>
          <StatCard
            label="Engajamento"
            value={k.engajamento == null ? '—' : `${num(k.engajamento, 2)}%`}
            icon="activity"
            color="amber"
          />
        </Col>
        <Col sm={6} lg={3}>
          <StatCard label={`Sinais (${k.alta} alta)`} value={k.sinais} icon="lightning-charge" color="red" />
        </Col>
        <Col sm={6} lg={3}>
          <StatCard
            label={
              k.colaboradores_var
                ? `Colaboradores (${k.colaboradores_var > 0 ? '+' : ''}${k.colaboradores_var} desde ${dataCurta(k.colaboradores_desde)})`
                : 'Colaboradores no LinkedIn'
            }
            value={compacto(k.colaboradores)}
            icon="person-badge"
            color="blue"
          />
        </Col>
        <Col sm={6} lg={3}>
          <StatCard label="Vagas (30 dias)" value={k.vagas ?? '—'} icon="briefcase" color="green" />
        </Col>
        <Col sm={6} lg={3}>
          <StatCard label="Pessoas monitoradas" value={d.pessoas.length} icon="person-lines-fill" color="teal" />
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col lg={6}>
          <Card className="card-app h-100">
            <Card.Header className="fw-semibold">Posts por semana</Card.Header>
            <Card.Body>
              <Barras
                rotulos={d.semanas.map((s) => dataCurta(s.inicio))}
                valores={d.semanas.map((s) => s.n)}
                altura={11}
              />
            </Card.Body>
          </Card>
        </Col>
        <Col lg={6}>
          <Card className="card-app h-100">
            <Card.Header className="fw-semibold">Assuntos e engajamento</Card.Header>
            <Card.Body>
              {d.assuntos.map((a) => (
                <div key={a.assunto} className="mb-2">
                  <div className="d-flex justify-content-between small">
                    <span>
                      {a.assunto} <span className="text-muted">· {a.posts} post(s)</span>
                    </span>
                    <span className="text-muted">{num(a.media)} interações/post</span>
                  </div>
                  <div className="radar-barra">
                    <span style={{ width: `${(a.media / maxAssunto) * 100}%` }} />
                  </div>
                </div>
              ))}
              {!d.assuntos.length && <p className="text-muted mb-0">Sem posts no período.</p>}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {d.melhores.length > 0 && (
        <Card className="card-app mb-3">
          <Card.Header className="fw-semibold">Posts que mais engajaram</Card.Header>
          <div className="table-responsive">
            <Table className="mb-0 radar-tabela">
              <CabecalhoPosts />
              <tbody>
                {d.melhores.map((p) => (
                  <LinhaPost key={p.id} p={p} />
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      <Row className="g-3 mb-3">
        <Col lg={7}>
          <Card className="card-app h-100">
            <Card.Header className="fw-semibold">Sinais</Card.Header>
            <Card.Body>
              <FiltroSeveridade valor={severidade} onChange={setSeveridade} />
              {sinais.length ? (
                <ul className="radar-lista">
                  {sinais.map((s) => (
                    <li key={s.id} className="flex-column">
                      <div className="d-flex flex-wrap gap-2 align-items-center">
                        <ChipSeveridade s={s.severidade} />
                        <span className="radar-chip">{s.tipo}</span>
                        {s.pessoa && <span className="small text-muted">{s.pessoa}</span>}
                        <span className="small text-muted ms-auto">{dataCurta(s.data)}</span>
                      </div>
                      <Link to={`/sinais/${s.id}`} className="text-reset text-decoration-none">
                        {s.titulo}
                      </Link>
                      {s.gancho && <div className="radar-gancho">{s.gancho}</div>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted mb-0">
                  Nenhum sinal {severidade ? `de severidade ${severidade.toLowerCase()} ` : ''}no período.
                </p>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col lg={5}>
          <Card className="card-app h-100">
            <Card.Header className="fw-semibold">Pessoas-chave</Card.Header>
            <Card.Body>
              {d.pessoas.length ? (
                <ul className="radar-lista">
                  {d.pessoas.map((p) => (
                    <li key={p.id} className="justify-content-between align-items-center">
                      <div style={{ minWidth: 0 }}>
                        <Link to={`/pessoas/${p.id}`} className="fw-semibold text-reset text-decoration-none">
                          {p.nome}
                        </Link>
                        <div className="small text-muted text-truncate">{p.cargo ?? '—'}</div>
                      </div>
                      <span className="small text-muted text-nowrap">
                        {p.posts ? `${p.posts} post(s) · ${dataCurta(p.ultimo)}` : 'sem posts'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted mb-0">Nenhuma pessoa-chave cadastrada.</p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <ApolloEmpresa
        empresaId={e.id}
        apollo={e.apollo}
        temSite={!!e.site}
        onEnriquecida={() => setRecarga((r) => r + 1)}
      />

      {d.vagas.length > 0 && (
        <Card className="card-app mb-3">
          <Card.Header className="d-flex justify-content-between align-items-center">
            <span className="fw-semibold">Vagas publicadas no LinkedIn</span>
            <span className="small text-muted">Últimos 30 dias · {d.vagas.length} vaga(s)</span>
          </Card.Header>
          <div className="table-responsive">
            <Table className="mb-0 radar-tabela">
              <tbody>
                {d.vagas.map((v) => (
                  <tr key={v.id}>
                    <td className="text-muted" style={{ width: '5rem' }}>
                      {dataCurta(v.data)}
                    </td>
                    <td>
                      <a href={v.url ?? undefined} target="_blank" rel="noreferrer" className="text-reset">
                        {v.titulo}
                      </a>
                    </td>
                    <td className="text-muted">{v.local ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      <Card className="card-app">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <span className="fw-semibold">Todas as publicações do período</span>
          <span className="small text-muted">Página e pessoas-chave · mais recentes primeiro</span>
        </Card.Header>
        <div className="table-responsive">
          <Table hover className="mb-0 radar-tabela">
            <CabecalhoPosts />
            <tbody>
              {posts.map((p) => (
                <LinhaPost key={p.id} p={p} mostrarAutor />
              ))}
              {!posts.length && (
                <tr>
                  <td colSpan={6} className="text-muted">
                    Nenhuma publicação no período.
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
