import { Dropdown, Form } from 'react-bootstrap';
import type { FieldDef } from '@frame/shared';

interface Props {
  fields: FieldDef[];
  visible: string[];
  onChange: (cols: string[]) => void;
  onReset: () => void;
}

/** Escolha das colunas visíveis (guardada por usuário neste navegador) */
export default function ColumnChooser({ fields, visible, onChange, onReset }: Props) {
  const toggle = (name: string) => {
    const next = visible.includes(name) ? visible.filter((c) => c !== name) : [...visible, name];
    // mantém a ordem da definição da entidade
    onChange(fields.map((f) => f.name).filter((n) => next.includes(n)));
  };
  return (
    <Dropdown autoClose="outside">
      <Dropdown.Toggle variant="light" size="sm" className="border" title="Colunas">
        <i className="bi bi-layout-three-columns" />
        <span className="d-none d-xl-inline ms-1">Colunas</span>
      </Dropdown.Toggle>
      <Dropdown.Menu className="shadow-sm py-2" style={{ minWidth: 220, maxHeight: 360, overflowY: 'auto' }}>
        <Dropdown.Header>Colunas visíveis</Dropdown.Header>
        {fields.map((f) => (
          <div key={f.name} className="px-3 py-1">
            <Form.Check
              id={`col-${f.name}`}
              label={f.label}
              checked={visible.includes(f.name)}
              disabled={visible.length === 1 && visible.includes(f.name)}
              onChange={() => toggle(f.name)}
            />
          </div>
        ))}
        <Dropdown.Divider />
        <Dropdown.Item onClick={onReset} className="small">
          <i className="bi bi-arrow-counterclockwise me-1" /> Restaurar padrão
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
