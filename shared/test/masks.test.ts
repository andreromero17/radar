import { describe, expect, it } from 'vitest';
import {
  isValidCNPJ,
  isValidCPF,
  isValidPhone,
  maskDocument,
  maskMoneyInput,
  maskPhone,
  parseMoney,
  validateEntity,
  type EntityDef,
} from '../src';

describe('CPF/CNPJ', () => {
  it('valida dígitos verificadores', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('529.982.247-26')).toBe(false);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
    expect(isValidCNPJ('11.222.333/0001-80')).toBe(false);
  });
  it('máscara enquanto digita (CPF até 11 dígitos, depois CNPJ)', () => {
    expect(maskDocument('5299822')).toBe('529.982.2');
    expect(maskDocument('52998224725')).toBe('529.982.247-25');
    expect(maskDocument('112223330001')).toBe('11.222.333/0001');
    expect(maskDocument('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('telefone', () => {
  it('máscara fixo e celular', () => {
    expect(maskPhone('5133334444')).toBe('(51) 3333-4444');
    expect(maskPhone('51999990000')).toBe('(51) 99999-0000');
    expect(maskPhone('519')).toBe('(51) 9');
  });
  it('exige DDD', () => {
    expect(isValidPhone('(51) 99999-0000')).toBe(true);
    expect(isValidPhone('99999-0000')).toBe(false);
  });
});

describe('dinheiro', () => {
  it('entende formato brasileiro e número', () => {
    expect(parseMoney('1.234,56')).toBe(1234.56);
    expect(parseMoney('R$ -10,5')).toBe(-10.5);
    expect(parseMoney('1234.5')).toBe(1234.5);
    expect(parseMoney(7)).toBe(7);
    expect(parseMoney('abc')).toBeNaN();
  });
  it('máscara de digitação em centavos', () => {
    expect(maskMoneyInput('123456')).toEqual({ text: '1.234,56', value: 1234.56 });
    expect(maskMoneyInput('-5')).toEqual({ text: '-0,05', value: -0.05 });
    expect(maskMoneyInput('')).toEqual({ text: '', value: null });
  });
});

describe('validação dos novos tipos', () => {
  const ent: EntityDef = {
    label: 'X',
    singular: 'X',
    icon: 'x',
    labelField: 'nome',
    fields: [
      { name: 'nome', label: 'Nome', type: 'text' },
      { name: 'doc', label: 'Documento', type: 'document' },
      { name: 'cpf', label: 'CPF', type: 'document', docType: 'cpf' },
      { name: 'fone', label: 'Telefone', type: 'phone' },
      { name: 'cor', label: 'Cor', type: 'color' },
      { name: 'tags', label: 'Tags', type: 'multiselect', options: ['A', 'B', 'C'] },
      { name: 'valor', label: 'Valor', type: 'money', min: 0 },
      { name: 'pct', label: 'Desconto', type: 'percent', min: 0, max: 100 },
    ],
  };

  it('normaliza para o formato canônico', () => {
    const r = validateEntity(ent, {
      doc: '11222333000181',
      cpf: '52998224725',
      fone: '51999990000',
      cor: '#AABBCC',
      tags: ['C', 'A', 'A'],
      valor: '1.234,567',
      pct: '12,5',
    });
    expect(r.ok && r.data).toMatchObject({
      doc: '11.222.333/0001-81',
      cpf: '529.982.247-25',
      fone: '(51) 99999-0000',
      cor: '#aabbcc',
      tags: ['A', 'C'],
      valor: 1234.57,
      pct: 12.5,
    });
  });

  it('mensagens de erro em português', () => {
    const r = validateEntity(ent, {
      doc: '123',
      cpf: '11222333000181',
      fone: '9999',
      cor: 'azul',
      tags: ['Z'],
      valor: -1,
      pct: 150,
    });
    const errs = r.ok ? {} : Object.fromEntries(Object.entries(r.errors).map(([k, v]) => [k, v.replace(/\s/g, ' ')]));
    expect(errs).toEqual({
      doc: 'CPF/CNPJ inválido',
      cpf: 'CPF inválido',
      fone: 'Telefone inválido (use DDD + número)',
      cor: 'Use o formato #RRGGBB',
      tags: 'Opção inválida',
      valor: 'Mínimo: R$ 0,00',
      pct: 'Máximo: 100%',
    });
  });

  it('multiselect aceita JSON e texto separado por vírgula', () => {
    expect(validateEntity(ent, { tags: '["B","A"]' }).ok && true).toBe(true);
    const r = validateEntity(ent, { tags: 'B, C' });
    expect(r.ok && r.data.tags).toEqual(['B', 'C']);
  });
});
