// =============================================================================
// Exportação da listagem para CSV (Excel em português abre direto) e XLSX.
// Usa os mesmos filtros da tela; valores saem como o usuário vê (nomes das
// relações, Sim/Não, datas em dd/mm/aaaa). No XLSX, números ficam numéricos.
// =============================================================================
import ExcelJS from 'exceljs';
import type { EntityDef, FieldDef, Row } from '@frame/shared';
import { queryable } from './records';

export type ExportFormat = 'csv' | 'xlsx';

const NOT_EXPORTABLE = new Set(['password', 'permissions']);

/** Colunas exportáveis; `pedidas` (da tela) limita e ordena */
export function exportColumns(ent: EntityDef, pedidas?: string[]): FieldDef[] {
  const all = queryable(ent).filter((f) => !NOT_EXPORTABLE.has(f.type) && !f.hidden);
  if (!pedidas?.length) return all;
  return pedidas.map((n) => all.find((f) => f.name === n)).filter((f): f is FieldDef => !!f);
}

const brDate = (v: string) => {
  const [d, t] = v.split(' ');
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}${t ? ` ${t.slice(0, 5)}` : ''}`;
};

/** Texto da célula como aparece na tela */
export function cellText(f: FieldDef, row: Row): string {
  const v = row[f.name];
  if (v == null || v === '') return '';
  switch (f.type) {
    case 'relation':
      return String(row[`${f.name}__label`] ?? v);
    case 'boolean':
      return v ? 'Sim' : 'Não';
    case 'multiselect':
      return Array.isArray(v) ? v.join(', ') : String(v);
    case 'money':
      return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'percent':
      return `${Number(v).toLocaleString('pt-BR')}%`;
    case 'number':
      return Number(v).toLocaleString('pt-BR');
    case 'date':
    case 'datetime':
      return brDate(String(v));
    default:
      return String(v);
  }
}

function toCsv(cols: FieldDef[], rows: Row[]): Buffer {
  const esc = (s: string) => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [
    cols.map((c) => esc(c.label)).join(';'),
    ...rows.map((r) => cols.map((c) => esc(cellText(c, r))).join(';')),
  ];
  // BOM: o Excel reconhece UTF-8 (acentos); ";" é o separador do Excel em português
  return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf8');
}

async function toXlsx(ent: EntityDef, cols: FieldDef[], rows: Row[], totais?: Record<string, number>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Frame';
  const ws = wb.addWorksheet(ent.label.slice(0, 31));
  ws.columns = cols.map((c) => ({
    header: c.label,
    key: c.name,
    width: Math.max(12, Math.min(40, c.label.length + 4)),
  }));

  for (const r of rows) {
    ws.addRow(
      Object.fromEntries(
        cols.map((c) => {
          const v = r[c.name];
          if (v == null || v === '') return [c.name, null];
          if (['money', 'number', 'percent'].includes(c.type)) return [c.name, Number(v)];
          if (c.type === 'date') return [c.name, new Date(`${v}T00:00:00`)];
          return [c.name, cellText(c, r)];
        }),
      ),
    );
  }
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.type === 'money') col.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    if (c.type === 'percent') col.numFmt = '0.##"%"';
    if (c.type === 'date') col.numFmt = 'dd/mm/yyyy';
  });
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

  if (totais && Object.keys(totais).length) {
    const row = ws.addRow(
      Object.fromEntries(cols.map((c, i) => [c.name, c.name in totais ? totais[c.name] : i === 0 ? 'Total' : null])),
    );
    row.font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildExport(
  format: ExportFormat,
  ent: EntityDef,
  cols: FieldDef[],
  rows: Row[],
  totais?: Record<string, number>,
) {
  if (format === 'xlsx') {
    return {
      body: await toXlsx(ent, cols, rows, totais),
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
  return { body: toCsv(cols, rows), mime: 'text/csv; charset=utf-8' };
}
