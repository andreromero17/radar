import { useState, type FormEvent } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import AuthLayout from '../../layout/AuthLayout';

export default function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await api.post('/auth/esqueci', { email });
      setEnviado(true);
    } catch (err) {
      setErro(errorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <AuthLayout title="Verifique seu e-mail">
        <Alert variant="success" className="small">
          <i className="bi bi-envelope-check me-1" /> Se <b>{email}</b> estiver cadastrado, você vai receber um link
          para criar uma nova senha. O link vale por 1 hora.
        </Alert>
        <Link to="/login" className="btn btn-light w-100">
          Voltar para o login
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Esqueci minha senha"
      subtitle="Informe seu e-mail e enviaremos um link para criar uma nova senha."
    >
      <Form onSubmit={submit} noValidate>
        {erro && (
          <Alert variant="danger" className="py-2 small">
            {erro}
          </Alert>
        )}
        <Form.Group className="mb-4">
          <Form.Label htmlFor="email" className="small fw-semibold">
            E-mail
          </Form.Label>
          <Form.Control id="email" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Form.Group>
        <Button type="submit" className="w-100 mb-2" disabled={enviando || !email}>
          {enviando ? <Spinner size="sm" /> : 'Enviar link'}
        </Button>
        <Link to="/login" className="btn btn-link w-100 text-decoration-none">
          Voltar para o login
        </Link>
      </Form>
    </AuthLayout>
  );
}
