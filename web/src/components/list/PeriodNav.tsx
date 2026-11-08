import { Button, Dropdown } from 'react-bootstrap';
import type { SetURLSearchParams } from 'react-router-dom';
import { asMonth, isoDate, monthLabel, monthRange } from '../../lib/listParams';
import { fmtDate } from '../../lib/format';

interface Props {
  field: string;
  params: URLSearchParams;
  setParams: SetURLSearchParams;
}

/** Seletor de período da listagem: ‹ Novembro de 2026 › com atalhos */
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
  const shift = (delta: number) => {
    const base = mes ?? { year: hoje.getFullYear(), month: hoje.getMonth() };
    const d = new Date(base.year, base.month + delta, 1);
    apply(monthRange(d.getFullYear(), d.getMonth()));
  };

  const label = mes
    ? monthLabel(mes.year, mes.month)
    : de || ate
      ? `${de ? fmtDate(de) : '…'} a ${ate ? fmtDate(ate) : '…'}`
      : 'Todo o período';

  return (
    <div className="period-nav" role="group" aria-label="Período">
      <Button variant="light" size="sm" onClick={() => shift(-1)} aria-label="Mês anterior">
        <i className="bi bi-chevron-left" />
      </Button>
      <Dropdown>
        <Dropdown.Toggle variant="light" size="sm" className="period-label">
          <i className="bi bi-calendar3 me-2" />
          {label}
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <Dropdown.Item onClick={() => apply(monthRange(hoje.getFullYear(), hoje.getMonth()))}>Este mês</Dropdown.Item>
          <Dropdown.Item onClick={() => apply(monthRange(hoje.getFullYear(), hoje.getMonth() - 1))}>
            Mês passado
          </Dropdown.Item>
          <Dropdown.Item
            onClick={() => apply({ de: isoDate(new Date(Date.now() - 29 * 86_400_000)), ate: isoDate(hoje) })}
          >
            Últimos 30 dias
          </Dropdown.Item>
          <Dropdown.Item
            onClick={() => apply({ de: `${hoje.getFullYear()}-01-01`, ate: `${hoje.getFullYear()}-12-31` })}
          >
            Este ano
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item onClick={() => apply(null)}>Todo o período</Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
      <Button variant="light" size="sm" onClick={() => shift(1)} aria-label="Próximo mês">
        <i className="bi bi-chevron-right" />
      </Button>
    </div>
  );
}
