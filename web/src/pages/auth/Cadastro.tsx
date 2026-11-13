import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { passwordSchema, type FieldErrors } from '@frame/shared';
import { api, ApiError, errorMessage } from '../../lib/api';
import { recarregarNoEspaco } from '../../lib/espacos';
import { useSettings } from '../../context/SettingsContext';
import AuthLayout from '../../layout/AuthLayout';
import PasswordInput from '../../components/PasswordInput';

/**
 * Criar conta (Fase 5D). Com convite da plataforma (?convite=): e-mail fixo, a conta já entra. Com o cadastro
 * aberto: manda o link de confirmação. A pessoa ganha o primeiro espaço, como dona.
 */
export default function Cadastro() {
  const [params] = useSearchParams();
  const convite = params.get('convite') ?? '';
  const { settings } = useSettings();
  const [emailConvite, setEmailConvite] = useState<string | null>(null);
  const [conviteInvalido, setConviteInvalido] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [espaco, setEspaco] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [aceite, setAceite] = useState(false);
  const [erros, setErros] = useState<FieldErrors>({});
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviadoPara, setEnviadoPara] = useState('');

  useEffect(() => {
    if (!convite) return;
    api
      .get<{ email: string }>(`/auth/cadastro/convite/${encodeURIComponent(convite)}`)
      .then((r) => {
        setEmailConvite(r.email);
        setEmail(r.email);
      })
      .catch((e) => setConviteInvalido(errorMessage(e)));
  }, [convite]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const local: FieldErrors = {};
    if (nome.trim().length < 2) local.nome = 'Informe seu nome';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) local.email = 'Informe um e-mail válido';
    const s = passwordSchema.safeParse(senha);
    if (!s.success) local.senha = s.error.issues[0].message;
    if (senha !== confirma) local.confirma = 'As senhas não conferem';
    if (!aceite) local.aceite = 'É preciso aceitar para continuar';
    setErros(local);
    setErro('');
    if (Object.keys(local).length) return;
    setEnviando(true);
    try {
      const r = await api.post<{ entrou: boolean; email?: string }>('/auth/cadastro', {
        nome,
        email,
        senha,
        espaco: espaco || undefined,
        aceite: true,
        convite: convite || undefined,
      });
      // com convite a API já abre a sessão e devolve o usuário; sem convite, { entrou: false } (confirmar e-mail)
      if (r.entrou === false) setEnviadoPara(r.email ?? email);
      else recarregarNoEspaco();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErros(err.fields);
      else setErro(errorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  if (enviadoPara)
    return (
      <AuthLayout title="Confira seu e-mail">
        <Alert variant="success" className="small">
          Enviamos um link de confirmação para <b>{enviadoPara}</b>. Ele vale por 24 horas. Ao confirmar, sua conta é
          ativada e você já entra.
        </Alert>
        <p className="small text-muted">Não chegou? Veja a caixa de spam ou faça o cadastro de novo.</p>
        <Link to="/login" className="btn btn-light border w-100">
          Ir para o login
        </Link>
      </AuthLayout>
    );

  if (conviteInvalido || (!convite && !settings.cadastro_aberto))
    return (
      <AuthLayout title="Criar conta">
        <Alert variant="warning" className="small">
          {conviteInvalido ||
            'No momento o cadastro é só por convite. Se alguém convidou você, use o link que chegou por e-mail.'}
        </Alert>
        <Link to="/login" className="btn btn-primary w-100">
          Ir para o login
        </Link>
      </AuthLayout>
    );

  if (convite && !emailConvite)
    return (
      <AuthLayout title="Criar conta">
        <div className="text-center py-4">
          <Spinner animation="border" variant="primary" />
        </div>
      </AuthLayout>
    );

  const campo = (k: string) => ({ isInvalid: !!erros[k] });
  return (
    <AuthLayout
      title="Criar conta"
      subtitle={emailConvite ? 'Você foi convidado(a) para testar o sistema. Bem-vindo(a)!' : undefined}
    >
      <Form onSubmit={enviar} noValidate>
        {erro && (
          <Alert variant="danger" className="py-2 small">
            {erro}
          </Alert>
        )}
        <Form.Group className="mb-3">
          <Form.Label htmlFor="nome" className="small fw-semibold">
            Seu nome
          </Form.Label>
          <Form.Control
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
            autoFocus
            {...campo('nome')}
          />
          <Form.Control.Feedback type="invalid">{erros.nome}</Form.Control.Feedback>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="email" className="small fw-semibold">
            E-mail
          </Form.Label>
          <Form.Control
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            readOnly={!!emailConvite}
            autoComplete="username"
            {...campo('email')}
          />
          <Form.Control.Feedback type="invalid">{erros.email}</Form.Control.Feedback>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="espaco" className="small fw-semibold">
            Nome do seu espaço <span className="text-muted fw-normal">(opcional)</span>
          </Form.Label>
          <Form.Control
            id="espaco"
            value={espaco}
            onChange={(e) => setEspaco(e.target.value)}
            placeholder="Pessoal"
            maxLength={80}
          />
          <Form.Text>Onde ficam as suas finanças. Dá para criar outros depois (holding, empresa).</Form.Text>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="senha" className="small fw-semibold">
            Senha
          </Form.Label>
          <PasswordInput
            id="senha"
            value={senha}
            onChange={setSenha}
            autoComplete="new-password"
            showRules
            isInvalid={!!erros.senha}
            error={erros.senha}
          />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="confirma" className="small fw-semibold">
            Confirme a senha
          </Form.Label>
          <PasswordInput
            id="confirma"
            value={confirma}
            onChange={setConfirma}
            autoComplete="new-password"
            isInvalid={!!erros.confirma}
            error={erros.confirma}
          />
        </Form.Group>
        <Form.Check
          id="aceite"
          className="mb-4 small"
          checked={aceite}
          onChange={(e) => setAceite(e.target.checked)}
          isInvalid={!!erros.aceite}
          feedback={erros.aceite}
          feedbackType="invalid"
          label={
            <>
              Li e aceito os{' '}
              <Link to="/termos" target="_blank">
                termos de uso
              </Link>{' '}
              e a{' '}
              <Link to="/privacidade" target="_blank">
                política de privacidade
              </Link>
            </>
          }
        />
        <Button type="submit" className="w-100 mb-2" disabled={enviando}>
          {enviando ? <Spinner size="sm" /> : 'Criar conta'}
        </Button>
        <Link to="/login" className="btn btn-link w-100 text-decoration-none small">
          Já tenho conta
        </Link>
      </Form>
    </AuthLayout>
  );
}
