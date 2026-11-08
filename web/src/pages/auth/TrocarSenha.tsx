import { useState } from 'react';
import { Alert, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import type { AuthUser, FieldErrors } from '@frame/shared';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import AuthLayout from '../../layout/AuthLayout';
import NovaSenhaForm from './NovaSenhaForm';

/** Troca da própria senha. Obrigatória no primeiro acesso ou após o admin redefinir. */
export default function TrocarSenha() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [erros, setErros] = useState<FieldErrors>({});
  const obrigatoria = !!user?.trocar_senha;

  const salvar = async ({ atual, nova }: { atual: string; nova: string }) => {
    setErros({});
    try {
      const u = await api.put<AuthUser>('/auth/senha', { atual, nova });
      setUser(u);
      toast.success('Senha alterada. Suas outras sessões foram encerradas.');
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setErros(err.fields);
      if (!(err instanceof ApiError) || !Object.keys(err.fields).length) toast.error(errorMessage(err));
    }
  };

  return (
    <AuthLayout
      title={obrigatoria ? 'Defina uma nova senha' : 'Alterar senha'}
      subtitle={
        obrigatoria
          ? `Olá, ${user?.nome}. Por segurança, troque a senha provisória antes de continuar.`
          : 'Ao alterar, as sessões abertas em outros dispositivos serão encerradas.'
      }
    >
      {obrigatoria && (
        <Alert variant="info" className="small py-2">
          <i className="bi bi-shield-lock me-1" /> Use a senha que você recebeu como “senha atual”.
        </Alert>
      )}
      <NovaSenhaForm
        pedirAtual
        submitLabel="Salvar nova senha"
        onSubmit={salvar}
        serverErrors={erros}
        extra={
          obrigatoria ? (
            <Button variant="link" className="w-100 text-decoration-none" onClick={() => void logout()}>
              Sair
            </Button>
          ) : (
            <Button variant="link" className="w-100 text-decoration-none" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
          )
        }
      />
    </AuthLayout>
  );
}
