import { Button } from 'react-bootstrap';
import type { SetURLSearchParams } from 'react-router-dom';
import { asMonth, isoDate, monthRange } from '../../lib/listParams';
import { fmtDate } from '../../lib/format';
import MonthPicker from '../MonthPicker';
import { mesIso } from '../../lib/meses';

interface Props {
  field: string;
  params: URLSearchParams;
  setParams: SetURLSearchParams;
}

/** Seletor de período da listagem: ‹ Novembro 2026 ›, grade de meses do ano e atalhos */
export default function PeriodNav({ field, params, setParams }: Props) {
  const de = params.get(`${field}__de`);
  const ate = params.get(`${field}__ate`);
  const mes = asMonth(de, ate);

  const apply = (range: { de: string; ate: string } | null) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    if (range) {
      next.set(`${field}__de`, range.de);
      next.set(`${field}__ate`, range.ate);
      next.delete('periodo');
    } else {
      next.delete(`${field}__de`);
      next.delete(`${field}__ate`);
      next.set('periodo', 'todos');
    }
    setParams(next, { replace: true });
  };

  const hoje = new Date();
  const label = de || ate ? `${de ? fmtDate(de) : '…'} a ${ate ? fmtDate(ate) : '…'}` : 'Todo o período';
  const atalho = (texto: string, range: { de: string; ate: string } | null, fechar: () => void) => (
    <Button
      variant="light"
      size="sm"
      onClick={() => {
        apply(range);
        fechar();
      }}
    >
      {texto}
    </Button>
  );

  return (
    <MonthPicker
      value={mes ? mesIso(mes.year, mes.month) : null}
      placeholder={label}
      onChange={(m) => {
        const [y, mm] = m.split('-').map(Number);
        apply(monthRange(y, mm - 1));
      }}
      extras={(ano, fechar) => (
        <>
          {atalho('Este mês', monthRange(hoje.getFullYear(), hoje.getMonth()), fechar)}
          {atalho(
            'Últimos 30 dias',
            { de: isoDate(new Date(Date.now() - 29 * 86_400_000)), ate: isoDate(hoje) },
            fechar,
          )}
          {atalho(`Ano de ${ano}`, { de: `${ano}-01-01`, ate: `${ano}-12-31` }, fechar)}
          {atalho('Todo o período', null, fechar)}
        </>
      )}
    />
  );
}
