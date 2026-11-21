import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import type { AuthUser, SessionInfo } from '@frame/shared';
import { api, ApiError, errorMessage } from '../lib/api';
import { fmtDate, initials } from '../lib/format';
import { describeUserAgent } from '../lib/userAgent';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import ConfirmModal from '../components/ConfirmModal';
import DoisFatoresCard from '../components/DoisFatoresCard';
import IntegracoesCard from '../components/IntegracoesCard';
import SeusDadosCard from '../components/SeusDadosCard';

export default function MeuPerfil() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [nome, setNome] = useState(user?.nome ?? '');
  const [erroNome, setErroNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [sessoes, setSessoes] = useState<SessionInfo[] | null>(null);
  const [encerrarOutras, setEncerrarOutras] = useState(false);

  const carregarSessoes = useCallback(
    () =>
      api
        .get<SessionInfo[]>('/auth/sessoes')
        .then(setSessoes)
        .catch((e) => toast.error(errorMessage(e))),
    [toast],
  );
  useEffect(() => {
    void carregarSessoes();
  }, [carregarSessoes]);

  if (!user) return null;

  const salvarNome = async (e: FormEvent) => {
    e.preventDefault();
    setErroNome('');
    setSalvando(true);
    try {
      setUser(await api.put<AuthUser>('/auth/perfil', { nome }));
      toast.success('Perfil atualizado');
    } catch (err) {
      if (err instanceof ApiError && err.fields.nome) setErroNome(err.fields.nome);
      else toast.error(errorMessage(err));
    } finally {
      setSalvando(false);
    }
  };

  const encerrar = async (id: string) => {
    try {
      await api.del(`/auth/sessoes/${id}`);
      toast.success('Sessão encerrada');
      void carregarSessoes();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const encerrarTodas = async () => {
    setEncerrarOutras(false);
    try {
      const r = await api.del<{ encerradas: number }>('/auth/sessoes');
      toast.success(`${r.encerradas} sessão(ões) encerrada(s)`);
      void carregarSessoes();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const outras = sessoes?.filter((s) => !s.atual).length ?? 0;

  return (
    <>
      <PageHeader title="Meu perfil" icon="person" />
      <Row className="g-3">
        <Col lg={5}>
          <Card className="card-app h-100">
            <Card.Body className="p-4">
              <div className="d-flex align-items-center gap-3 mb-4">
                <span className="avatar avatar-lg">{initials(user.nome)}</span>
                <div className="min-w-0">
                  <div className="fw-bold fs-5 text-truncate">{user.nome}</div>
                  <div className="text-muted small text-truncate">{user.email}</div>
                  <Badge bg="light" text="dark" className="border mt-1">
                    <i className="bi bi-shield-lock me-1" />
                    {user.perfil}
                  </Badge>
                </div>
              </div>
              <Form onSubmit={salvarNome} noValidate>
                <Form.Group className="mb-3">
                  <Form.Label htmlFor="nome" className="small fw-semibold">
                    Nome
                  </Form.Label>
                  <Form.Control
                    id="nome"
                    value={nome}
                    maxLength={120}
                    onChange={(e) => setNome(e.target.value)}
                    isInvalid={!!erroNome}
                  />
                  <Form.Control.Feedback type="invalid">{erroNome}</Form.Control.Feedback>
                </Form.Group>
                <Form.Group className="mb-4">
                  <Form.Label className="small fw-semibold">E-mail</Form.Label>
                  <Form.Control value={user.email} disabled />
                  <Form.Text>Para trocar o e-mail, fale com o administrador do sistema.</Form.Text>
                </Form.Group>
                <div className="d-flex gap-2 flex-wrap">
                  <Button type="submit" disabled={salvando || !nome.trim() || nome.trim() === user.nome}>
                    {salvando ? <Spinner size="sm" className="me-1" /> : <i className="bi bi-check-lg me-1" />}
                    Salvar
                  </Button>
                  <Link to="/trocar-senha" className="btn btn-light">
                    <i className="bi bi-key me-1" /> Alterar senha
                  </Link>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={7}>
          <Card className="card-app h-100">
            <Card.Header>
              <i className="bi bi-laptop" /> Sessões abertas
              {outras > 0 && (
                <Button size="sm" variant="outline-danger" className="ms-auto" onClick={() => setEncerrarOutras(true)}>
                  Encerrar as outras ({outras})
                </Button>
              )}
            </Card.Header>
            <Card.Body className="p-0">
              {!sessoes ? (
                <div className="text-center py-4">
                  <Spinner animation="border" size="sm" variant="primary" />
                </div>
              ) : (
                <ul className="session-list">
                  {sessoes.map((s) => (
                    <li key={s.id}>
                      <i
                        className={`bi bi-${/iPhone|Android|iPad/.test(s.user_agent ?? '') ? 'phone' : 'laptop'} fs-4 text-muted`}
                      />
                      <div className="flex-grow-1 min-w-0">
                        <div className="fw-semibold">
                          {describeUserAgent(s.user_agent)}
                          {s.atual && (
                            <Badge bg="success" className="ms-2">
                              Esta sessão
                            </Badge>
                          )}
                          {s.lembrar && (
                            <Badge bg="light" text="dark" className="ms-2 border">
                              Manter conectado
                            </Badge>
                          )}
                        </div>
                        <div className="small text-muted">
                          {s.ip ?? 'IP desconhecido'} · último uso {fmtDate(s.ultimo_uso, true)} · entrou em{' '}
                          {fmtDate(s.criado_em, true)}
                        </div>
                      </div>
                      {!s.atual && (
                        <Button size="sm" variant="light" className="text-danger" onClick={() => void encerrar(s.id)}>
                          Encerrar
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col lg={7}>
          <DoisFatoresCard />
        </Col>
        <Col lg={5}>
          <SeusDadosCard />
        </Col>
        <Col lg={12}>
          <IntegracoesCard />
        </Col>
      </Row>

      <ConfirmModal
        show={encerrarOutras}
        title="Encerrar outras sessões"
        message="Todos os outros dispositivos conectados com o seu usuário serão desconectados. Esta sessão continua ativa."
        confirmLabel="Encerrar"
        onConfirm={() => void encerrarTodas()}
        onCancel={() => setEncerrarOutras(false)}
      />
    </>
  );
}
