import { Button, Table } from 'react-bootstrap';
import { computeFields, detailEntity, type DetailDef, type FieldDef } from '@frame/shared';
import FieldInput, { type FormValue, type Option } from './FieldInput';
import { newDetailRow, type DetailRow } from '../lib/details';
import { isNumeric, renderTotal } from './list/cells';

interface Props {
  detail: DetailDef;
  rows: DetailRow[];
  onChange: (rows: DetailRow[]) => void;
  /** Erros da API/validação: "entidade.índice.campo" */
  errors: Record<string, string>;
  options: Record<string, Option[]>;
  readOnly?: boolean;
}

/** Sub-tabela editável do formulário (master-detail): uma linha por registro "filho" */
export default function DetailTable({ detail, rows, onChange, errors, options, readOnly }: Props) {
  const child = detailEntity(detail);
  if (!child) return null;
  const fields = child.fields.filter((f) => !f.hidden);
  const titulo = detail.label ?? child.label;
  const totais = fields.filter((f) => f.total === 'sum' || Object.values(detail.sum ?? {}).includes(f.name));

  const setCell = (i: number, name: string, v: FormValue) => {
    const next = rows.map((r, k) => {
      if (k !== i) return r;
      const row = { ...r, [name]: v };
      return { ...row, ...computeFields(child, row) } as DetailRow;
    });
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, k) => k !== i));
  const add = () => onChange([...rows, newDetailRow(fields)]);
  const listError = errors[detail.entity];

  return (
    <fieldset className="form-section detail-section">
      <legend className="form-section-title d-flex justify-content-between align-items-center">
        <span>
          {titulo}
          {detail.min ? <span className="text-danger ms-1">*</span> : null}
        </span>
        <span className="text-muted fw-normal text-lowercase">{rows.length} linha(s)</span>
      </legend>
      <div className="table-responsive">
        <Table size="sm" className="detail-table mb-2">
          <thead>
            <tr>
              <th className="col-num">#</th>
              {fields.map((f) => (
                <th key={f.name} className={isNumeric(f) ? 'text-end' : undefined} style={colStyle(f)}>
                  {f.label}
                  {f.required && !f.compute && <span className="text-danger ms-1">*</span>}
                </th>
              ))}
              {!readOnly && <th className="col-acao" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={fields.length + 2} className="text-center text-muted py-3">
                  Nenhuma linha. {!readOnly && 'Use “Adicionar linha”.'}
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r._key}>
                <td className="col-num text-muted">{i + 1}</td>
                {fields.map((f) => (
                  <td key={f.name} data-label={f.label}>
                    <FieldInput
                      bare
                      field={f}
                      inputId={`${detail.entity}-${i}-${f.name}`}
                      value={r[f.name]}
                      onChange={(name, v) => setCell(i, name, v)}
                      error={errors[`${detail.entity}.${i}.${f.name}`]}
                      options={options[`${detail.entity}.${f.name}`]}
                      values={r}
                      disabled={readOnly}
                    />
                  </td>
                ))}
                {!readOnly && (
                  <td className="col-acao text-end">
                    <Button
                      size="sm"
                      variant="light"
                      className="text-danger"
                      title="Remover linha"
                      aria-label={`Remover linha ${i + 1}`}
                      onClick={() => remove(i)}
                    >
                      <i className="bi bi-x-lg" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {totais.length > 0 && rows.length > 0 && (
            <tfoot>
              <tr className="table-total">
                <td className="col-num" />
                {fields.map((f, k) => (
                  <td
                    key={f.name}
                    className={`${isNumeric(f) ? 'text-end text-nowrap' : ''}${totais.includes(f) || k === 0 ? '' : ' total-vazio'}`}
                    data-label={
                      totais.includes(f) ? (totais.length > 1 ? `Total ${f.label.toLowerCase()}` : 'Total') : undefined
                    }
                  >
                    {totais.includes(f)
                      ? renderTotal(
                          f,
                          rows.reduce((a, r) => a + (Number(r[f.name]) || 0), 0),
                        )
                      : k === 0
                        ? 'Total'
                        : null}
                  </td>
                ))}
                {!readOnly && <td />}
              </tr>
            </tfoot>
          )}
        </Table>
      </div>
      {listError && <div className="invalid-feedback d-block mb-2">{listError}</div>}
      {!readOnly && (
        <Button variant="light" size="sm" className="border" onClick={add}>
          <i className="bi bi-plus-lg me-1" /> Adicionar linha
        </Button>
      )}
    </fieldset>
  );
}

/** Largura das colunas: texto e relação ocupam o que sobra */
function colStyle(f: FieldDef) {
  if (['textarea', 'text', 'relation', 'email', 'multiselect'].includes(f.type)) return { minWidth: 180 };
  if (['number', 'percent', 'boolean'].includes(f.type)) return { width: 100, minWidth: 80 };
  return { width: 160, minWidth: 130 };
}
