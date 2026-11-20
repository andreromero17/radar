import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AbasUniverso from '../components/AbasUniverso';
import { guardarUniverso, lerUniversoGuardado, type UniversoTela } from '../lib/universo';
import CrudList from '../../pages/CrudList';

const NIVEIS = ['Todos', 'Alta', 'Média', 'Baixa'] as const;

/** Filtro rápido de severidade no topo da caixa de sinais (usa o filtro da própria listagem, na URL) */
export function FiltroSeveridade({ valor, onChange }: { valor: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Severidade">
      {NIVEIS.map((n) => {
        const ativo = n === 'Todos' ? !valor : valor === n;
        return (
          <button
            key={n}
            type="button"
            className={`radar-filtro${ativo ? ' on' : ''}${n === 'Alta' ? ' radar-filtro-alta' : n === 'Média' ? ' radar-filtro-media' : ''}`}
            aria-pressed={ativo}
            onClick={() => onChange(n === 'Todos' ? null : n)}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

/** Caixa de sinais: abas Contas-alvo | Concorrentes (filtro "universo" da lista) + filtro rápido de severidade */
export default function Sinais() {
  const [params, setParams] = useSearchParams();
  const universo = params.get('universo') as UniversoTela | null;
  const valor = params.get('severidade');
  const mudar = (chave: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(chave, v);
        else n.delete(chave);
        n.delete('page');
        return n;
      },
      { replace: chave === 'universo' && !universo },
    );
  // sem universo na URL: abre na última aba usada (a mesma lembrança do dashboard)
  useEffect(() => {
    if (!universo) mudar('universo', lerUniversoGuardado());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universo]);
  if (!universo) return null;
  return (
    <CrudList
      key={universo}
      entity="sinais"
      before={
        <>
          <AbasUniverso
            universo={universo}
            onChange={(u) => {
              guardarUniverso(u);
              mudar('universo', u);
            }}
          />
          <FiltroSeveridade valor={valor} onChange={(v) => mudar('severidade', v)} />
        </>
      }
    />
  );
}
