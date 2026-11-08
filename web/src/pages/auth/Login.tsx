import { useState, type FormEvent } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/api';
import AuthLayout from '../../layout/AuthLayout';
import PasswordInput from '../../components/PasswordInput';

export default function Login() {
  const { login } = useAuth();
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
      await login(email, senha, lembrar); // o redirecionamento é feito pelo PublicOnly
    } catch (err) {
      setErro(errorMessage(err));
      setEnviando(false);
    }
  };

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
