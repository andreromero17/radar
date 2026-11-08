import { useEffect, useState } from 'react';
import { Form, InputGroup } from 'react-bootstrap';
import { formatMoneyNumber, maskMoneyInput } from '@frame/shared';

interface Props {
  id: string;
  value: number | string | null | undefined;
  onChange: (v: number | null) => void;
  isInvalid?: boolean;
  disabled?: boolean;
  /** Permite valores negativos (digite "-" no início) */
  allowNegative?: boolean;
}

/** Campo de dinheiro com máscara brasileira: os dígitos entram pelos centavos (1234 → 12,34) */
export default function MoneyInput({ id, value, onChange, isInvalid, disabled, allowNegative = true }: Props) {
  const fromValue = (v: Props['value']) =>
    v == null || v === '' || !Number.isFinite(Number(v)) ? '' : formatMoneyNumber(Number(v));
  const [text, setText] = useState(() => fromValue(value));

  // atualiza quando o valor muda de fora (ex.: registro carregado)
  useEffect(() => {
    const current = maskMoneyInput(text).value;
    if (value == null || value === '' ? current !== null : Number(value) !== current) setText(fromValue(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <InputGroup hasValidation>
      <InputGroup.Text>R$</InputGroup.Text>
      <Form.Control
        id={id}
        inputMode="decimal"
        className="text-end"
        value={text}
        disabled={disabled}
        isInvalid={isInvalid}
        placeholder="0,00"
        onChange={(e) => {
          let raw = e.target.value;
          if (!allowNegative) raw = raw.replace('-', '');
          const m = maskMoneyInput(raw);
          setText(m.text);
          onChange(m.value);
        }}
      />
    </InputGroup>
  );
}
