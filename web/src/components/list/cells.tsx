import { Form } from 'react-bootstrap';
import type { FieldDef, Row } from '@frame/shared';
import { fmtDate, fmtMoney, fmtPercent } from '../../lib/format';
import ValueBadge from '../ValueBadge';

const BOOL_COLORS = { Sim: '#2b8a5a', Não: '#adb5bd' };
const dash = <span className="text-muted">—</span>;

/** Liga/desliga de um campo sim/não direto na linha (`inlineEdit`) */
export interface InlineToggle {
  onToggle: (f: FieldDef, row: Row) => void;
  busy?: boolean;
}

/** O campo pode ser alterado na linha? */
export const canInline = (f: FieldDef, row: Row) =>
  f.type === 'boolean' && (typeof f.inlineEdit === 'function' ? f.inlineEdit(row) : !!f.inlineEdit);

/** Como cada tipo de campo aparece numa célula da listagem */
export function renderCell(f: FieldDef, row: Row, inline?: InlineToggle) {
  if (inline && f.type === 'boolean' && f.inlineEdit) {
    const ativo = canInline(f, row);
    return (
      <Form.Check
        type="switch"
        role="switch"
        className="inline-switch"
        id={`${f.name}-${row.id}`}
        aria-label={`${f.label}: ${row[f.name] ? 'sim' : 'não'}`}
        title={ativo ? (row[f.name] ? 'Marcar como não' : 'Marcar como sim') : undefined}
        checked={!!row[f.name]}
        disabled={!ativo || inline.busy}
        onClick={(e) => e.stopPropagation()}
        onChange={() => inline.onToggle(f, row)}
      />
    );
  }
  const v = row[f.name];
  if (f.type !== 'boolean' && (v == null || v === '' || (Array.isArray(v) && !v.length))) return dash;
  switch (f.type) {
    case 'relation':
      return (row[`${f.name}__label`] as string) ?? dash;
    case 'boolean':
      return <ValueBadge value={v ? 'Sim' : 'Não'} colors={BOOL_COLORS} />;
    case 'select':
      return f.colors ? <ValueBadge value={v} colors={f.colors} /> : String(v);
    case 'multiselect':
      return (
        <span className="d-inline-flex flex-wrap gap-1">
          {(v as string[]).map((o) => (
            <ValueBadge key={o} value={o} colors={f.colors ?? {}} />
          ))}
        </span>
      );
    case 'money':
      return <span className={`text-nowrap ${signClass(f, v)}`}>{fmtMoney(v)}</span>;
    case 'number':
      return <span className={signClass(f, v)}>{Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 8 })}</span>;
    case 'percent':
      return fmtPercent(v);
    case 'date':
      return fmtDate(v);
    case 'datetime':
      return fmtDate(v, true);
    case 'color':
      return (
        <span className="d-inline-flex align-items-center gap-2">
          <span className="color-dot" style={{ background: String(v) }} />
          <code className="small text-muted">{String(v)}</code>
        </span>
      );
    case 'document':
    case 'phone':
      return <span className="text-nowrap">{String(v)}</span>;
    case 'image':
      return <img src={String(v)} alt="" className="cell-image" />;
    default:
      return String(v);
  }
}

export const signClass = (f: FieldDef, v: unknown) =>
  f.signColors && Number(v) < 0 ? 'text-danger' : f.signColors && Number(v) > 0 ? 'text-success' : '';

/** Colunas numéricas ficam alinhadas à direita */
export const isNumeric = (f: FieldDef) => ['money', 'number', 'percent'].includes(f.type);

/** Valor de um total (rodapé) formatado conforme o tipo do campo */
export function renderTotal(f: FieldDef, value: number) {
  const text =
    f.type === 'money' ? fmtMoney(value) : f.type === 'percent' ? fmtPercent(value) : value.toLocaleString('pt-BR');
  return <span className={`text-nowrap ${signClass(f, value)}`}>{text}</span>;
}
