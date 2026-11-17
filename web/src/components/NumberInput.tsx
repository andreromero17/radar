import { useEffect, useState } from 'react';
import { Form } from 'react-bootstrap';
import { parseMoney } from '@frame/shared';

interface Props {
  id: string;
  value: number | string | null | undefined;
  /** Número quando o texto é válido; o próprio texto quando não é (a validação aponta o erro) */
  onChange: (v: number | string | null) => void;
  isInvalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  'aria-label'?: string;
}

/** Número para mostrar no campo, com vírgula decimal e sem separador de milhar (0,00915093 · 1234,5) */
const textoDoNumero = (v: Props['value']) =>
  v == null || v === '' ? '' : Number.isFinite(Number(v)) ? String(Number(v)).replace('.', ',') : String(v);

/**
 * Campo numérico em texto (teclado decimal no celular): aceita vírgula ou ponto como decimal ("0,5", "0.5") e
 * "1.234,56". O `<input type="number">` não serve: com o navegador em português ele descarta a vírgula e "0,5"
 * vira 5.
 */
export default function NumberInput({ id, value, onChange, isInvalid, disabled, required, ...rest }: Props) {
  const [text, setText] = useState(() => textoDoNumero(value));

  // atualiza quando o valor muda de fora (registro carregado, campo preenchido por outro)
  useEffect(() => {
    const atual = text.trim() === '' ? null : parseMoney(text);
    const novo = value == null || value === '' ? null : typeof value === 'number' ? value : parseMoney(value);
    if (atual !== novo && !(Number.isNaN(atual) && typeof value === 'string')) setText(textoDoNumero(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Form.Control
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      disabled={disabled}
      required={required}
      isInvalid={isInvalid}
      aria-label={rest['aria-label']}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,-]/g, '');
        setText(raw);
        if (!raw.trim()) return onChange(null);
        const n = parseMoney(raw);
        onChange(Number.isFinite(n) ? n : raw);
      }}
    />
  );
}
