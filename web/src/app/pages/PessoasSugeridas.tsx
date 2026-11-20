// Tela "Pessoas sugeridas" (0.4.6): Apollo em lote — buscar pessoas (sem custo) e enriquecer empresas (1 crédito
// cada) de um universo — e a lista de sugestões pendentes de todas as empresas.
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap';
import PageHeader from '../../components/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, errorMessage } from '../../lib/api';
import SugestoesPessoas from '../components/SugestoesPessoas';

interface Status {
  configurado: boolean;
  sugestoes: number;
  a_enriquecer: number;
}

export default function PessoasSugeridas() {
  const { can } = useAuth();
  const toast = useToast();
  const [universo, setUniverso] = useState<'Concorrente' | 'Conta-alvo'>('Concorrente');
  const [status, setStatus] = useState<Status | null>(null);
  const [rodando, setRodando] = useState<'pessoas' | 'enriquecer' | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    api
      .get<Status>(`/radar/apollo/status?universo=${encodeURIComponent(universo)}`)
      .then((s) => vivo && setStatus(s))
      .catch((e) => toast.error(errorMessage(e)));
    return () => {
      vivo = false;
    };
  }, [universo, versao, toast]);

  const nomeUniverso = universo === 'Concorrente' ? 'concorrentes' : 'contas-alvo';
  const semSite = (l: string[]) =>
    l.length ? ` · sem site: ${l.slice(0, 5).join(', ')}${l.length > 5 ? '…' : ''}` : '';

  const buscar = async () => {
    setRodando('pessoas');
    try {
      const r = await api.post<{ empresas: number; novas: number; sem_site: string[]; erros: string[] }>(
        '/radar/apollo/pessoas',
        { universo },
      );
      toast.success(`${r.empresas} empresa(s) consultada(s) · ${r.novas} nova(s) sugestão(ões)${semSite(r.sem_site)}`);
      for (const e of r.erros.slice(0, 3)) toast.error(e);
      setVersao((v) => v + 1);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRodando(null);
    }
  };
  const enriquecer = async () => {
    if (!status) return;
    if (
      !window.confirm(
        `Enriquecer ${status.a_enriquecer} empresa(s) (${nomeUniverso}) no Apollo?\n\nCusto: 1 crédito por empresa. ` +
          'Empresas enriquecidas nos últimos 90 dias ficam de fora.',
      )
    )
      return;
    setRodando('enriquecer');
    try {
      const r = await api.post<{ enriquecidas: number; sem_site: string[]; erros: string[] }>(
        '/radar/apollo/enriquecer',
        { universo },
      );
      toast.success(`${r.enriquecidas} empresa(s) enriquecida(s)${semSite(r.sem_site)}`);
      for (const e of r.erros.slice(0, 3)) toast.error(e);
      setVersao((v) => v + 1);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRodando(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Pessoas sugeridas"
        subtitle="Pessoas relevantes encontradas no Apollo, para aprovar ou descartar"
      />
      {status && !status.configurado && (
        <Alert variant="warning">
          Falta a chave do Apollo: coloque <code>APOLLO_API_KEY</code> (chave mestra) no <code>server/.env</code> e
          reinicie o servidor.
        </Alert>
      )}
      <Card className="card-app mb-3">
        <Card.Body className="d-flex flex-wrap align-items-center gap-2">
          <Form.Select
            size="sm"
            style={{ width: 'auto' }}
            value={universo}
            onChange={(e) => setUniverso(e.target.value as typeof universo)}
            aria-label="Universo"
          >
            <option value="Concorrente">Concorrentes</option>
            <option value="Conta-alvo">Contas-alvo</option>
          </Form.Select>
          {can('pessoas', 'criar') && (
            <Button
              size="sm"
              variant="light"
              className="border"
              disabled={!status?.configurado || !!rodando}
              onClick={() => void buscar()}
            >
              {rodando === 'pessoas' ? (
                <Spinner size="sm" animation="border" className="me-1" />
              ) : (
                <i className="bi bi-person-plus me-1" />
              )}
              Buscar pessoas de todos os {nomeUniverso} <span className="text-muted">(sem custo)</span>
            </Button>
          )}
          {can('empresas', 'editar') && (
            <Button
              size="sm"
              variant="light"
              className="border"
              disabled={!status?.configurado || !status.a_enriquecer || !!rodando}
              onClick={() => void enriquecer()}
            >
              {rodando === 'enriquecer' ? (
                <Spinner size="sm" animation="border" className="me-1" />
              ) : (
                <i className="bi bi-stars me-1" />
              )}
              Enriquecer {status?.a_enriquecer ?? 0} empresa(s){' '}
              <span className="text-muted">({status?.a_enriquecer ?? 0} crédito(s))</span>
            </Button>
          )}
          <span className="small text-muted ms-auto">
            Áreas: C-level e sócios, TI, Marketing, Comercial e RH (diretoria e gerência)
          </span>
        </Card.Body>
      </Card>
      <Card className="card-app">
        <Card.Body>
          <SugestoesPessoas versao={versao} />
        </Card.Body>
      </Card>
    </>
  );
}
