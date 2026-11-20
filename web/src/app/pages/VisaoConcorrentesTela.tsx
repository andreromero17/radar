import { useMemo, useState } from 'react';
import { Card, Col, Row, Table } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import type { LinhaComparativo, VisaoConcorrentes } from '@frame/shared';
import StatCard from '../../components/StatCard';
import LogoEmpresa from '../components/LogoEmpresa';
import { Barras, BarrasEmpilhadas, BarrasHorizontais, Rosca } from '../components/Graficos';
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

type Chave = keyof Pick<
  LinhaComparativo,
  | 'nome'
  | 'seguidores'
  | 'posts'
  | 'reposts'
  | 'curtidas_post'
  | 'comentarios_post'
  | 'compartilhamentos_post'
  | 'engajamento'
  | 'colaboradores'
  | 'vagas'
  | 'movimentos'
  | 'alta'
  | 'ultimo_post'
>;
const COLUNAS: { chave: Chave; rotulo: string; dica?: string }[] = [
  { chave: 'nome', rotulo: 'Empresa' },
  { chave: 'seguidores', rotulo: 'Seguidores', dica: 'Seguidores da página; ao lado, a variação na última semana' },
  {
    chave: 'posts',
    rotulo: 'Posts',
    dica: 'Posts próprios da página no período; a seta compara com o período anterior',
  },
  { chave: 'reposts', rotulo: 'Reposts' },
  { chave: 'curtidas_post', rotulo: 'Curtidas/post' },
  { chave: 'comentarios_post', rotulo: 'Coment./post' },
  { chave: 'compartilhamentos_post', rotulo: 'Compart./post' },
  {
    chave: 'engajamento',
    rotulo: 'Engajamento',
    dica: 'Interações (curtidas + comentários + compartilhamentos) por post ÷ seguidores',
  },
  {
    chave: 'colaboradores',
    rotulo: 'Colaboradores',
    dica: 'Pessoas que trabalham lá segundo o LinkedIn (aba Pessoas); ao lado, a variação no período',
  },
  { chave: 'vagas', rotulo: 'Vagas', dica: 'Vagas publicadas no LinkedIn nos últimos 30 dias (busca semanal)' },
  {
    chave: 'movimentos',
    rotulo: 'Movimentos',
    dica: 'Posts que viraram sinal comercial: oferta nova, cliente novo, parceria, contratação, troca de executivo…',
  },
  { chave: 'alta', rotulo: 'Alta', dica: 'Movimentos de severidade alta' },
  { chave: 'ultimo_post', rotulo: 'Último post' },
];

