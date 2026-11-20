// Abas do topo das telas do Radar: separam contas-alvo de concorrentes.
import type { UniversoTela } from '../lib/universo';

export default function AbasUniverso({
  universo,
  onChange,
  contagem,
}: {
  universo: UniversoTela;
  onChange: (u: UniversoTela) => void;
  contagem?: Partial<Record<UniversoTela, number>>;
}) {
  const aba = (u: UniversoTela, rotulo: string) => (
    <a
      href={`?u=${u === 'Concorrente' ? 'concorrentes' : 'contas'}`}
      className={universo === u ? 'on' : undefined}
      aria-current={universo === u ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        onChange(u);
      }}
    >
      {rotulo}
      {contagem?.[u] != null && <span className="radar-conta">{contagem[u]}</span>}
    </a>
  );
  return (
    <nav className="radar-abas" aria-label="Universo monitorado">
      {aba('Conta-alvo', 'Contas-alvo')}
      {aba('Concorrente', 'Concorrentes')}
    </nav>
  );
}
