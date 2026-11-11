import { useEffect, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import type { SetURLSearchParams } from 'react-router-dom';
import { asMonth, isoDate, monthRange } from '../../lib/listParams';
import { normalizarIntervalo, rotuloPeriodo, type Intervalo } from '../../lib/periodo';
import MonthPicker from '../MonthPicker';
import { guardarPeriodo } from '../../lib/periodoGlobal';
import { mesIso } from '../../lib/meses';

interface Props {
  field: string;
  params: URLSearchParams;
  setParams: SetURLSearchParams;
}

/** Seletor de período da listagem: ‹ Novembro 2026 ›, grade de meses do ano, atalhos e período personalizado */
export default function PeriodNav({ field, params, setParams }: Props) {
  const de = params.get(`${field}__de`);
  const ate = params.get(`${field}__ate`);
  const mes = asMonth(de, ate);

  const apply = (range: Intervalo | null) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    next.delete(`${field}__de`);
    next.delete(`${field}__ate`);
    // o período escolhido vale para as outras telas até o usuário trocar (ou sair)
    guardarPeriodo(range ?? 'todos');
    if (range) {
      if (range.de) next.set(`${field}__de`, range.de);
      if (range.ate) next.set(`${field}__ate`, range.ate);
      next.delete('periodo');
    } else {
      next.set('periodo', 'todos');
    }
    setParams(next, { replace: true });
  };

  const hoje = new Date();
  const atalho = (texto: string, range: Intervalo | null, fechar: () => void) => (
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
      placeholder={rotuloPeriodo(de, ate)}
      referencia={(de ?? ate)?.slice(0, 7)}
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
          <PeriodoPersonalizado
            de={de}
            ate={ate}
            onApply={(r) => {
              apply(r);
              fechar();
            }}
          />
        </>
      )}
    />
  );
}

function PeriodoPersonalizado({
  de,
  ate,
  onApply,
}: {
  de: string | null;
  ate: string | null;
  onApply: (r: Intervalo | null) => void;
}) {
  const [inicio, setInicio] = useState(de ?? '');
  const [fim, setFim] = useState(ate ?? '');
  useEffect(() => {
    setInicio(de ?? '');
    setFim(ate ?? '');
  }, [de, ate]);

  return (
    <Form
      className="periodo-personalizado"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(normalizarIntervalo(inicio, fim));
      }}
    >
      <div className="periodo-personalizado-titulo">Período personalizado</div>
      <div className="periodo-personalizado-datas">
        <Form.Group controlId="periodo-de">
          <Form.Label>De</Form.Label>
          <Form.Control type="date" size="sm" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Form.Group>
        <Form.Group controlId="periodo-ate">
          <Form.Label>Até</Form.Label>
          <Form.Control type="date" size="sm" value={fim} onChange={(e) => setFim(e.target.value)} />
        </Form.Group>
      </div>
      <Button type="submit" size="sm" className="w-100 mt-2" disabled={!inicio && !fim}>
        Aplicar período
      </Button>
    </Form>
  );
}
