import { useEffect, useState } from 'react';
import { Button } from 'react-bootstrap';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface Resultado {
  empresas: { novas: number; atualizadas: number; ignoradas: number };
  pessoas: { novas: number; atualizadas: number; sem_linkedin: number; ignoradas: number };
  alertas: number;
  avisos: string[];
}
interface Status {
  configurado: boolean;
  filtro_contas: number;
  filtro_concorrentes: number;
  ultima: { quando: string; ok: boolean; erro?: string; resultado?: Resultado } | null;
}

const resumo = (r: Resultado) =>
  `Empresas: ${r.empresas.novas} novas, ${r.empresas.atualizadas} atualizadas · ` +
  `Pessoas: ${r.pessoas.novas} novas, ${r.pessoas.atualizadas} atualizadas` +
  (r.empresas.ignoradas ? ` · ${r.empresas.ignoradas} empresa(s) da lixeira ignoradas` : '') +
  (r.alertas ? ` · ${r.alertas} alerta(s) de cadastro` : '');

/** Botão "Sincronizar com Pipedrive" (listagem de empresas). Só aparece com permissão de criar empresas. */
export default function SincronizarPipedrive({ onFeito }: { onFeito?: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const pode = can('empresas', 'criar');
  const [status, setStatus] = useState<Status | null>(null);
  const [rodando, setRodando] = useState(false);

  useEffect(() => {
    if (!pode) return;
    let vivo = true;
    api
      .get<Status>('/radar/pipedrive/status')
      .then((s) => vivo && setStatus(s))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [pode]);

  if (!pode || !status) return null;
  const semFiltro = !status.filtro_contas && !status.filtro_concorrentes;
  const titulo = !status.configurado
    ? 'Falta o PIPEDRIVE_API_TOKEN no .env do servidor'
    : semFiltro
      ? 'Informe o filtro do Pipedrive em Configurações › Radar'
      : status.ultima
        ? `Última sincronização: ${status.ultima.quando.slice(0, 16)}${status.ultima.ok ? '' : ` (erro: ${status.ultima.erro})`}`
        : 'Traz contas-alvo, concorrentes e pessoas-chave dos filtros do Pipedrive';

  const sincronizar = async () => {
    setRodando(true);
    try {
      const u = await api.post<{ quando: string; resultado: Resultado }>('/radar/pipedrive/sincronizar', {});
      toast.success(resumo(u.resultado));
      for (const a of u.resultado.avisos) toast.error(a);
      setStatus({ ...status, ultima: { quando: u.quando, ok: true, resultado: u.resultado } });
      onFeito?.();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRodando(false);
    }
  };

  return (
    <Button
      variant="light"
      className="border"
      onClick={() => void sincronizar()}
      disabled={rodando || !status.configurado || semFiltro}
      title={titulo}
    >
      <i className={`bi ${rodando ? 'bi-arrow-repeat' : 'bi-arrow-left-right'}`} />
      <span className="d-none d-md-inline ms-1">{rodando ? 'Sincronizando…' : 'Sincronizar com Pipedrive'}</span>
    </Button>
  );
}
