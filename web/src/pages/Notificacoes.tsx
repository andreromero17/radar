import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, ButtonGroup, Card, Form, Spinner, ToggleButton } from 'react-bootstrap';
import type { Notificacao, NotificacoesResposta, PreferenciasNotificacoesResposta } from '@frame/shared';
import { api, errorMessage } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import { avisarMudanca, corNivel, iconeNivel, quando } from '../lib/notificacoes';

/** Todas as notificações do usuário (lidas e não lidas) e as preferências: tipos ligados e e-mail */
export default function Notificacoes() {
  const toast = useToast();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<'todas' | 'nao_lidas'>('todas');
  const [dados, setDados] = useState<NotificacoesResposta | null>(null);
  const [prefs, setPrefs] = useState<PreferenciasNotificacoesResposta | null>(null);

  const carregar = useCallback(() => {
    api
      .get<NotificacoesResposta>(`/notificacoes?limite=200${filtro === 'nao_lidas' ? '&nao_lidas=1' : ''}`)
      .then(setDados)
      .catch((e) => toast.error(errorMessage(e)));
  }, [filtro, toast]);
  useEffect(() => {
    carregar();
    window.addEventListener('notificacoes:mudou', carregar);
    return () => window.removeEventListener('notificacoes:mudou', carregar);
  }, [carregar]);
  useEffect(() => {
    api
      .get<PreferenciasNotificacoesResposta>('/notificacoes/preferencias')
      .then(setPrefs)
      .catch((e) => toast.error(errorMessage(e)));
  }, [toast]);
  useEffect(() => {
    if (prefs && window.location.hash === '#preferencias')
      document.getElementById('preferencias')?.scrollIntoView({ behavior: 'smooth' });
  }, [prefs]);

  const abrir = async (n: Notificacao) => {
    if (!n.lida_em) await api.post(`/notificacoes/${n.id}/lida`, {}).catch(() => {});
    avisarMudanca();
    if (n.link) navigate(n.link);
  };
  const lerTodas = async () => {
    await api.post('/notificacoes/lidas', {});
    avisarMudanca();
  };
  const gravar = async (pref: PreferenciasNotificacoesResposta['pref']) => {
    if (!prefs) return;
    setPrefs({ ...prefs, pref });
    try {
      await api.put('/notificacoes/preferencias', pref);
      toast.success('Preferências salvas');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const alternarTipo = (tipo: string) => {
    if (!prefs) return;
    const d = prefs.pref.desligados;
    gravar({ ...prefs.pref, desligados: d.includes(tipo) ? d.filter((x) => x !== tipo) : [...d, tipo] });
  };

  return (
    <>
      <PageHeader title="Notificações" icon="bell" subtitle="Avisos do sistema e o que você quer receber">
        {!!dados?.nao_lidas && (
          <Button variant="light" className="border" onClick={lerTodas}>
            <i className="bi bi-check2-all me-1" />
            Marcar todas como lidas
          </Button>
        )}
      </PageHeader>

      <ButtonGroup size="sm" className="mb-3">
        {(['todas', 'nao_lidas'] as const).map((f) => (
          <ToggleButton
            key={f}
            id={`notif-${f}`}
            type="radio"
            variant="outline-secondary"
            value={f}
            checked={filtro === f}
            onChange={() => setFiltro(f)}
          >
            {f === 'todas' ? 'Todas' : `Não lidas${dados?.nao_lidas ? ` (${dados.nao_lidas})` : ''}`}
          </ToggleButton>
        ))}
      </ButtonGroup>

      <Card className="card-app mb-4">
        {!dados ? (
          <div className="text-center py-5">
            <Spinner />
          </div>
        ) : !dados.itens.length ? (
          <Card.Body className="text-muted text-center py-5">
            <i className="bi bi-bell-slash d-block fs-3 mb-2" />
            {filtro === 'nao_lidas' ? 'Tudo lido.' : 'Nenhuma notificação por enquanto.'}
          </Card.Body>
        ) : (
          <ul className="list-unstyled mb-0 lista-notificacoes">
            {dados.itens.map((n) => (
              <li key={n.id}>
                <button type="button" className={`notif-linha${n.lida_em ? '' : ' nao-lida'}`} onClick={() => abrir(n)}>
                  <i className={`bi bi-${iconeNivel(n)} fs-5`} style={{ color: corNivel(n.nivel) }} />
                  <span className="flex-grow-1 text-start">
                    <span className="d-block sino-titulo">{n.titulo}</span>
                    {n.mensagem && <span className="d-block small text-muted">{n.mensagem}</span>}
                  </span>
                  <span className="small text-muted text-nowrap" title={fmtDate(n.criada_em)}>
                    {quando(n.criada_em)}
                  </span>
                  {n.link && <i className="bi bi-chevron-right text-muted" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="card-app" id="preferencias">
        <Card.Header>
          <i className="bi bi-sliders" /> Preferências
        </Card.Header>
        <Card.Body>
          {!prefs ? (
            <Spinner size="sm" />
          ) : (
            <>
              {prefs.tipos.length === 0 ? (
                <p className="text-muted">Este sistema ainda não tem tipos de aviso para o seu perfil.</p>
              ) : (
                <div className="d-grid gap-3 mb-4">
                  {prefs.tipos.map((t) => (
                    <Form.Check
                      key={t.tipo}
                      type="switch"
                      id={`tipo-${t.tipo}`}
                      checked={!prefs.pref.desligados.includes(t.tipo)}
                      onChange={() => alternarTipo(t.tipo)}
                      label={
                        <>
                          <span className="fw-semibold">
                            {t.icone && <i className={`bi bi-${t.icone} me-1`} />}
                            {t.rotulo}
                          </span>
                          <span className="d-block small text-muted">{t.descricao}</span>
                        </>
                      }
                    />
                  ))}
                </div>
              )}
              <Form.Check
                type="switch"
                id="notif-email"
                checked={prefs.pref.email}
                onChange={() => gravar({ ...prefs.pref, email: !prefs.pref.email })}
                label={
                  <>
                    <span className="fw-semibold">
                      <i className="bi bi-envelope me-1" />
                      Receber também por e-mail
                    </span>
                    <span className="d-block small text-muted">
                      Um resumo dos avisos novos, uma vez por dia (na verificação diária).
                    </span>
                  </>
                }
              />
              {prefs.pref.email && !prefs.email_disponivel && (
                <Alert variant="warning" className="small mt-3 mb-0">
                  O envio de e-mail ainda não está configurado no servidor (SMTP no <code>.env</code>): por enquanto os
                  e-mails só aparecem no log.
                </Alert>
              )}
            </>
          )}
        </Card.Body>
      </Card>
    </>
  );
}
