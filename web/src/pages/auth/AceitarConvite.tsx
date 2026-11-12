import { useEffect, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { Link, useParams } from 'react-router-dom';
import {
  PAPEL_DESCRICOES,
  PAPEL_LABELS,
  TIPO_ESPACO_LABELS,
  type ConvitePublico,
  type FieldErrors,
} from '@frame/shared';
import { api, ApiError, errorMessage } from '../../lib/api';
import { recarregarNoEspaco } from '../../lib/espacos';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import AuthLayout from '../../layout/AuthLayout';
import NovaSenhaForm from './NovaSenhaForm';

/**
 * Link do convite (/convite/:token), logado ou não:
 *  - logado com o e-mail convidado → aceitar
 *  - logado com outra conta → sair e entrar com a certa
 *  - sem login e com conta → entrar (volta para cá)
 *  - sem conta → nome + senha, cria a conta e entra
 */
export default function AceitarConvite() {
  const { token = '' } = useParams();
  const { user, logout } = useAuth();
  const toast = useToast();
  const [convite, setConvite] = useState<ConvitePublico | null>(null);
  const [invalido, setInvalido] = useState('');
  const [nome, setNome] = useState('');
  const [erros, setErros] = useState<FieldErrors>({});
  const [aceitando, setAceitando] = useState(false);

  useEffect(() => {
    api
      .get<ConvitePublico>(`/auth/convites/${encodeURIComponent(token)}`)
      .then(setConvite)
      .catch((e) => setInvalido(errorMessage(e)));
  }, [token, user?.id]);

  const aceitar = async (senha?: string) => {
    setAceitando(true);
    try {
      await api.post(`/auth/convites/${encodeURIComponent(token)}/aceitar`, senha ? { nome, senha } : {});
      toast.success(`Bem-vindo(a) ao espaço "${convite?.espaco}"`);
      recarregarNoEspaco();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErros(e.fields);
      else toast.error(errorMessage(e));
      setAceitando(false);
    }
  };

  if (invalido)
    return (
      <AuthLayout title="Convite indisponível">
        <Alert variant="warning" className="small">
          {invalido}
        </Alert>
        <Link to={user ? '/' : '/login'} className="btn btn-primary w-100">
          {user ? 'Ir para o sistema' : 'Ir para o login'}
        </Link>
      </AuthLayout>
    );

  if (!convite)
    return (
      <AuthLayout title="Convite">
        <div className="text-center py-4">
          <Spinner animation="border" variant="primary" />
        </div>
      </AuthLayout>
    );

  const resumo = (
    <div className="convite-resumo mb-3">
      <div className="small text-muted">
        {convite.convidado_por ? `${convite.convidado_por} convidou você para` : 'Você foi convidado(a) para'}
      </div>
      <div className="fs-5 fw-bold">{convite.espaco}</div>
      <div className="small text-muted mb-2">{TIPO_ESPACO_LABELS[convite.tipo] ?? convite.tipo}</div>
      <div className="small">
        como <b>{PAPEL_LABELS[convite.papel].toLowerCase()}</b>: {PAPEL_DESCRICOES[convite.papel].toLowerCase()}.
      </div>
    </div>
  );
  const proxima = `/login?next=${encodeURIComponent(`/convite/${token}`)}`;

  // logado
  if (user) {
    const mesmo = user.email.toLowerCase() === convite.email.toLowerCase();
    return (
      <AuthLayout title="Convite">
        {resumo}
        {mesmo ? (
          <Button className="w-100 mb-2" disabled={aceitando} onClick={() => void aceitar()}>
            {aceitando ? <Spinner size="sm" /> : 'Aceitar e entrar no espaço'}
          </Button>
        ) : (
          <>
            <Alert variant="warning" className="small">
              Este convite é para <b>{convite.email}</b>, mas você está conectado(a) como <b>{user.email}</b>.
            </Alert>
            <Button
              variant="light"
              className="w-100 mb-2 border"
              onClick={() => void logout().then(() => window.location.assign(proxima))}
            >
              Sair e entrar com {convite.email}
            </Button>
          </>
        )}
        <Link to="/" className="btn btn-link w-100 text-decoration-none">
          Agora não
        </Link>
      </AuthLayout>
    );
  }

  // sem login, já tem conta
  if (convite.tem_conta)
    return (
      <AuthLayout title="Convite">
        {resumo}
        <p className="small text-muted">
          Já existe uma conta para <b>{convite.email}</b>. Entre com ela para aceitar.
        </p>
        <Link to={proxima} className="btn btn-primary w-100">
          Entrar para aceitar
        </Link>
      </AuthLayout>
    );

  // sem conta: cria e entra
  return (
    <AuthLayout title="Convite">
      {resumo}
      <p className="small text-muted mb-3">
        Crie sua conta para <b>{convite.email}</b>:
      </p>
      <Form.Group className="mb-3">
        <Form.Label htmlFor="nome" className="small fw-semibold">
          Seu nome
        </Form.Label>
        <Form.Control
          id="nome"
          value={nome}
          onChange={(e) => {
            setNome(e.target.value);
            setErros(({ nome: _n, ...r }) => r);
          }}
          isInvalid={!!erros.nome}
          autoComplete="name"
          maxLength={120}
        />
        <Form.Control.Feedback type="invalid">{erros.nome}</Form.Control.Feedback>
      </Form.Group>
      <NovaSenhaForm
        submitLabel={aceitando ? 'Criando…' : 'Criar conta e entrar'}
        serverErrors={erros.senha ? { nova: erros.senha } : {}}
        onSubmit={async ({ nova }) => {
          if (nome.trim().length < 2) return setErros({ nome: 'Informe seu nome' });
          await aceitar(nova);
        }}
      />
    </AuthLayout>
  );
}
