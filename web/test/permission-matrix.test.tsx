import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PermissionMatrix from '../src/components/PermissionMatrix';
import FieldInput from '../src/components/FieldInput';
import { entities } from '@frame/shared';

describe('PermissionMatrix', () => {
  it('marcar uma ação também marca "ver"', () => {
    const onChange = vi.fn();
    render(<PermissionMatrix value={{}} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Editar Clientes'));
    expect(onChange).toHaveBeenCalledWith({ clientes: ['ver', 'editar'] });
  });

  it('desmarcar "ver" tira todas as ações do recurso', () => {
    const onChange = vi.fn();
    render(<PermissionMatrix value={{ clientes: ['ver', 'criar'] }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Ver Clientes'));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('"Tudo" marca as ações disponíveis do recurso', () => {
    const onChange = vi.fn();
    render(<PermissionMatrix value={{}} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Todas as permissões de Logs'));
    expect(onChange).toHaveBeenCalledWith({ logs: ['ver'] });
  });

  it('perfis só oferecem "ver" (gerenciar é exclusivo de admin)', () => {
    render(<PermissionMatrix value={{}} onChange={() => {}} />);
    expect(screen.getByLabelText('Ver Perfis de acesso')).toBeInTheDocument();
    expect(screen.queryByLabelText('Editar Perfis de acesso')).toBeNull();
  });
});

describe('FieldInput de senha', () => {
  const senha = entities.usuarios.fields.find((f) => f.name === 'senha')!;
  it('obrigatória ao criar; opcional ao editar', () => {
    const { rerender } = render(<FieldInput field={senha} value="" onChange={() => {}} isNew />);
    expect(screen.getByText('*')).toBeInTheDocument();
    rerender(<FieldInput field={senha} value="" onChange={() => {}} isNew={false} />);
    expect(screen.queryByText('*')).toBeNull();
    expect(screen.getByPlaceholderText('Manter a senha atual')).toHaveAttribute('type', 'password');
  });
});
