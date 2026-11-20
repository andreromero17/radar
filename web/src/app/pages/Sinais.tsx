import { useSearchParams } from 'react-router-dom';
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

export default function Sinais() {
  const [params, setParams] = useSearchParams();
  const valor = params.get('severidade');
  return (
    <CrudList
      entity="sinais"
      before={
        <FiltroSeveridade
          valor={valor}
          onChange={(v) =>
            setParams((p) => {
              const n = new URLSearchParams(p);
              if (v) n.set('severidade', v);
              else n.delete('severidade');
              n.delete('page');
              return n;
            })
          }
        />
      }
    />
  );
}
