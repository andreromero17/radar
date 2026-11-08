import { useState } from 'react';
import { Button, Form, InputGroup } from 'react-bootstrap';
import { PASSWORD_RULES } from '@frame/shared';

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  isInvalid?: boolean;
  placeholder?: string;
  autoComplete?: 'current-password' | 'new-password';
  autoFocus?: boolean;
  disabled?: boolean;
  /** Mostra a lista de regras da senha, marcando as atendidas */
  showRules?: boolean;
  error?: string;
}

/** Campo de senha com botão mostrar/ocultar e checklist opcional da política */
export default function PasswordInput({ showRules, error, onChange, value, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <InputGroup hasValidation>
        <Form.Control
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={props.autoComplete ?? 'new-password'}
          {...props}
        />
        <Button
          variant="light"
          className="border"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          tabIndex={-1}
          disabled={props.disabled}
        >
          <i className={`bi bi-${visible ? 'eye-slash' : 'eye'}`} />
        </Button>
        <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>
      </InputGroup>
      {showRules && (
        <ul className="password-rules">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(value);
            return (
              <li key={r.label} className={ok ? 'ok' : ''}>
                <i className={`bi bi-${ok ? 'check-circle-fill' : 'circle'}`} /> {r.label}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
