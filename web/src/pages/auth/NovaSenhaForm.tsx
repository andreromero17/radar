import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, Form, Spinner } from 'react-bootstrap';
import { passwordSchema, type FieldErrors } from '@frame/shared';
import PasswordInput from '../../components/PasswordInput';

interface Props {
  /** Pede a senha atual (troca) ou não (redefinição por link) */
  pedirAtual?: boolean;
  submitLabel: string;
  onSubmit: (dados: { atual: string; nova: string }) => Promise<void>;
  /** Erros vindos da API */
  serverErrors?: FieldErrors;
  extra?: ReactNode;
}

/** Formulário de nova senha + confirmação, com a política exibida em tempo real */
export default function NovaSenhaForm({ pedirAtual, submitLabel, onSubmit, serverErrors = {}, extra }: Props) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erros, setErros] = useState<FieldErrors>({});
  const [enviando, setEnviando] = useState(false);
  const e = { ...serverErrors, ...erros };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const local: FieldErrors = {};
    if (pedirAtual && !atual) local.atual = 'Informe a senha atual';
    const check = passwordSchema.safeParse(nova);
    if (!check.success) local.nova = check.error.issues[0].message;
    if (nova !== confirma) local.confirma = 'As senhas não conferem';
    setErros(local);
    if (Object.keys(local).length) return;
    setEnviando(true);
    try {
      await onSubmit({ atual, nova });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Form onSubmit={submit} noValidate>
      {pedirAtual && (
        <Form.Group className="mb-3">
          <Form.Label htmlFor="atual" className="small fw-semibold">
            Senha atual
          </Form.Label>
          <PasswordInput
            id="atual"
            value={atual}
            onChange={setAtual}
            autoComplete="current-password"
            autoFocus
            isInvalid={!!e.atual}
            error={e.atual}
          />
        </Form.Group>
      )}
      <Form.Group className="mb-3">
        <Form.Label htmlFor="nova" className="small fw-semibold">
          Nova senha
        </Form.Label>
        <PasswordInput
          id="nova"
          value={nova}
          onChange={setNova}
          autoFocus={!pedirAtual}
          isInvalid={!!e.nova}
          error={e.nova}
          showRules
        />
      </Form.Group>
      <Form.Group className="mb-4">
        <Form.Label htmlFor="confirma" className="small fw-semibold">
          Confirme a nova senha
        </Form.Label>
        <PasswordInput
          id="confirma"
          value={confirma}
          onChange={setConfirma}
          isInvalid={!!e.confirma}
          error={e.confirma}
        />
      </Form.Group>
      <Button type="submit" className="w-100 mb-2" disabled={enviando}>
        {enviando ? <Spinner size="sm" /> : submitLabel}
      </Button>
      {extra}
    </Form>
  );
}
