import { useEffect, useRef, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import { recarregarNoEspaco } from '../../lib/espacos';
import AuthLayout from '../../layout/AuthLayout';

/** Link do e-mail de confirmação: ativa a conta, cria o primeiro espaço e entra */
export default function ConfirmarEmail() {
  const [params] = useSearchParams();
  const [erro, setErro] = useState('');
  const feito = useRef(false);

  useEffect(() => {
    if (feito.current) return; // o link vale uma vez (o modo estrito do React roda efeitos duas vezes)
    feito.current = true;
    const token = params.get('token') ?? '';
    api
      .post('/auth/cadastro/confirmar', { token })
      .then(() => recarregarNoEspaco())
      .catch((e) => setErro(errorMessage(e)));
  }, [params]);

  return (
    <AuthLayout title={erro ? 'Não deu certo' : 'Confirmando seu e-mail'}>
      {erro ? (
        <>
          <Alert variant="warning" className="small">
            {erro}
          </Alert>
          <Link to="/login" className="btn btn-primary w-100">
            Ir para o login
          </Link>
        </>
      ) : (
        <div className="text-center py-4">
          <Spinner animation="border" variant="primary" />
        </div>
      )}
    </AuthLayout>
  );
}
