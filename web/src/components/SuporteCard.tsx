import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, ButtonGroup, Card, Spinner, ToggleButton } from 'react-bootstrap';
import type { SuporteResposta } from '@frame/shared';
import { api, errorMessage } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';

const PRAZOS = [
  { horas: 24, rotulo: '24 horas' },
  { horas: 72, rotulo: '3 dias' },
  { horas: 168, rotulo: '7 dias' },
] as const;

/**
 * Acesso do suporte ao espaço (Fase 5C): o dono libera por um prazo, como leitor (padrão) ou editor, e revoga quando
 * quiser. Sem liberação, ninguém da plataforma vê os dados. Todo acesso fica listado aqui.
 */
export default function SuporteCard({ dono }: { dono: boolean }) {
  const toast = useToast();
  const [dados, setDados] = useState<SuporteResposta | null>(null);
  const [horas, setHoras] = useState<24 | 72 | 168>(24);
  const [papel, setPapel] = useState<'leitor' | 'editor'>('leitor');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(() => {
    api
      .get<SuporteResposta>('/suporte')
      .then(setDados)
      .catch((e) => toast.error(errorMessage(e)));
  }, [toast]);
  useEffect(carregar, [carregar]);

  const fazer = async (fn: () => Promise<unknown>, ok: string) => {
    setEnviando(true);
    try {
      await fn();
      toast.success(ok);
      carregar();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setEnviando(false);
    }
  };

  if (!dados) return null;
  const l = dados.liberacao;
  return (
    <Card className="card-app mb-3">
      <Card.Header className="d-flex align-items-center gap-2">
        <i className="bi bi-headset" />
        <span className="fw-bold flex-grow-1">Acesso do suporte</span>
        {l ? (
          <Badge bg="info" text="dark">
            Liberado até {fmtDate(l.expira_em, true)}
          </Badge>
        ) : (
          <Badge bg="secondary">Fechado</Badge>
        )}
      </Card.Header>
      <Card.Body>
        <p className="small text-muted">
          A equipe da plataforma não vê os dados deste espaço. Se precisar de ajuda, libere o acesso por um tempo: tudo
          o que o suporte fizer fica registrado abaixo, e você pode encerrar quando quiser.
        </p>
        {l ? (
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className="small">
              Como <b>{l.papel === 'editor' ? 'editor (pode alterar)' : 'leitor (só vê)'}</b>, liberado por{' '}
              {l.liberado_por ?? '—'} em {fmtDate(l.liberado_em, true)}.
            </span>
            {dono && (
              <Button
                variant="outline-danger"
                size="sm"
                disabled={enviando}
                onClick={() => void fazer(() => api.del('/suporte'), 'Acesso do suporte encerrado')}
              >
                Encerrar agora
              </Button>
            )}
          </div>
        ) : dono ? (
          <div className="d-flex flex-wrap align-items-center gap-2">
            <ButtonGroup size="sm">
              {PRAZOS.map((p) => (
                <ToggleButton
                  key={p.horas}
                  id={`prazo-${p.horas}`}
                  type="radio"
                  variant="light"
                  className="border"
                  value={p.horas}
                  checked={horas === p.horas}
                  onChange={() => setHoras(p.horas)}
                >
                  {p.rotulo}
                </ToggleButton>
              ))}
            </ButtonGroup>
            <ButtonGroup size="sm">
              {(['leitor', 'editor'] as const).map((p) => (
                <ToggleButton
                  key={p}
                  id={`papel-sup-${p}`}
                  type="radio"
                  variant="light"
                  className="border"
                  value={p}
                  checked={papel === p}
                  onChange={() => setPapel(p)}
                >
                  {p === 'leitor' ? 'Só ver' : 'Ver e alterar'}
                </ToggleButton>
              ))}
            </ButtonGroup>
            <Button
              size="sm"
              disabled={enviando}
              onClick={() => void fazer(() => api.post('/suporte', { horas, papel }), 'Acesso do suporte liberado')}
            >
              {enviando ? <Spinner size="sm" /> : 'Liberar'}
            </Button>
          </div>
        ) : (
          <div className="small text-muted">Só o dono do espaço libera o acesso do suporte.</div>
        )}

        {dados.historico.length > 0 && (
          <div className="mt-3">
            <div className="small fw-semibold mb-1">Histórico</div>
            <ul className="list-unstyled small mb-0 historico-suporte">
              {dados.historico.map((h, i) => (
                <li key={i}>
                  <span className="text-muted">{fmtDate(h.criado_em, true)}</span> · {h.usuario} · {h.acao}
                  {h.detalhe && <span className="text-muted"> ({h.detalhe})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
