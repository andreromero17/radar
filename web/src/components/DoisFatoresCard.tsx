import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Form, Spinner } from 'react-bootstrap';
import type { AuthUser } from '@frame/shared';
import { api, ApiError, errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PasswordInput from './PasswordInput';

interface Status {
  ativo: boolean;
  obrigatorio: boolean;
  codigos_restantes: number;
}

type Etapa = 'status' | 'senha' | 'qr' | 'codigos' | 'desligar' | 'regerar';

/** Verificação em duas etapas do próprio usuário: ligar (senha → QR → código → códigos de recuperação), desligar */
export default function DoisFatoresCard({ onAtivado }: { onAtivado?: () => void }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [etapa, setEtapa] = useState<Etapa>('status');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [qr, setQr] = useState<{ qr: string; segredo: string } | null>(null);
  const [codigos, setCodigos] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(
    () =>
      api
        .get<Status>('/auth/2fa')
        .then(setStatus)
        .catch((e) => toast.error(errorMessage(e))),
    [toast],
  );
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const reset = (e: Etapa = 'status') => {
    setEtapa(e);
    setSenha('');
    setCodigo('');
    setErro('');
  };

  const enviar = async (fn: () => Promise<void>) => {
    setErro('');
    setEnviando(true);
    try {
      await fn();
    } catch (err) {
      setErro(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : errorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  const iniciar = (e: FormEvent) => {
    e.preventDefault();
    void enviar(async () => {
      setQr(await api.post<{ qr: string; segredo: string }>('/auth/2fa/iniciar', { senha }));
      reset('qr');
    });
  };
  const ativar = (e: FormEvent) => {
    e.preventDefault();
    void enviar(async () => {
      const r = await api.post<{ codigos: string[]; usuario: AuthUser }>('/auth/2fa/ativar', { codigo });
      setUser(r.usuario);
      setCodigos(r.codigos);
      reset('codigos');
      await carregar();
    });
  };
  const desligar = (e: FormEvent) => {
    e.preventDefault();
    void enviar(async () => {
      setUser(await api.post<AuthUser>('/auth/2fa/desativar', { senha, codigo }));
      toast.success('Verificação em duas etapas desligada');
      reset();
      await carregar();
    });
  };
  const regerar = (e: FormEvent) => {
    e.preventDefault();
    void enviar(async () => {
      const r = await api.post<{ codigos: string[] }>('/auth/2fa/codigos', { senha });
      setCodigos(r.codigos);
      reset('codigos');
      await carregar();
    });
  };

  const copiar = () => {
    void navigator.clipboard?.writeText(codigos.join('\n'));
    toast.success('Códigos copiados');
  };

  const erroBox = erro && (
    <Alert variant="danger" className="py-2 small">
      {erro}
    </Alert>
  );
  const campoSenha = (
    <Form.Group className="mb-3">
      <Form.Label htmlFor="senha-2fa" className="small fw-semibold">
        Sua senha
      </Form.Label>
      <PasswordInput id="senha-2fa" value={senha} onChange={setSenha} autoComplete="current-password" autoFocus />
    </Form.Group>
  );
  const campoCodigo = (autoFocus = false) => (
    <Form.Control
      className="codigo-2fa mb-3"
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      maxLength={11}
      placeholder="000000"
      value={codigo}
      onChange={(e) => setCodigo(e.target.value)}
      aria-label="Código"
    />
  );
  const cancelar = (
    <Button variant="light" onClick={() => reset()}>
      Cancelar
    </Button>
  );

  return (
    <Card className="card-app">
      <Card.Header className="d-flex align-items-center gap-2">
        <i className="bi bi-shield-check" />
        <span className="fw-bold flex-grow-1">Verificação em duas etapas</span>
        {status &&
          (status.ativo ? (
            <Badge bg="success">Ligada</Badge>
          ) : (
            <Badge bg={status.obrigatorio ? 'warning' : 'secondary'} text={status.obrigatorio ? 'dark' : undefined}>
              {status.obrigatorio ? 'Obrigatória' : 'Desligada'}
            </Badge>
          ))}
      </Card.Header>
      <Card.Body className="p-4">
        {!status ? (
          <Spinner size="sm" />
        ) : etapa === 'status' ? (
          <>
            <p className="small text-muted">
              Além da senha, o login pede um código de 6 dígitos gerado no seu celular por um aplicativo autenticador
              (Google Authenticator, Microsoft Authenticator, 1Password…). Mesmo que alguém descubra sua senha, não
              entra sem o celular.
            </p>
            {status.ativo ? (
              <>
                <p className="small mb-3">
                  <i className="bi bi-key me-1" />
                  {status.codigos_restantes} código(s) de recuperação disponíveis.
                </p>
                <div className="d-flex flex-wrap gap-2">
                  <Button variant="light" className="border" onClick={() => reset('regerar')}>
                    Gerar novos códigos de recuperação
                  </Button>
                  {!status.obrigatorio && (
                    <Button variant="light" className="border text-danger" onClick={() => reset('desligar')}>
                      Desligar
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <Button onClick={() => reset('senha')}>
                <i className="bi bi-shield-plus me-1" />
                Ligar a verificação em duas etapas
              </Button>
            )}
          </>
        ) : etapa === 'senha' ? (
          <Form onSubmit={iniciar} noValidate>
            {erroBox}
            {campoSenha}
            <div className="d-flex gap-2">
              <Button type="submit" disabled={enviando || !senha}>
                Continuar
              </Button>
              {cancelar}
            </div>
          </Form>
        ) : etapa === 'qr' && qr ? (
          <Form onSubmit={ativar} noValidate>
            {erroBox}
            <ol className="small ps-3">
              <li>Abra o aplicativo autenticador no celular e adicione uma conta pelo QR code:</li>
            </ol>
            <div className="qr-2fa mb-2" dangerouslySetInnerHTML={{ __html: qr.qr }} />
            <div className="small text-muted text-center mb-3">
              Sem câmera? Digite a chave:{' '}
              <code className="user-select-all">{qr.segredo.replace(/(.{4})/g, '$1 ')}</code>
            </div>
            <ol className="small ps-3" start={2}>
              <li>Digite o código de 6 dígitos que aparece no aplicativo:</li>
            </ol>
            {campoCodigo(true)}
            <div className="d-flex gap-2">
              <Button type="submit" disabled={enviando || codigo.replace(/\D/g, '').length !== 6}>
                {enviando ? <Spinner size="sm" /> : 'Confirmar e ligar'}
              </Button>
              {cancelar}
            </div>
          </Form>
        ) : etapa === 'codigos' ? (
          <>
            <Alert variant="warning" className="small">
              <b>Guarde estes códigos de recuperação</b> num lugar seguro (gerenciador de senhas, papel). Cada um entra
              uma vez se você perder o celular. Eles não serão mostrados de novo.
            </Alert>
            <div className="codigos-recuperacao mb-3">
              {codigos.map((c) => (
                <code key={c}>{c}</code>
              ))}
            </div>
            <div className="d-flex gap-2">
              <Button variant="light" className="border" onClick={copiar}>
                <i className="bi bi-clipboard me-1" />
                Copiar
              </Button>
              <Button
                onClick={() => {
                  reset();
                  setCodigos([]);
                  onAtivado?.();
                }}
              >
                Já guardei
              </Button>
            </div>
          </>
        ) : etapa === 'desligar' ? (
          <Form onSubmit={desligar} noValidate>
            {erroBox}
            {campoSenha}
            <Form.Label className="small fw-semibold">Código do aplicativo (ou de recuperação)</Form.Label>
            {campoCodigo()}
            <div className="d-flex gap-2">
              <Button variant="danger" type="submit" disabled={enviando || !senha || !codigo}>
                Desligar
              </Button>
              {cancelar}
            </div>
          </Form>
        ) : (
          <Form onSubmit={regerar} noValidate>
            {erroBox}
            <p className="small text-muted">Os códigos antigos deixam de valer.</p>
            {campoSenha}
            <div className="d-flex gap-2">
              <Button type="submit" disabled={enviando || !senha}>
                Gerar
              </Button>
              {cancelar}
            </div>
          </Form>
        )}
      </Card.Body>
    </Card>
  );
}
