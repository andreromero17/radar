import { useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import type { EntityDef } from '@frame/shared';
import { bulkEditableFields } from '../../lib/listParams';
import FieldInput, { type FormValue, type Option } from '../FieldInput';

interface Props {
  show: boolean;
  ent: EntityDef;
  count: number;
  relOptions: Record<string, Option[]>;
  onCancel: () => void;
  onConfirm: (dados: Record<string, unknown>) => void;
}

export default function BulkEditModal({ show, ent, count, relOptions, onCancel, onConfirm }: Props) {
  const fields = bulkEditableFields(ent);
  const [campo, setCampo] = useState('');
  const [valor, setValor] = useState<FormValue>('');
  const field = fields.find((f) => f.name === campo);

  const close = () => {
    setCampo('');
    setValor('');
    onCancel();
  };

  return (
    <Modal show={show} onHide={close} centered>
      <Modal.Header closeButton>
        <Modal.Title className="fs-5 fw-bold">Editar {count} registro(s)</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold">Campo</Form.Label>
          <Form.Select
            value={campo}
            onChange={(e) => {
              const f = fields.find((x) => x.name === e.target.value);
              setCampo(e.target.value);
              setValor(f?.type === 'boolean' ? false : f?.type === 'multiselect' ? [] : '');
            }}
          >
            <option value="">Selecione...</option>
            {fields.map((f) => (
              <option key={f.name} value={f.name}>
                {f.label}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        {field && (
          <FieldInput
            field={{ ...field, required: false }}
            value={valor}
            onChange={(_, v) => setValor(v)}
            options={relOptions[field.name]}
            isNew
            values={{}}
          />
        )}
        <p className="small text-muted mt-3 mb-0">
          Cada registro passa pelas mesmas validações de uma edição normal; os que não puderem ser alterados são
          informados no final.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" onClick={close}>
          Cancelar
        </Button>
        <Button
          disabled={!field}
          onClick={() => {
            onConfirm({ [campo]: valor === '' ? null : valor });
            setCampo('');
            setValor('');
          }}
        >
          Aplicar
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
