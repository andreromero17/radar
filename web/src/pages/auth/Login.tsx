import { useState, type FormEvent } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiError, errorMessage } from '../../lib/api';
import AuthLayout from '../../layout/AuthLayout';
import PasswordInput from '../../components/PasswordInput';

export default function Login() {
  const { login, entrarComCodigo } = useAuth();
  const [desafio, setDesafio] = useState('');
  const [codigo, setCodigo] = useState('');
  const [recuperacao, setRecuperacao] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const r = await login(email, senha, lembrar); // o redirecionamento é feito pelo PublicOnly
      if ('segundo_fator' in r) {
        setDesafio(r.desafio);
        setEnviando(false);
      }
    } catch (err) {
      setErro(errorMessage(err));
      setEnviando(false);
    }
  };

  const enviarCodigo = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await entrarComCodigo(desafio, codigo);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DESAFIO_EXPIRADO') {
        setDesafio('');
        setCodigo('');
        setSenha('');
      }
      setErro(err instanceof ApiError && err.fields.codigo ? err.fields.codigo : errorMessage(err));
      setEnviando(false);
    }
  };

  if (desafio)
    return (
      <AuthLayout
        title="Verificação em duas etapas"
        subtitle={
          recuperacao
            ? 'Digite um dos seus códigos de recuperação (cada um vale uma vez).'
            : 'Digite o código de 6 dígitos do seu aplicativo autenticador.'
        }
      >
        <Form onSubmit={enviarCodigo} noValidate>
          {erro && (
            <Alert variant="danger" className="py-2 small">
              <i className="bi bi-exclamation-circle me-1" /> {erro}
            </Alert>
          )}
          <Form.Control
            id="codigo"
            className="codigo-2fa mb-3"
            inputMode={recuperacao ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            autoFocus
            maxLength={recuperacao ? 11 : 6}
            placeholder={recuperacao ? 'XXXXX-XXXXX' : '000000'}
            value={codigo}
            onChange={(e) => setCodigo(recuperacao ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ''))}
            aria-label="Código"
          />
          <Button type="submit" className="w-100 mb-2" disabled={enviando || codigo.length < 6}>
            {enviando ? <Spinner size="sm" /> : 'Confirmar'}
          </Button>
          <Button
            variant="link"
            className="w-100 small text-decoration-none"
            onClick={() => {
              setRecuperacao(!recuperacao);
              setCodigo('');
              setErro('');
            }}
          >
            {recuperacao ? 'Usar o código do aplicativo' : 'Sem o celular? Usar um código de recuperação'}
          </Button>
          <Button
            variant="link"
            className="w-100 small text-muted text-decoration-none"
            onClick={() => {
              setDesafio('');
              setCodigo('');
            }}
          >
            Voltar
          </Button>
        </Form>
      </AuthLayout>
    );

  return (
    <AuthLayout title="Entrar" subtitle="Acesse com seu e-mail e senha.">
      <Form onSubmit={submit} noValidate>
        {erro && (
          <Alert variant="danger" className="py-2 small">
            <i className="bi bi-exclamation-circle me-1" /> {erro}
          </Alert>
        )}
        <Form.Group className="mb-3">
          <Form.Label htmlFor="email" className="small fw-semibold">
            E-mail
          </Form.Label>
          <Form.Control
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Form.Group>
        <Form.Group className="mb-2">
          <div className="d-flex justify-content-between align-items-baseline">
            <Form.Label htmlFor="senha" className="small fw-semibold">
              Senha
            </Form.Label>
            <Link to="/esqueci-senha" className="small">
              Esqueci minha senha
            </Link>
          </div>
          <PasswordInput id="senha" value={senha} onChange={setSenha} autoComplete="current-password" />
        </Form.Group>
        <Form.Check
          id="lembrar"
          className="mb-4 small"
          label="Manter conectado neste dispositivo"
          checked={lembrar}
          onChange={(e) => setLembrar(e.target.checked)}
        />
        <Button type="submit" className="w-100" disabled={enviando || !email || !senha}>
          {enviando ? <Spinner size="sm" /> : 'Entrar'}
        </Button>
      </Form>
    </AuthLayout>
  );
}
