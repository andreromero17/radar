// Preferências do usuário guardadas no servidor (valem em qualquer aparelho): GET/PUT /api/preferencias/:chave
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** [valor, gravar, carregado] — valor null enquanto não há preferência (ou ainda carregando) */
export function usePreferencia<T>(chave: string): [T | null, (v: T | null) => Promise<void>, boolean] {
  const [valor, setValor] = useState<T | null>(null);
  const [carregado, setCarregado] = useState(false);
  useEffect(() => {
    let vivo = true;
    setCarregado(false);
    api
      .get<{ valor: T | null }>(`/preferencias/${encodeURIComponent(chave)}`)
      .then((r) => vivo && setValor(r.valor))
      .catch(() => vivo && setValor(null))
      .finally(() => vivo && setCarregado(true));
    return () => {
      vivo = false;
    };
  }, [chave]);
  const gravar = useCallback(
    async (v: T | null) => {
      setValor(v);
      await api.put(`/preferencias/${encodeURIComponent(chave)}`, { valor: v });
    },
    [chave],
  );
  return [valor, gravar, carregado];
}
