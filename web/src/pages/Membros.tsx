import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, Dropdown, Form, Modal, Spinner } from 'react-bootstrap';
import {
  PAPEIS,
  PAPEL_DESCRICOES,
  PAPEL_LABELS,
  TIPO_ESPACO_LABELS,
  type ConviteInfo,
  type MembroInfo,
  type MembrosResposta,
  type Papel,
} from '@frame/shared';
import { api, ApiError, errorMessage } from '../lib/api';
import { fmtDate, initials } from '../lib/format';
import { recarregarNoEspaco } from '../lib/espacos';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import ConfirmModal from '../components/ConfirmModal';
import EspacoModal from '../components/EspacoModal';

const COR_PAPEL: Record<Papel, string> = { dono: 'primary', editor: 'success', leitor: 'secondary' };

export function PapelBadge({ papel }: { papel: Papel }) {
  return (
    <Badge bg={COR_PAPEL[papel]} className="fw-semibold" title={PAPEL_DESCRICOES[papel]}>
      {PAPEL_LABELS[papel]}
    </Badge>
  );
}

/** Membros do espaço em uso: papéis, convites, inativar/remover (dono); os demais só veem e podem sair */
export default function Membros() {
  const { user } = useAuth();
  const toast = useToast();
  const [dados, setDados] = useState<MembrosResposta | null>(null);
  const [convidar, setConvidar] = useState(false);
  const [editarEspaco, setEditarEspaco] = useState(false);
  const [confirma, setConfirma] = useState<{
    titulo: string;
    msg: string;
    botao: string;
    fazer: () => Promise<void>;
  } | null>(null);

  const carregar = useCallback(() => {
    api
      .get<MembrosResposta>('/membros')
      .then(setDados)
      .catch((e) => toast.error(errorMessage(e)));
  }, [toast]);
  useEffect(carregar, [carregar]);

  const acao = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      carregar();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (!dados)
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );

  const gerencia = dados.pode_gerenciar;
  const tipoLabel = TIPO_ESPACO_LABELS[dados.espaco.tipo] ?? dados.espaco.tipo;
  const eu = user?.id;
  const ativos = dados.membros.filter((m) => m.ativo);
  const inativos = dados.membros.filter((m) => !m.ativo);

  const mudarPapel = (m: MembroInfo, papel: Papel) =>
    void acao(
      () => api.put(`/membros/${m.usuario_id}`, { papel }),
      `${m.nome} agora é ${PAPEL_LABELS[papel].toLowerCase()}`,
    );
  const mudarAtivo = (m: MembroInfo, ativo: boolean) =>
    ativo
      ? void acao(() => api.put(`/membros/${m.usuario_id}`, { ativo }), `${m.nome} reativado`)
      : setConfirma({
          titulo: 'Inativar membro',
          msg: `${m.nome} perde o acesso a este espaço na hora. Dá para reativar depois; o que ele registrou continua aqui.`,
          botao: 'Inativar',
          fazer: () => acao(() => api.put(`/membros/${m.usuario_id}`, { ativo: false }), `${m.nome} inativado`),
        });
  const remover = (m: MembroInfo) =>
    setConfirma({
      titulo: 'Remover do espaço',
      msg: `${m.nome} sai da lista e perde o acesso. Para voltar, só com um novo convite. O que ele registrou continua aqui.`,
      botao: 'Remover',
      fazer: () => acao(() => api.del(`/membros/${m.usuario_id}`), `${m.nome} removido`),
    });
  const sair = () =>
    setConfirma({
      titulo: 'Sair do espaço',
      msg: `Você deixa de ver "${dados.espaco.nome}". Para voltar, só com um novo convite.`,
      botao: 'Sair do espaço',
      fazer: async () => {
        try {
          await api.post('/membros/sair', {});
          recarregarNoEspaco();
        } catch (e) {
          toast.error(errorMessage(e));
        }
      },
    });

  const linhaMembro = (m: MembroInfo) => (
    <div key={m.usuario_id} className={`membro-linha ${m.ativo ? '' : 'inativo'}`}>
      <span className="avatar">{initials(m.nome)}</span>
      <div className="flex-grow-1 min-w-0">
        <div className="fw-semibold text-truncate">
          {m.nome}
          {m.usuario_id === eu && <span className="text-muted fw-normal"> (você)</span>}
        </div>
        <div className="small text-muted text-truncate">{m.email}</div>
        {!m.conta_ativa && <div className="small text-warning">Conta desativada na plataforma</div>}
      </div>
      <div className="d-flex align-items-center gap-2 flex-shrink-0">
        {!m.ativo && (
          <Badge bg="light" text="dark" className="border">
            Inativo
          </Badge>
        )}
        <PapelBadge papel={m.papel} />
        {gerencia && (
          <Dropdown align="end">
            <Dropdown.Toggle variant="light" size="sm" className="no-caret" aria-label={`Ações de ${m.nome}`}>
              <i className="bi bi-three-dots-vertical" />
            </Dropdown.Toggle>
            <Dropdown.Menu className="shadow-sm">
              <Dropdown.Header>Papel</Dropdown.Header>
              {PAPEIS.map((p) => (
                <Dropdown.Item key={p} active={m.papel === p} onClick={() => m.papel !== p && mudarPapel(m, p)}>
                  <div className="fw-semibold">{PAPEL_LABELS[p]}</div>
                  <div className="small text-wrap opacity-75" style={{ maxWidth: '16rem' }}>
                    {PAPEL_DESCRICOES[p]}
                  </div>
                </Dropdown.Item>
              ))}
              <Dropdown.Divider />
              <Dropdown.Item onClick={() => mudarAtivo(m, !m.ativo)}>
                <i className={`bi bi-${m.ativo ? 'pause-circle' : 'play-circle'} me-2`} />
                {m.ativo ? 'Inativar' : 'Reativar'}
              </Dropdown.Item>
              <Dropdown.Item className="text-danger" onClick={() => remover(m)}>
                <i className="bi bi-person-x me-2" />
                Remover do espaço
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        )}
      </div>
    </div>
  );

  const linhaConvite = (c: ConviteInfo) => (
    <div key={c.id} className="membro-linha">
      <span className="avatar avatar-convite">
        <i className="bi bi-envelope" />
      </span>
      <div className="flex-grow-1 min-w-0">
        <div className="fw-semibold text-truncate">{c.email}</div>
        <div className="small text-muted">
          {c.expirado ? (
            <span className="text-warning">Expirou em {fmtDate(c.expira_em)}</span>
          ) : (
            <>
              Convidado em {fmtDate(c.criado_em)} · vale até {fmtDate(c.expira_em)}
            </>
          )}
        </div>
      </div>
      <div className="d-flex align-items-center gap-2 flex-shrink-0">
        <PapelBadge papel={c.papel} />
        <Dropdown align="end">
          <Dropdown.Toggle
            variant="light"
            size="sm"
            className="no-caret"
            aria-label={`Ações do convite para ${c.email}`}
          >
            <i className="bi bi-three-dots-vertical" />
          </Dropdown.Toggle>
          <Dropdown.Menu className="shadow-sm">
            <Dropdown.Item
              onClick={() => void acao(() => api.post(`/membros/convites/${c.id}/reenviar`, {}), 'Convite reenviado')}
            >
              <i className="bi bi-send me-2" />
              Reenviar (link novo)
            </Dropdown.Item>
            <Dropdown.Item
              className="text-danger"
              onClick={() => void acao(() => api.del(`/membros/convites/${c.id}`), 'Convite cancelado')}
            >
              <i className="bi bi-x-circle me-2" />
              Cancelar convite
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Membros"
        icon="people"
        subtitle={
          <>
            {dados.espaco.nome}
            {tipoLabel !== dados.espaco.nome && <> · {tipoLabel}</>} · você é {PAPEL_LABELS[dados.papel].toLowerCase()}
          </>
        }
      >
        {gerencia && (
          <>
            <Button variant="light" className="border" onClick={() => setEditarEspaco(true)}>
              <i className="bi bi-pencil me-1" />
              <span className="d-none d-sm-inline">Espaço</span>
            </Button>
            <Button onClick={() => setConvidar(true)}>
              <i className="bi bi-person-plus me-1" />
              Convidar
            </Button>
          </>
        )}
      </PageHeader>

      <Card className="card-app mb-3">
        <Card.Body className="p-0">
          <div className="membros-titulo">
            {ativos.length} {ativos.length === 1 ? 'membro' : 'membros'}
          </div>
          {ativos.map(linhaMembro)}
        </Card.Body>
      </Card>

      {gerencia && dados.convites.length > 0 && (
        <Card className="card-app mb-3">
          <Card.Body className="p-0">
            <div className="membros-titulo">Convites pendentes</div>
            {dados.convites.map(linhaConvite)}
          </Card.Body>
        </Card>
      )}

      {inativos.length > 0 && (
        <Card className="card-app mb-3">
          <Card.Body className="p-0">
            <div className="membros-titulo">Inativos (sem acesso)</div>
            {inativos.map(linhaMembro)}
          </Card.Body>
        </Card>
      )}

      <Card className="card-app mb-3">
        <Card.Body className="small text-muted">
          <div className="fw-semibold text-body mb-2">Papéis</div>
          {PAPEIS.map((p) => (
            <div key={p} className="d-flex gap-2 mb-1">
              <span style={{ minWidth: '4.5rem' }}>
                <PapelBadge papel={p} />
              </span>
              <span>{PAPEL_DESCRICOES[p]}</span>
            </div>
          ))}
          {dados.papel !== 'dono' && (
            <Button variant="link" className="text-danger px-0 mt-2 text-decoration-none" onClick={sair}>
              <i className="bi bi-box-arrow-right me-1" />
              Sair deste espaço
            </Button>
          )}
        </Card.Body>
      </Card>

      <ConviteModal show={convidar} onHide={() => setConvidar(false)} onEnviado={carregar} />
      <EspacoModal
        show={editarEspaco}
        onHide={() => setEditarEspaco(false)}
        espaco={dados.espaco}
        onSalvo={() => recarregarNoEspaco()}
      />
      <ConfirmModal
        show={!!confirma}
        title={confirma?.titulo}
        message={confirma?.msg}
        confirmLabel={confirma?.botao}
        onConfirm={() => {
          const c = confirma;
          setConfirma(null);
          void c?.fazer();
        }}
        onCancel={() => setConfirma(null)}
      />
    </>
  );
}

