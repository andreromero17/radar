import { useEffect, useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface Status {
  configurado: boolean;
  rodando: boolean;
  ultima: { situacao: string; run_apify: string | null } | null;
}

/** Botão "Coletar agora" (lista de execuções): dispara a coleta em segundo plano e recarrega a lista */
export default function ColetarAgora({ onFeito }: { onFeito?: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const pode = can('empresas', 'criar');
  const [status, setStatus] = useState<Status | null>(null);
  const rodava = useRef(false);
  const aoTerminar = useRef(onFeito);
  aoTerminar.current = onFeito;

  // enquanto há coleta rodando, consulta a cada 15 s; quando termina, recarrega a lista uma vez
  useEffect(() => {
    if (!pode) return;
    let vivo = true;
    const consultar = () =>
      api
        .get<Status>('/radar/coleta/status')
        .then((s) => {
          if (!vivo) return;
          if (rodava.current && !s.rodando) aoTerminar.current?.();
          rodava.current = s.rodando;
          setStatus(s);
        })
        .catch(() => {});
    void consultar();
    const t = setInterval(() => {
      if (rodava.current) void consultar();
    }, 15_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [pode]);

  if (!pode || !status) return null;
  const retomavel = status.ultima?.situacao === 'Erro' ? status.ultima.run_apify : null;
  const coletar = async (runApify?: string, tipo: 'posts' | 'paginas' = 'posts') => {
    try {
      await api.post('/radar/coleta/executar', runApify ? { run_apify: runApify } : { tipo });
      toast.success(
        runApify
          ? 'Retomando o run no Apify: os posts que ele já coletou entram sem custo novo.'
          : tipo === 'paginas'
            ? 'Buscando seguidores e logos das páginas. A lista atualiza sozinha.'
            : 'Coleta iniciada. Pode levar alguns minutos; a lista atualiza sozinha.',
      );
      rodava.current = true;
      setStatus({ ...status, rodando: true });
      onFeito?.();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <>
      {retomavel && !status.rodando && (
        <Button
          variant="light"
          className="border me-2"
          onClick={() => void coletar(retomavel)}
          title={`Aproveita o run ${retomavel} do Apify, que continuou rodando lá, sem disparar outro`}
        >
          <i className="bi bi-arrow-clockwise" />
          <span className="d-none d-md-inline ms-1">Retomar coleta</span>
        </Button>
      )}
      <Button
        variant="light"
        className="border me-2"
        onClick={() => void coletar(undefined, 'paginas')}
        disabled={!status.configurado || status.rodando}
        title="Atualiza seguidores, funcionários e logos das páginas das empresas (roda sozinho uma vez por semana)"
      >
        <i className="bi bi-image" />
        <span className="d-none d-md-inline ms-1">Logos e seguidores</span>
      </Button>
      <Button
        variant="light"
        className="border"
        onClick={() => void coletar()}
        disabled={!status.configurado || status.rodando}
        title={
          status.configurado
            ? 'Busca agora os posts das empresas e pessoas monitoradas'
            : 'Falta o APIFY_TOKEN no .env do servidor'
        }
      >
        <i className={`bi ${status.rodando ? 'bi-hourglass-split' : 'bi-cloud-download'}`} />
        <span className="d-none d-md-inline ms-1">{status.rodando ? 'Coletando…' : 'Coletar agora'}</span>
      </Button>
    </>
  );
}
