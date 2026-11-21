import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Form, InputGroup, Spinner } from 'react-bootstrap';
import { api, ApiError, errorMessage } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';
import ConfirmModal from './ConfirmModal';

interface Escopo {
  escopo: string;
  nome: string;
  descricao: string;
}
interface Token {
  id: number;
  nome: string;
  escopo: string;
  prefixo: string;
  criado_em: string;
  ultimo_uso: string | null;
}

/**
 * Meu perfil → Integrações: tokens para atalhos do celular e automações, no espaço atual. Só aparece quando o
 * sistema registrou algum escopo (`registerEscopoIntegracao` no servidor).
 */
export default function IntegracoesCard() {
  const toast = useToast();
  const [escopos, setEscopos] = useState<Escopo[] | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [nome, setNome] = useState('');
  const [escopo, setEscopo] = useState('');
  const [novo, setNovo] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [revogar, setRevogar] = useState<Token | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [e, t] = await Promise.all([
        api.get<Escopo[]>('/integracoes/escopos'),
        api.get<Token[]>('/integracoes/tokens'),
      ]);
      setEscopos(e);
      setTokens(t);
      setEscopo((atual) => atual || e[0]?.escopo || '');
    } catch {
      setEscopos([]); // sem espaço ou sem permissão: o cartão some
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!escopos?.length) return null;
  const nomeEscopo = (e: string) => escopos.find((x) => x.escopo === e)?.nome ?? e;

  const criar = async (ev: FormEvent) => {
    ev.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const r = await api.post<{ token: string }>('/integracoes/tokens', { nome, escopo });
      setNovo(r.token);
      setNome('');
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : errorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  const copiar = async () => {
    if (!novo) return;
    try {
      await navigator.clipboard.writeText(novo);
      toast.success('Token copiado');
    } catch {
      toast.error('Não deu para copiar: selecione o texto e copie');
    }
  };

  const confirmarRevogar = async () => {
    if (!revogar) return;
    try {
      await api.del(`/integracoes/tokens/${revogar.id}`);
      toast.success('Token revogado');
      await carregar();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRevogar(null);
    }
  };

  return (
    <Card className="card-app h-100">
      <Card.Header>
        <i className="bi bi-plug me-2" />
        Integrações
      </Card.Header>
      <Card.Body className="p-4">
        <p className="text-muted small">
          Tokens para atalhos do celular e automações enviarem dados para este espaço sem abrir o sistema. Cada token só
          faz o que o tipo dele permite, com as suas permissões. Guarde-o como uma senha.
        </p>

        {novo && (
          <Alert variant="success" onClose={() => setNovo(null)} dismissible>
            <div className="fw-semibold mb-2">Copie o token agora: ele não será mostrado de novo.</div>
            <InputGroup>
              <Form.Control readOnly value={novo} className="font-monospace" onFocus={(e) => e.target.select()} />
              <Button variant="outline-secondary" onClick={() => void copiar()}>
                <i className="bi bi-clipboard" />
              </Button>
            </InputGroup>
          </Alert>
        )}

        <Form onSubmit={(e) => void criar(e)} className="mb-3">
          <div className="d-flex flex-wrap gap-2 align-items-start">
            <Form.Control
              placeholder="Nome (ex.: iPhone do André)"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={80}
              style={{ flex: '1 1 12rem' }}
            />
            {escopos.length > 1 && (
              <Form.Select value={escopo} onChange={(e) => setEscopo(e.target.value)} style={{ flex: '1 1 12rem' }}>
                {escopos.map((e) => (
                  <option key={e.escopo} value={e.escopo}>
                    {e.nome}
                  </option>
                ))}
              </Form.Select>
            )}
            <Button type="submit" disabled={enviando || !nome.trim()}>
              {enviando ? <Spinner size="sm" /> : 'Gerar token'}
            </Button>
          </div>
          {escopos.length === 1 && <Form.Text>{escopos[0].descricao}</Form.Text>}
          {erro && <div className="text-danger small mt-1">{erro}</div>}
        </Form>

        {tokens.length === 0 ? (
          <div className="text-muted small">Nenhum token neste espaço.</div>
        ) : (
          <ul className="list-unstyled mb-0">
            {tokens.map((t) => (
              <li key={t.id} className="d-flex align-items-center gap-2 py-2 border-top">
                <div className="flex-grow-1 min-w-0">
                  <div className="fw-semibold text-truncate">{t.nome}</div>
                  <div className="small text-muted">
                    {escopos.length > 1 && <>{nomeEscopo(t.escopo)} · </>}
                    <span className="font-monospace">{t.prefixo}…</span> · criado em {fmtDate(t.criado_em)} ·{' '}
                    {t.ultimo_uso ? `último uso ${fmtDate(t.ultimo_uso, true)}` : 'nunca usado'}
                  </div>
                </div>
                <Button size="sm" variant="outline-danger" onClick={() => setRevogar(t)}>
                  Revogar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card.Body>
      <ConfirmModal
        show={!!revogar}
        title="Revogar token"
        message={`O token "${revogar?.nome ?? ''}" deixa de funcionar na hora. Quem o usa precisará de um novo.`}
        confirmLabel="Revogar"
        onConfirm={() => void confirmarRevogar()}
        onCancel={() => setRevogar(null)}
      />
    </Card>
  );
}
