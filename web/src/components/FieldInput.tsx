import { Form } from 'react-bootstrap';
import type { FieldDef } from '@frame/shared';

export type FormValue = string | number | boolean | null | undefined;
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
}

/** Renderiza o input adequado ao tipo do campo definido nas entidades */
export default function FieldInput({ field: f, value, onChange, error, options = [] }: Props) {
  const set = (v: FormValue) => onChange(f.name, v);
  const text = value == null ? '' : String(value);
  const common = { id: f.name, isInvalid: !!error, disabled: f.readonly, required: f.required };

  if (f.type === 'boolean') {
    return (
      <Form.Check
        type="switch"
        id={f.name}
        label={f.label}
        checked={!!value}
        onChange={(e) => set(e.target.checked)}
        className="mt-md-4 pt-md-2 fw-semibold"
      />
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
      <Form.Label htmlFor={f.name} className="fw-semibold small">
        {f.label} {f.required && <span className="text-danger">*</span>}
      </Form.Label>
      {input}
      <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>
    </Form.Group>
  );
}
