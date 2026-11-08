import { Form } from 'react-bootstrap';

/** Renderiza o input adequado ao tipo do campo definido em entities.js */
export default function FieldInput({ field: f, value, onChange, error, options = [] }) {
  const common = {
    id: f.name,
    isInvalid: !!error,
    disabled: f.readonly,
    required: f.required,
  };
  const set = (v) => onChange(f.name, v);

  let input;
  switch (f.type) {
    case 'textarea':
      input = <Form.Control as="textarea" rows={4} value={value ?? ''} onChange={(e) => set(e.target.value)} {...common} />;
      break;
    case 'select':
      input = (
        <Form.Select value={value ?? ''} onChange={(e) => set(e.target.value)} {...common}>
          {!f.required && <option value="">—</option>}
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </Form.Select>
      );
      break;
    case 'relation':
      input = (
        <Form.Select value={value ?? ''} onChange={(e) => set(e.target.value)} {...common}>
          <option value="">Selecione...</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Form.Select>
      );
      break;
    case 'boolean':
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
    case 'number':
    case 'money':
      input = <Form.Control type="number" step={f.type === 'money' ? '0.01' : 'any'} value={value ?? ''} onChange={(e) => set(e.target.value)} {...common} />;
      break;
    case 'date':
      input = <Form.Control type="date" value={value ?? ''} onChange={(e) => set(e.target.value)} {...common} />;
      break;
    default:
      input = (
        <Form.Control
          type={f.type === 'email' ? 'email' : 'text'}
          value={value ?? ''}
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
