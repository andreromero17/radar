import { useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import { reduzirImagem } from '../lib/imagem';

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  isInvalid?: boolean;
  label: string;
}

/** Campo de imagem (type 'image'): prévia + enviar/trocar/remover */
export default function ImageInput({ id, value, onChange, disabled, isInvalid, label }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState('');
  return (
    <div className={`image-input${isInvalid ? ' is-invalid' : ''}`}>
      <div className="image-input-preview">
        {value ? <img src={value} alt={label} /> : <i className="bi bi-image text-muted" />}
      </div>
      <div className="d-flex flex-wrap gap-2 align-items-center">
        <input
          ref={ref}
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="d-none"
          disabled={disabled}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setErro('');
            try {
              onChange(await reduzirImagem(f));
            } catch (err) {
              setErro((err as Error).message);
            }
          }}
        />
        <Button size="sm" variant="light" className="border" disabled={disabled} onClick={() => ref.current?.click()}>
          <i className="bi bi-upload me-1" />
          {value ? 'Trocar' : 'Enviar imagem'}
        </Button>
        {value && !disabled && (
          <Button size="sm" variant="light" className="text-danger" onClick={() => onChange('')}>
            Remover
          </Button>
        )}
        {erro && <span className="small text-danger">{erro}</span>}
      </div>
    </div>
  );
}
