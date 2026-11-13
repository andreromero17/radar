import { useEffect, useState } from 'react';
import { Button } from 'react-bootstrap';
import type { ResultadoModelo } from '@frame/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

/**
 * Botão "Trazer do modelo" (frame 0.22.0): traz do espaço MODELO da plataforma o que falta neste espaço
 * (bibliotecas, logos...), sem sobrescrever o que o dono personalizou. Só aparece para o dono e quando há modelo.
 * O sistema decide onde mostrar (ex.: na listagem da biblioteca, via `actions` do CrudList).
 */
export default function TrazerDoModelo({
  onFeito,
  rotulo = 'Trazer do modelo',
}: {
  onFeito?: () => void;
  rotulo?: string;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const pode = can('configuracoes', 'editar');
  const [disponivel, setDisponivel] = useState(false);
  const [trazendo, setTrazendo] = useState(false);

  useEffect(() => {
    if (!pode) return;
    let vivo = true;
    api
      .get<{ disponivel: boolean }>('/espaco/modelo')
      .then((r) => vivo && setDisponivel(r.disponivel))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [pode]);

  if (!pode || !disponivel) return null;

  const trazer = async () => {
    setTrazendo(true);
    try {
      const r = await api.post<ResultadoModelo>('/espaco/modelo', {});
      toast.success(
        r.total
          ? `Do modelo: ${r.itens
              .filter((i) => i.alterados)
              .map((i) => `${i.nome} (${i.alterados})`)
              .join(', ')}`
          : 'Já estava tudo em dia com o modelo',
      );
      onFeito?.();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTrazendo(false);
    }
  };

  return (
    <Button
      variant="light"
      className="border"
      onClick={() => void trazer()}
      disabled={trazendo}
      title="Traz do modelo da plataforma o que falta aqui (com logos), sem mudar o que você personalizou"
    >
      <i className="bi bi-cloud-download" />
      <span className="d-none d-md-inline ms-1">{rotulo}</span>
    </Button>
  );
}
