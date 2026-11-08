import { createContext, useContext, useEffect, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { api } from '../lib/api';

const MetaContext = createContext(null);

/** Carrega a definição das entidades (/api/meta) uma vez e disponibiliza para o app. */
export function MetaProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/meta').then(setMeta).catch(setError);
  }, []);

  if (error)
    return (
      <div className="vh-100 d-grid place-center text-center p-4">
        <div>
          <i className="bi bi-plug fs-1 text-danger" />
          <h5 className="mt-2">Não consegui falar com a API</h5>
          <p className="text-muted">Confira se o servidor está rodando (npm run dev na raiz do projeto).</p>
        </div>
      </div>
    );
  if (!meta)
    return (
      <div className="vh-100 d-grid place-center">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  return <MetaContext.Provider value={meta}>{children}</MetaContext.Provider>;
}

export const useMeta = () => useContext(MetaContext);
