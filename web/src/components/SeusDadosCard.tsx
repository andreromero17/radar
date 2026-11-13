import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Form, Modal, Spinner } from 'react-bootstrap';
import { api, ApiError, errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PasswordInput from './PasswordInput';

/** LGPD: baixar uma cópia dos próprios dados e excluir a conta (Fase 5D) */
export default function SeusDadosCard() {
  const { user } = useAuth();
  const toast = useToast();
  const [modal, setModal] = useState<'baixar' | 'excluir' | null>(null);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [saem, setSaem] = useState<{ id: number; nome: string; membros: number }[] | null>(null);

  const abrir = (m: 'baixar' | 'excluir') => {
    setModal(m);
    setSenha('');
    setConfirmacao('');
    setCodigo('');
    setErro('');
    if (m === 'excluir')
      api
        .get<{ espacos: { id: number; nome: string; membros: number }[] }>('/auth/excluir-conta')
        .then((r) => setSaem(r.espacos))
        .catch((e) => setErro(errorMessage(e)));
  };

  const falha = (err: unknown) =>
    setErro(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : errorMessage(err));

  const baixar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const dados = await api.post<unknown>('/auth/meus-dados', { senha });
      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setModal(null);
      toast.success('Arquivo baixado');
    } catch (err) {
      falha(err);
    } finally {
      setEnviando(false);
    }
  };

  const excluir = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await api.post('/auth/excluir-conta', { senha, confirmacao, codigo: codigo || undefined });
      window.location.assign('/login');
    } catch (err) {
      falha(err);
      setEnviando(false);
    }
  };

  const erroBox = erro && (
    <Alert variant="danger" className="py-2 small">
      {erro}
    </Alert>
  );

  return (
    <Card className="card-app">
      <Card.Header className="d-flex align-items-center gap-2">
        <i className="bi bi-person-lock" />
        <span className="fw-bold">Seus dados</span>
      </Card.Header>
      <Card.Body className="p-4">
        <p className="small text-muted">
          Você pode baixar uma cópia de tudo o que é seu (conta, acessos e os espaços de que é dono) ou excluir a sua
          conta. Veja a <a href="/privacidade">política de privacidade</a>.
        </p>
        <div className="d-flex flex-wrap gap-2">
          <Button variant="light" className="border" onClick={() => abrir('baixar')}>
            <i className="bi bi-download me-1" />
            Baixar meus dados
          </Button>
          <Button variant="light" className="border text-danger" onClick={() => abrir('excluir')}>
            <i className="bi bi-trash me-1" />
            Excluir minha conta
          </Button>
        </div>
      </Card.Body>

      <Modal show={modal === 'baixar'} onHide={() => setModal(null)} centered>
        <Form onSubmit={baixar} noValidate>
          <Modal.Header closeButton>
            <Modal.Title className="fs-5 fw-bold">Baixar meus dados</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {erroBox}
            <p className="small text-muted">
              Um arquivo (JSON) com a sua conta, seus acessos e os dados completos dos espaços de que você é dono. Os
              arquivos anexos não vão junto (só a lista).
            </p>
            <Form.Label htmlFor="senha-dados" className="small fw-semibold">
              Confirme sua senha
            </Form.Label>
            <PasswordInput
              id="senha-dados"
              value={senha}
              onChange={setSenha}
              autoComplete="current-password"
              autoFocus
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="light" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando || !senha}>
              {enviando ? <Spinner size="sm" /> : 'Baixar'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={modal === 'excluir'} onHide={() => setModal(null)} centered>
        <Form onSubmit={excluir} noValidate>
          <Modal.Header closeButton>
            <Modal.Title className="fs-5 fw-bold text-danger">Excluir minha conta</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {erroBox}
            <p className="small">
              Sua conta deixa de existir e você sai de todos os espaços. Nos espaços de outras pessoas, o seu nome sai
              dos registros. <b>Baixe os seus dados antes, se quiser guardar.</b>
            </p>
            {saem === null ? (
              <Spinner size="sm" />
            ) : saem.length ? (
              <Alert variant="warning" className="small">
                Você é o único dono destes espaços, que <b>serão excluídos junto</b> (apagados de vez em 30 dias):
                <ul className="mb-0 mt-1">
                  {saem.map((e) => (
                    <li key={e.id}>
                      {e.nome}
                      {e.membros > 0 && ` — ${e.membros} outra(s) pessoa(s) perdem o acesso`}
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            <Form.Label htmlFor="senha-excluir" className="small fw-semibold">
              Sua senha
            </Form.Label>
            <PasswordInput id="senha-excluir" value={senha} onChange={setSenha} autoComplete="current-password" />
            {user?.dois_fatores && (
              <>
                <Form.Label className="small fw-semibold mt-3">Código da verificação em duas etapas</Form.Label>
                <Form.Control
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </>
            )}
            <Form.Label className="small fw-semibold mt-3">
              Digite <b>EXCLUIR</b> para confirmar
            </Form.Label>
            <Form.Control value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="light" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            <Button variant="danger" type="submit" disabled={enviando || !senha || confirmacao !== 'EXCLUIR'}>
              {enviando ? <Spinner size="sm" /> : 'Excluir minha conta'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Card>
  );
}
