import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FieldInput, { type FormValue } from '../src/components/FieldInput';

// Frame 0.26.1: campo numérico aceita vírgula decimal (o input type=number, em português, descartava a vírgula e
// "0,5" virava 5)
function Campo({ inicial = null }: { inicial?: FormValue }) {
  const [v, setV] = useState<FormValue>(inicial);
  return (
    <>
      <FieldInput
        field={{ name: 'qtd', label: 'Quantidade', type: 'number' }}
        value={v}
        onChange={(_n, x) => setV(x)}
      />
      <output data-testid="valor">{JSON.stringify(v)}</output>
    </>
  );
}
const digitar = (t: string) => fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: t } });
const valor = () => JSON.parse(screen.getByTestId('valor').textContent ?? 'null');

describe('campo numérico', () => {
  it('aceita vírgula ou ponto decimal e menos de 1', () => {
    render(<Campo />);
    const input = screen.getByLabelText('Quantidade') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.inputMode).toBe('decimal');
    digitar('0,00915093');
    expect(valor()).toBe(0.00915093);
    expect(input.value).toBe('0,00915093');
    digitar('0.5');
    expect(valor()).toBe(0.5);
    digitar('1.234,5');
    expect(valor()).toBe(1234.5);
  });

  it('texto incompleto fica como está (sem apagar o que foi digitado) e vazio vira null', () => {
    render(<Campo />);
    const input = screen.getByLabelText('Quantidade') as HTMLInputElement;
    digitar('0,');
    expect(input.value).toBe('0,');
    expect(valor()).toBe('0,');
    digitar('');
    expect(valor()).toBeNull();
  });

  it('valor carregado aparece com vírgula', () => {
    render(<Campo inicial={243.815} />);
    expect((screen.getByLabelText('Quantidade') as HTMLInputElement).value).toBe('243,815');
  });
});