/** Visão geral dos concorrentes: comparativo, assuntos, assuntos por concorrente e o que mais engaja */
export default function VisaoConcorrentesTela({ d }: { d: VisaoConcorrentes }) {
  const [ordem, setOrdem] = useState<{ chave: Chave; desc: boolean }>({ chave: 'movimentos', desc: true });
  const linhas = useMemo(() => {
    const valor = (l: LinhaComparativo) => l[ordem.chave];
    const resto = d.linhas
      .filter((l) => !l.nos)
      .sort((a, b) => {
        const va = valor(a);
        const vb = valor(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1; // vazios sempre no fim
        if (vb == null) return -1;
        const c = typeof va === 'string' ? va.localeCompare(String(vb), 'pt-BR') : Number(va) - Number(vb);
        return ordem.desc ? -c : c;
      });
    return [...d.linhas.filter((l) => l.nos), ...resto]; // "Nós" fica sempre no topo, como referência
  }, [d.linhas, ordem]);
  const navigate = useNavigate();
  /** Lista de publicações filtrada: posts dos concorrentes no período, no assunto (e empresa) clicado */
  const verPosts = (assunto: string | undefined, extra: { empresaId?: number; maisEngajados?: boolean } = {}) => {
    if (!assunto) return; // "Demais assuntos" não é um assunto só
    const q = new URLSearchParams({
      tipo: 'Post',
      post_proprio: '1',
      assuntos__contem: assunto,
      data_publicacao__de: d.periodo.de,
      data_publicacao__ate: d.periodo.ate,
    });
    if (extra.empresaId) q.set('empresa_id', String(extra.empresaId));
    else q.set('universo', 'Concorrente');
    if (extra.maisEngajados) {
      q.set('sort', 'curtidas');
      q.set('dir', 'desc');
    }
    navigate(`/publicacoes?${q}`);
  };
  const ordenar = (chave: Chave) =>
    setOrdem((o) => (o.chave === chave ? { chave, desc: !o.desc } : { chave, desc: chave !== 'nome' }));
  const topo = d.assuntos.slice(0, 8);
  const outros = d.assuntos.slice(8).reduce((s, a) => s + a.posts, 0);
  const maxEngaja = Math.max(1, ...d.engaja.map((e) => e.media));
  // até 7 assuntos com cor própria; o resto vira "Demais assuntos" (cores não se repetem)
  const ape = d.assuntos_por_empresa;
  const principais = ape.assuntos.slice(0, 7);
  const seriesAssuntos = [
    ...principais.map((a, i) => ({ nome: a, valores: ape.empresas.map((e) => e.valores[i]) })),
    ...(ape.assuntos.length > 7
      ? [{ nome: 'Demais assuntos', valores: ape.empresas.map((e) => e.valores.slice(7).reduce((s, v) => s + v, 0)) }]
      : []),
  ];
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
            Clique no título da coluna para ordenar · na empresa, para ver tudo dela
          </span>
        </Card.Header>
        <div className="table-responsive">
          <Table hover className="mb-0 radar-tabela table-app">
            <thead>
              <tr>
                {COLUNAS.map((c) => {
                  const ativa = ordem.chave === c.chave;
                  return (
                    <th
                      key={c.chave}
                      className={`sortable${c.chave === 'nome' ? '' : ' text-end'}${ativa ? ' sorted' : ''}`}
                      role="button"
                      title={c.dica ? `${c.dica} · clique para ordenar` : 'Clique para ordenar'}
                      aria-sort={ativa ? (ordem.desc ? 'descending' : 'ascending') : undefined}
                      onClick={() => ordenar(c.chave)}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      {c.rotulo}
                      {c.dica && <i className="bi bi-info-circle ms-1 opacity-50" />}
                      {ativa ? (
                        <i className={`bi bi-arrow-${ordem.desc ? 'down' : 'up'} ms-1`} />
                      ) : (
                        <i className="bi bi-arrow-down-up ms-1 sort-idle" />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className={l.nos ? 'radar-nos' : undefined}>
                  <td>
                    <Link
                      to={`/empresa/${l.id}`}
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
                  <td className="text-end">
                    {compacto(l.colaboradores)}
                    {l.colaboradores_var != null && l.colaboradores_var !== 0 && (
                      <span className={l.colaboradores_var > 0 ? 'radar-var-up ms-1' : 'radar-var-down ms-1'}>
                        {l.colaboradores_var > 0 ? '+' : ''}
                        {l.colaboradores_var}
                      </span>
                    )}
                  </td>
                  <td className="text-end">{l.vagas ?? '—'}</td>
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
        <Col lg={6}>
          <Card className="card-app h-100">
            <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span className="fw-semibold">Assuntos mais abordados</span>
              <span className="small text-muted">Clique para ver os posts</span>
            </Card.Header>
            <Card.Body>
              {topo.length ? (
                <Rosca
                  rotulos={[...topo.map((a) => a.assunto), ...(outros ? ['Demais assuntos'] : [])]}
                  valores={[...topo.map((a) => a.posts), ...(outros ? [outros] : [])]}
                  altura={11}
                  onClick={(i) => verPosts(topo[i]?.assunto)}
                />
              ) : (
                <p className="text-muted mb-0">Sem posts no período.</p>
              )}
              <p className="small text-muted mt-2 mb-0">
                Todos os concorrentes juntos: % dos posts próprios do período em cada assunto (um post pode ter mais de
                um).
              </p>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={6}>
          <Card className="card-app h-100">
            <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span className="fw-semibold">O que mais engaja</span>
              <span className="small text-muted">Média de interações por post · ideias para o Marketing</span>
            </Card.Header>
            <Card.Body>
              {d.engaja.length ? (
                <BarrasHorizontais
                  rotulos={d.engaja.map((e) => e.assunto)}
                  valores={d.engaja.map((e) => e.media)}
                  detalhe={d.engaja.map((e) => `${e.posts} post(s) no período`)}
                  onClick={(i) => verPosts(d.engaja[i].assunto, { maisEngajados: true })}
                />
              ) : (
                <p className="text-muted mb-0">Sem posts suficientes no período.</p>
              )}
              <p className="small text-muted mt-2 mb-0">
                Curtidas + comentários + compartilhamentos por post, em assuntos com 2 posts ou mais. Clique para ver os
                posts, dos que mais engajaram para os que menos.
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="card-app mb-3">
        <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <span className="fw-semibold">Assuntos por concorrente</span>
          <span className="small text-muted">Clique para ver os posts do concorrente naquele assunto</span>
        </Card.Header>
        <Card.Body>
          {ape.empresas.length ? (
            <BarrasEmpilhadas
              rotulos={ape.empresas.map((e) => e.nome)}
              series={seriesAssuntos}
              onClick={(serie, linha) => verPosts(principais[serie], { empresaId: ape.empresas[linha].id })}
            />
          ) : (
            <p className="text-muted mb-0">Sem posts no período.</p>
          )}
        </Card.Body>
      </Card>

      <Row className="g-3">
        <Col lg={7}>
          <Card className="card-app h-100">
            <Card.Header className="fw-semibold">Posts de destaque por assunto</Card.Header>
            <Card.Body>
              {d.engaja.length ? (
                <ul className="radar-lista">
                  {d.engaja.map((e) => (
                    <li key={e.assunto} className="flex-column">
                      <div className="d-flex justify-content-between gap-2">
                        <a
                          href="#posts"
                          className="fw-semibold text-reset"
                          onClick={(ev) => {
                            ev.preventDefault();
                            verPosts(e.assunto, { maisEngajados: true });
                          }}
                        >
                          {e.assunto}
                        </a>
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
                <p className="text-muted mb-0">Sem posts suficientes no período.</p>
              )}
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