function ConviteModal({ show, onHide, onEnviado }: { show: boolean; onHide: () => void; onEnviado: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('editor');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    if (show) {
      setEmail('');
      setPapel('editor');
      setErro('');
    }
  }, [show]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErro('Informe um e-mail válido');
    setEnviando(true);
    try {
      await api.post('/membros/convites', { email, papel });
      toast.success(`Convite enviado para ${email.trim().toLowerCase()}`);
      onHide();
      onEnviado();
    } catch (err) {
      setErro(err instanceof ApiError ? (err.fields.email ?? err.message) : errorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Form onSubmit={enviar} noValidate>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5 fw-bold">
            <i className="bi bi-person-plus me-2" />
            Convidar para o espaço
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-semibold">E-mail</Form.Label>
            <Form.Control
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErro('');
              }}
              isInvalid={!!erro}
              autoFocus
              placeholder="pessoa@exemplo.com"
            />
            <Form.Control.Feedback type="invalid">{erro}</Form.Control.Feedback>
          </Form.Group>
          <Form.Label className="small fw-semibold">Papel</Form.Label>
          {PAPEIS.map((p) => (
            <Form.Check
              key={p}
              type="radio"
              id={`papel-${p}`}
              name="papel"
              className="mb-2"
              checked={papel === p}
              onChange={() => setPapel(p)}
              label={
                <>
                  <span className="fw-semibold">{PAPEL_LABELS[p]}</span>
                  <div className="small text-muted">{PAPEL_DESCRICOES[p]}</div>
                </>
              }
            />
          ))}
          <div className="small text-muted mt-3">
            <i className="bi bi-info-circle me-1" />A pessoa recebe um link por e-mail, válido por 7 dias e só para esse
            e-mail. Quem ainda não tem conta cria a dela ao aceitar.
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={onHide}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? <Spinner size="sm" className="me-1" /> : <i className="bi bi-send me-1" />}
            Enviar convite
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
