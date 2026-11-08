import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { entities } from '@frame/shared';
import FieldInput from '../src/components/FieldInput';
import ValueBadge from '../src/components/ValueBadge';

const field = (name: string) => entities.chamados.fields.find((f) => f.name === name)!;

describe('FieldInput', () => {
  it('renderiza select com as opções (+ vazio, pois não é obrigatório)', () => {
    render(<FieldInput field={field('status')} value="Aberto" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveValue('Aberto');
    expect(screen.getAllByRole('option')).toHaveLength(7);
  });

  it('mostra erro e repassa alterações', () => {
    const onChange = vi.fn();
    render(<FieldInput field={field('assunto')} value="" onChange={onChange} error="Assunto é obrigatório" />);
    expect(screen.getByText('Assunto é obrigatório')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Novo' } });
    expect(onChange).toHaveBeenCalledWith('assunto', 'Novo');
  });

  it('boolean vira switch', () => {
    const onChange = vi.fn();
    render(
      <FieldInput field={entities.clientes.fields.find((f) => f.name === 'ativo')!} value={true} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith('ativo', false);
  });
});

describe('ValueBadge', () => {
  it('usa a cor configurada', () => {
    render(<ValueBadge value="Urgente" colors={{ Urgente: '#e03e3e' }} />);
    expect(screen.getByText('Urgente')).toHaveStyle({ background: '#e03e3e' });
  });
});
