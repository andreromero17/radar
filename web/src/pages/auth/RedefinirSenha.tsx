import { useEffect, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { FieldErrors } from '@frame/shared';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import AuthLayout from '../../layout/AuthLayout';
import NovaSenhaForm from './NovaSenhaForm';

export default function RedefinirSenha() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const toast = useToast();
  const { user, logout } = useAuth();
  const [estado, setEstado] = useState<'validando' | 'ok' | 'invalido'>('validando');
  const [nome, setNome] = useState('');
  const [erros, setErros] = useState<FieldErrors>({});

  useEffect(() => {
    if (!token) return setEstado('invalido');
    api
      .post<{ nome: string }>('/auth/redefinir/validar', { token })
      .then((r) => {
        setNome(r.nome);
        setEstado('ok');
      })
      .catch(() => setEstado('invalido'));
  }, [token]);

  const salvar = async ({ nova }: { nova: string }) => {
    try {
      await api.post('/auth/redefinir', { token, senha: nova });
      if (user) await logout(); // a redefinição encerra todas as sessões
      toast.success('Senha redefinida. Entre com a nova senha.');
      navigate('/login', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErros({ nova: err.fields.senha ?? '' });
      else {
        toast.error(errorMessage(err));
        setEstado('invalido');
      }
    }
  };

  if (estado === 'validando') {
    return (
      <AuthLayout title="Redefinir senha">
        <div className="text-center py-4">
          <Spinner animation="border" variant="primary" />
        </div>
      </AuthLayout>
    );
  }

  if (estado === 'invalido') {
    return (
      <AuthLayout title="Link inválido">
        <Alert variant="warning" className="small">
          Este link de redefinição é inválido, já foi usado ou expirou (vale por 1 hora).
        </Alert>
        <Link to="/esqueci-senha" className="btn btn-primary w-100 mb-2">
          Pedir um novo link
        </Link>
        <Link to="/login" className="btn btn-link w-100 text-decoration-none">
          Voltar para o login
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Criar nova senha" subtitle={`Olá, ${nome}. Escolha sua nova senha.`}>
      <NovaSenhaForm submitLabel="Salvar nova senha" onSubmit={salvar} serverErrors={erros} />
    </AuthLayout>
  );
}
