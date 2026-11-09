import { useEffect, useState, type ReactNode } from 'react';
import { Button, Dropdown } from 'react-bootstrap';
import { mesIso, nomeMes } from '../lib/meses';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
interface Props {
  /** Mês selecionado 'AAAA-MM' (null = nenhum: período livre) */
  value: string | null;
  onChange: (mes: string) => void;
  /** Texto do botão quando não há mês (ex.: "Todo o período") */
  placeholder?: string;
  /** Atalhos abaixo da grade; recebe o ano visível e uma função para fechar */
  extras?: (ano: number, fechar: () => void) => ReactNode;
  /** Mês de referência quando value é null (setas e ano da grade partem dele; padrão: mês atual) */
  referencia?: string | null;
  className?: string;
}

/**
 * Seletor de mês (como no Mobills): ‹ Janeiro 2025 › e, ao clicar no nome, o ano com os 12 meses
 * para pular direto. Setas mudam um mês; o mês atual fica marcado.
 */
export default function MonthPicker({
  value,
  onChange,
  placeholder = 'Escolha o mês',
  extras,
  referencia,
  className,
}: Props) {
  const hoje = new Date();
  const atual = mesIso(hoje.getFullYear(), hoje.getMonth());
  const base = value ?? referencia ?? atual;
  const [aberto, setAberto] = useState(false);
  const [ano, setAno] = useState(Number(base.slice(0, 4)));
  useEffect(() => {
    if (aberto) setAno(Number(base.slice(0, 4)));
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const mover = (delta: number) => {
    const [y, m] = base.split('-').map(Number);
    onChange(mesIso(y, m - 1 + delta));
  };
  const escolher = (m: number) => {
    onChange(mesIso(ano, m));
    setAberto(false);
  };

  return (
    <div className={`period-nav month-picker ${className ?? ''}`} role="group" aria-label="Mês">
      <Button variant="light" size="sm" onClick={() => mover(-1)} aria-label="Mês anterior">
        <i className="bi bi-chevron-left" />
      </Button>
      <Dropdown show={aberto} onToggle={(v) => setAberto(v)} autoClose="outside">
        <Dropdown.Toggle variant="light" size="sm" className="period-label" aria-label="Escolher mês">
          <i className="bi bi-calendar3 me-2" />
          {value ? nomeMes(value) : placeholder}
        </Dropdown.Toggle>
        <Dropdown.Menu className="month-picker-menu">
          <div className="month-picker-ano">
            <Button variant="link" size="sm" onClick={() => setAno((a) => a - 1)} aria-label="Ano anterior">
              <i className="bi bi-chevron-left" />
            </Button>
            <span>{ano}</span>
            <Button variant="link" size="sm" onClick={() => setAno((a) => a + 1)} aria-label="Próximo ano">
              <i className="bi bi-chevron-right" />
            </Button>
          </div>
          <div className="month-picker-grade">
            {MESES.map((nome, i) => {
              const iso = mesIso(ano, i);
              return (
                <button
                  type="button"
                  key={nome}
                  className={`month-picker-mes${iso === value ? ' ativo' : ''}${iso === atual ? ' atual' : ''}`}
                  aria-pressed={iso === value}
                  onClick={() => escolher(i)}
                >
                  {nome}
                </button>
              );
            })}
          </div>
          {extras && <div className="month-picker-extras">{extras(ano, () => setAberto(false))}</div>}
        </Dropdown.Menu>
      </Dropdown>
      <Button variant="light" size="sm" onClick={() => mover(1)} aria-label="Próximo mês">
        <i className="bi bi-chevron-right" />
      </Button>
    </div>
  );
}
