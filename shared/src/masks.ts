// =============================================================================
// Máscaras e validações brasileiras, usadas pelo formulário (enquanto digita)
// e pela API (normaliza antes de gravar). Sem dependências.
// =============================================================================

export const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

// ---------------------------------------------------------------- CPF / CNPJ
function cpfCheck(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

function cnpjCheck(d: string): boolean {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((s, w, i) => s + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export const isValidCPF = (v: unknown) => cpfCheck(onlyDigits(v));
export const isValidCNPJ = (v: unknown) => cnpjCheck(onlyDigits(v));

/** Formata enquanto digita: até 11 dígitos = CPF, acima = CNPJ (ou forçado por `kind`) */
export function maskDocument(v: unknown, kind: 'cpf' | 'cnpj' | 'cpf_cnpj' = 'cpf_cnpj'): string {
  const d = onlyDigits(v).slice(0, kind === 'cpf' ? 11 : 14);
  const asCnpj = kind === 'cnpj' || (kind === 'cpf_cnpj' && d.length > 11);
  if (asCnpj) {
    return d
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

// ---------------------------------------------------------------- Telefone
/** (51) 3333-4444 ou (51) 99999-0000 */
export function maskPhone(v: unknown): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const isValidPhone = (v: unknown) => /^[1-9]{2}9?\d{8}$/.test(onlyDigits(v));

// ---------------------------------------------------------------- Dinheiro
/**
 * Converte texto em reais para número: "1.234,56" → 1234.56; "-10,5" → -10.5.
 * Números passam direto. Texto inválido vira NaN.
 */
export function parseMoney(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '')
    .trim()
    .replace(/[R$\s]/g, '');
  if (!s) return NaN;
  // com vírgula: formato brasileiro (ponto = milhar). Sem vírgula: ponto decimal.
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
}

/** Máscara do campo de dinheiro: dígitos viram centavos ("123456" → "1.234,56") */
export function maskMoneyInput(raw: string): { text: string; value: number | null } {
  const negative = raw.trim().startsWith('-');
  const d = onlyDigits(raw).replace(/^0+(?=\d)/, '');
  if (!d) return { text: negative ? '-' : '', value: null };
  const cents = Number(d.slice(-15));
  const value = (negative ? -cents : cents) / 100;
  return { text: formatMoneyNumber(value), value };
}

/** 1234.5 → "1.234,50" (sem "R$") */
export const formatMoneyNumber = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
