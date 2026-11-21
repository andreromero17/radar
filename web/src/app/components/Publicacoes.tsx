// Tabelas de publicações das páginas de empresa e de pessoa (0.4.9): linha do post, cabeçalho, busca e o quadro
// "Todas as publicações do período" com busca, origem (página/pessoas) e filtro de assunto.
import { forwardRef, useMemo, useState } from 'react';
import { Card, Form, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import type { PostDetalhe } from '@frame/shared';
import { contem, num } from '../lib/texto';
import { dataCurta } from '../lib/universo';

export function Busca({
  valor,
  onChange,
  placeholder,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <Form.Control
      size="sm"
      type="search"
      className="ms-auto"
      style={{ maxWidth: '14rem' }}
      placeholder={placeholder}
      aria-label={placeholder}
      value={valor}
      onChange={(ev) => onChange(ev.target.value)}
    />
  );
}

export function LinhaPost({ p, mostrarAutor }: { p: PostDetalhe; mostrarAutor?: boolean }) {
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
          {mostrarAutor &&
            p.autor &&
            (p.pessoa_id ? (
              <Link to={`/pessoa/${p.pessoa_id}`} className="radar-chip">
                <i className="bi bi-person me-1" />
                {p.autor}
              </Link>
            ) : (
              <span className="radar-chip">{p.autor}</span>
            ))}
          {p.repost_empresa && (
            <span className="radar-chip radar-chip-destaque" title="A página da empresa repostou este post">
              <i className="bi bi-arrow-repeat me-1" />
              Repostado pela empresa
            </span>
          )}
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

export const CabecalhoPosts = () => (
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

export type Origem = 'todas' | 'pagina' | 'pessoas';

/**
 * "Todas as publicações do período": busca no texto, no autor e nos assuntos; na página da empresa, também a origem
 * (página × pessoas-chave). O assunto vem de fora (clique nos gráficos) e aparece como chip com ×.
 */
export const PublicacoesDoPeriodo = forwardRef<
  HTMLDivElement,
  {
    posts: PostDetalhe[];
    subtitulo: string;
    mostrarAutor?: boolean;
    comOrigem?: boolean;
    origem?: Origem;
    onOrigem?: (o: Origem) => void;
    assunto?: string | null;
    onAssunto?: (a: string | null) => void;
  }
>(function PublicacoesDoPeriodo(
  { posts, subtitulo, mostrarAutor, comOrigem, origem = 'todas', onOrigem, assunto, onAssunto },
  ref,
) {
  const [busca, setBusca] = useState('');
  const visiveis = useMemo(
    () =>
      posts.filter(
        (p) =>
          (origem === 'todas' || (origem === 'pagina' ? !p.pessoa_id : !!p.pessoa_id)) &&
          (!assunto || p.assuntos.includes(assunto)) &&
          contem(busca, p.titulo, p.autor, ...p.assuntos, p.sinal?.tipo),
      ),
    [posts, origem, assunto, busca],
  );
  const filtrando = !!busca.trim() || !!assunto || origem !== 'todas';
  return (
    <Card className="card-app" ref={ref}>
      <Card.Header className="d-flex flex-wrap align-items-center gap-2">
        <span className="fw-semibold">Todas as publicações do período</span>
        <span className="small text-muted">{filtrando ? `${visiveis.length} de ${posts.length}` : subtitulo}</span>
        <Busca valor={busca} onChange={setBusca} placeholder="Buscar nas publicações" />
      </Card.Header>
      {(comOrigem || assunto) && (
        <div className="d-flex flex-wrap align-items-center gap-2 px-3 pt-3">
          {comOrigem &&
            (
              [
                ['todas', 'Todas'],
                ['pagina', 'Da página'],
                ['pessoas', 'Das pessoas-chave'],
              ] as const
            ).map(([o, rotulo]) => (
              <button
                key={o}
                type="button"
                className={`radar-filtro${origem === o ? ' on' : ''}`}
                onClick={() => onOrigem?.(o)}
              >
                {rotulo}
              </button>
            ))}
          {assunto && (
            <span className="radar-chip radar-chip-destaque">
              Assunto: {assunto}
              <button
                type="button"
                className="btn-close ms-2"
                aria-label="Tirar o assunto"
                onClick={() => onAssunto?.(null)}
              />
            </span>
          )}
        </div>
      )}
      <div className="table-responsive">
        <Table hover className="mb-0 radar-tabela">
          <CabecalhoPosts />
          <tbody>
            {visiveis.map((p) => (
              <LinhaPost key={p.id} p={p} mostrarAutor={mostrarAutor} />
            ))}
            {!visiveis.length && (
              <tr>
                <td colSpan={6} className="text-muted">
                  {filtrando ? 'Nenhuma publicação com esses filtros.' : 'Nenhuma publicação no período.'}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </Card>
  );
});
