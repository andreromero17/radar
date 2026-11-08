import { Form } from 'react-bootstrap';
import type { FieldDef, Permissions } from '@frame/shared';
import PasswordInput from './PasswordInput';
import PermissionMatrix from './PermissionMatrix';
import { fmtDate } from '../lib/format';

export type FormValue = string | number | boolean | null | undefined | Permissions;
export interface Option {
  value: number | string;
  label: string;
}

interface Props {
  field: FieldDef;
  value: FormValue;
  onChange: (name: string, value: FormValue) => void;
  error?: string;
  options?: Option[];
  /** Desabilita (somente leitura, sem permissão de editar, disabledWhen...) */
  disabled?: boolean;
  /** Formulário de criação (senha obrigatória) ou edição (senha opcional) */
  isNew?: boolean;
  /** Valores do formulário inteiro (para campos que dependem de outros) */
  values?: Record<string, FormValue>;
}

/** Renderiza o input adequado ao tipo do campo definido nas entidades */
export default function FieldInput({
  field: f,
  value,
  onChange,
  error,
  options = [],
  disabled,
  isNew = true,
  values,
}: Props) {
  const set = (v: FormValue) => onChange(f.name, v);
  const text = value == null || typeof value === 'object' ? '' : String(value);
  const isDisabled = disabled || f.readonly;
  const required = !disabled && f.required && (f.type !== 'password' || isNew);
  const common = { id: f.name, isInvalid: !!error, disabled: isDisabled, required };
  let help = f.help;

  if (f.type === 'boolean') {
    return (
      <Form.Group>
        <Form.Check
          type="switch"
          id={f.name}
          label={f.label}
          checked={!!value}
          disabled={isDisabled}
          onChange={(e) => set(e.target.checked)}
          className="mt-md-4 pt-md-2 fw-semibold"
        />
        {help && <Form.Text className="d-block">{help}</Form.Text>}
      </Form.Group>
    );
  }

  let input;
  switch (f.type) {
    case 'textarea':
      input = <Form.Control as="textarea" rows={4} value={text} onChange={(e) => set(e.target.value)} {...common} />;
      break;
    case 'select':
      input = (
        <Form.Select value={text} onChange={(e) => set(e.target.value)} {...common}>
          {!f.required && <option value="">—</option>}
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Form.Select>
      );
      break;
    case 'relation':
      input = (
        <Form.Select value={text} onChange={(e) => set(e.target.value)} {...common}>
          <option value="">Selecione...</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Form.Select>
      );
      break;
    case 'number':
    case 'money':
      input = (
        <Form.Control
          type="number"
          step={f.type === 'money' ? '0.01' : 'any'}
          value={text}
          onChange={(e) => set(e.target.value)}
          {...common}
        />
      );
      break;
    case 'date':
      input = <Form.Control type="date" value={text} onChange={(e) => set(e.target.value)} {...common} />;
      break;
    case 'datetime':
      input = f.readonly ? (
        <Form.Control value={text ? fmtDate(text, true) : '—'} disabled id={f.name} />
      ) : (
        <Form.Control
          type="datetime-local"
          value={text.replace(' ', 'T').slice(0, 16)}
          onChange={(e) => set(e.target.value)}
          {...common}
        />
      );
      break;
    case 'password':
      if (!isNew) help = 'Preencha só se quiser definir uma nova senha.';
      input = (
        <PasswordInput
          id={f.name}
          value={text}
          onChange={set}
          isInvalid={!!error}
          error={error}
          disabled={isDisabled}
          placeholder={isNew ? '' : 'Manter a senha atual'}
          showRules={!!text}
        />
      );
      return (
        <Form.Group>
          <Label f={f} required={required} />
          {input}
          {help && !text && <Form.Text>{help}</Form.Text>}
        </Form.Group>
      );
    case 'permissions':
      return (
        <Form.Group>
          <Label f={f} required={required} />
          <PermissionMatrix
            value={value as Permissions}
            onChange={set}
            disabled={isDisabled}
            allGranted={!!(f.disabledWhen && values?.[f.disabledWhen])}
          />
          {error && <div className="invalid-feedback d-block">{error}</div>}
        </Form.Group>
      );
    default:
      input = (
        <Form.Control
          type={f.type === 'email' ? 'email' : 'text'}
          value={text}
          maxLength={f.maxLength}
          placeholder={f.readonly ? 'Gerado automaticamente' : ''}
          onChange={(e) => set(e.target.value)}
          {...common}
        />
      );
  }

  return (
    <Form.Group>
      <Label f={f} required={required} />
      {input}
      <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>
      {help && <Form.Text>{help}</Form.Text>}
    </Form.Group>
  );
}

function Label({ f, required }: { f: FieldDef; required?: boolean }) {
  return (
    <Form.Label htmlFor={f.name} className="fw-semibold small">
      {f.label} {required && <span className="text-danger">*</span>}
    </Form.Label>
  );
}
