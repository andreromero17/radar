// Página da pessoa-chave (0.4.9): estatísticas dos posts do perfil (como a página da empresa), assuntos, posts que
// mais engajaram, sinais, a relação com a página da empresa (repostados por ela / reposts dela) e todas as publicações.
import { useEffect, useRef, useState } from 'react';
import { Alert, Card, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import { Link, useParams } from 'react-router-dom';
import type { DetalhePessoa } from '@frame/shared';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../lib/api';
import { Barras, Rosca } from '../components/Graficos';
import LogoEmpresa from '../components/LogoEmpresa';
import { Busca, CabecalhoPosts, LinhaPost, PublicacoesDoPeriodo } from '../components/Publicacoes';
import { contem, num } from '../lib/texto';
import { dataCurta } from '../lib/universo';
import { FiltroSeveridade } from './Sinais';
import { ChipSeveridade } from './VisaoContasTela';

const PERIODOS = [30, 90, 180];

export default function PessoaDetalhe() {
  const { id } = useParams();
  const { can } = useAuth();
  const [dias, setDias] = useState(90);
  const [d, setD] = useState<DetalhePessoa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [severidade, setSeveridade] = useState<string | null>(null);
  const [buscaSinais, setBuscaSinais] = useState('');
  const [assunto, setAssunto] = useState<string | null>(null);
  const publicacoesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    api
      .get<DetalhePessoa>(`/radar/pessoas/${id}/detalhe?dias=${dias}`)
      .then((x) => vivo && setD(x))
      .catch((e) => vivo && setErro(errorMessage(e)));
    return () => {
      vivo = false;
    };
  }, [id, dias]);

  if (erro) return <Alert variant="danger">{erro}</Alert>;
  if (!d || String(d.pessoa.id) !== id)
    return (
      <div className="text-center py-5">
        <Spinner animation="border" size="sm" />
      </div>
    );
  const x = d.pessoa;
  const k = d.kpis;
  const sinais = d.sinais.filter(
    (s) => (!severidade || s.severidade === severidade) && contem(buscaSinais, s.titulo, s.gancho, s.tipo),
  );
  const verAssunto = (a: string) => {
    setAssunto(a);
    setTimeout(() => publicacoesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const maxAssunto = Math.max(1, ...d.assuntos.map((a) => a.media));

  return (
    <>
      <PageHeader title={x.nome} back={x.empresa ? `/empresa/${x.empresa.id}` : '/pessoas'}>
        <Form.Select
          size="sm"
          value={dias}
          onChange={(e) => setDias(Number(e.target.value))}
          aria-label="Período"
          style={{ width: 'auto' }}
        >
          {PERIODOS.map((p) => (
            <option key={p} value={p}>
              Últimos {p} dias
            </option>
          ))}
        </Form.Select>
        {can('pessoas', 'ver') && (
          <Link to={`/pessoas/${x.id}`} className="btn btn-light border btn-sm">
            <i className="bi bi-pencil me-1" />
            {can('pessoas', 'editar') ? 'Editar cadastro' : 'Cadastro'}
          </Link>
        )}
      </PageHeader>

      <Card className="card-app mb-3">
        <Card.Body className="d-flex flex-wrap align-items-center gap-3">
          <div className="radar-avatar" aria-hidden>
            {x.nome
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join('')}
          </div>
          <div className="flex-grow-1" style={{ minWidth: 0 }}>
            <div className="fw-semibold fs-4">{x.nome}</div>
            <div className="text-muted">{x.titulo_linkedin || x.cargo || '—'}</div>
            <div className="d-flex flex-wrap gap-2 mt-2 align-items-center">
              {x.empresa && (
                <Link to={`/empresa/${x.empresa.id}`} className="d-inline-flex align-items-center gap-2 text-reset">
                  <LogoEmpresa nome={x.empresa.nome} logo={x.empresa.logo} tamanho={1.5} />
                  <span className="fw-semibold">{x.empresa.nome}</span>
                </Link>
              )}
              {x.empresa && <span className="radar-chip">{x.empresa.universo}</span>}
              {x.nivel && <span className="radar-chip">{x.nivel}</span>}
              {x.prioridade && <span className="radar-chip">Prioridade {x.prioridade.toLowerCase()}</span>}
              {!x.monitorar && <span className="radar-chip">Não monitorada</span>}
              {x.cargo && x.titulo_linkedin && x.cargo !== x.titulo_linkedin && (
                <span className="small text-muted">Cargo cadastrado: {x.cargo}</span>
              )}
            </div>
          </div>
          {x.linkedin_url ? (
            <a href={x.linkedin_url} target="_blank" rel="noreferrer" className="btn btn-light border btn-sm">
              <i className="bi bi-linkedin me-1" />
              LinkedIn
            </a>
          ) : (
            <span className="small text-muted">Sem LinkedIn: não entra na coleta</span>
          )}
        </Card.Body>
      </Card>

      <Row className="g-3 mb-3">
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
          <StatCard label="Curtidas por post" value={num(k.curtidas_post)} icon="heart" color="orange" />
        </Col>
        <Col sm={6} lg={3}>
          <StatCard label={`Sinais (${k.alta} alta)`} value={k.sinais} icon="lightning-charge" color="red" />
        </Col>
        <Col sm={6} lg={3}>
          <StatCard label="Reposts que fez" value={k.reposts} icon="arrow-repeat" color="teal" />
        </Col>
        <Col sm={6} lg={3}>
          <StatCard
            label="Repostados pela empresa"
            value={k.repostados_pela_empresa}
            icon="building-check"
            color="green"
          />
        </Col>
        <Col sm={6} lg={3}>
          <StatCard label="Reposts da página da empresa" value={k.reposts_da_empresa} icon="megaphone" color="amber" />
        </Col>
        <Col sm={6} lg={3}>
          <StatCard label="Assuntos abordados" value={d.assuntos.length} icon="tags" color="yellow" />
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
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Assuntos mais abordados</span>
              {d.assuntos.length > 0 && <span className="small text-muted">Clique para ver os posts</span>}
            </Card.Header>
            <Card.Body>
              {d.assuntos.length ? (
                <Rosca
                  rotulos={d.assuntos.map((a) => a.assunto)}
                  valores={d.assuntos.map((a) => a.posts)}
                  altura={14}
                  grande
                  onClick={(i) => verAssunto(d.assuntos[i].assunto)}
                />
              ) : (
                <p className="text-muted mb-0">Sem posts no período.</p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col lg={5}>
          <Card className="card-app h-100">
            <Card.Header className="fw-semibold">O que mais engaja</Card.Header>
            <Card.Body>
              {d.assuntos.map((a) => (
                <div key={a.assunto} className="mb-2">
                  <div className="d-flex justify-content-between small">
                    <button
                      type="button"
                      className="btn btn-link p-0 text-reset text-decoration-none small"
                      onClick={() => verAssunto(a.assunto)}
                    >
                      {a.assunto} <span className="text-muted">· {a.posts} post(s)</span>
                    </button>
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
        <Col lg={7}>
          <Card className="card-app h-100">
            <Card.Header className="d-flex align-items-center gap-2">
              <span className="fw-semibold">Sinais</span>
              <span className="small text-muted">{d.sinais.length}</span>
              <Busca valor={buscaSinais} onChange={setBuscaSinais} placeholder="Buscar nos sinais" />
            </Card.Header>
            <Card.Body>
              <FiltroSeveridade valor={severidade} onChange={setSeveridade} />
              {sinais.length ? (
                <ul className="radar-lista radar-rolagem">
                  {sinais.map((s) => (
                    <li key={s.id} className="flex-column">
                      <div className="d-flex flex-wrap gap-2 align-items-center">
                        <ChipSeveridade s={s.severidade} />
                        <span className="radar-chip">{s.tipo}</span>
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
                <p className="text-muted mb-0">Nenhum sinal no período.</p>
              )}
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

      <PublicacoesDoPeriodo
        ref={publicacoesRef}
        posts={d.posts}
        subtitulo="Posts e reposts do perfil · mais recentes primeiro"
        mostrarAutor
        assunto={assunto}
        onAssunto={setAssunto}
      />
    </>
  );
}
