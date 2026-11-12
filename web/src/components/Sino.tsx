import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Dropdown } from 'react-bootstrap';
import type { Notificacao, NotificacoesResposta } from '@frame/shared';
import { api } from '../lib/api';
import { avisarMudanca, corNivel, iconeNivel, quando } from '../lib/notificacoes';

/** Sino do topo: contador de não lidas, as últimas 8 e atalho para a página (atualiza a cada 2 min e ao voltar à aba) */
export default function Sino() {
  const navigate = useNavigate();
  const [dados, setDados] = useState<NotificacoesResposta | null>(null);
  const carregar = useCallback(() => {
    api
      .get<NotificacoesResposta>('/notificacoes?limite=8')
      .then(setDados)
      .catch(() => {});
  }, []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 120_000);
    const foco = () => document.visibilityState === 'visible' && carregar();
    document.addEventListener('visibilitychange', foco);
    window.addEventListener('notificacoes:mudou', carregar);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', foco);
      window.removeEventListener('notificacoes:mudou', carregar);
    };
  }, [carregar]);

  const abrir = async (n: Notificacao) => {
    if (!n.lida_em) await api.post(`/notificacoes/${n.id}/lida`, {}).catch(() => {});
    avisarMudanca();
    if (n.link) navigate(n.link);
  };
  const lerTodas = async () => {
    await api.post('/notificacoes/lidas', {}).catch(() => {});
    avisarMudanca();
  };
  const naoLidas = dados?.nao_lidas ?? 0;

  return (
    <Dropdown align="end" className="sino">
      <Dropdown.Toggle
        variant="light"
        className="sino-botao"
        aria-label={naoLidas ? `Notificações: ${naoLidas} não lida(s)` : 'Notificações'}
      >
        <i className={`bi bi-bell${naoLidas ? '-fill' : ''}`} />
        {naoLidas > 0 && <span className="sino-contador">{naoLidas > 99 ? '99+' : naoLidas}</span>}
      </Dropdown.Toggle>
      <Dropdown.Menu className="shadow-sm sino-menu p-0">
        <div className="d-flex align-items-center px-3 py-2 border-bottom">
          <span className="fw-bold">Notificações</span>
          {naoLidas > 0 && (
            <Button size="sm" variant="link" className="ms-auto p-0 small" onClick={lerTodas}>
              marcar todas como lidas
            </Button>
          )}
        </div>
        {!dados?.itens.length ? (
          <div className="text-muted small px-3 py-4 text-center">
            <i className="bi bi-bell-slash d-block fs-4 mb-1" />
            Nenhuma notificação por enquanto.
          </div>
        ) : (
          <ul className="list-unstyled mb-0 sino-lista">
            {dados.itens.map((n) => (
              <li key={n.id}>
                <Dropdown.Item
                  as="button"
                  className={`sino-item${n.lida_em ? '' : ' nao-lida'}`}
                  onClick={() => abrir(n)}
                >
                  <i className={`bi bi-${iconeNivel(n)}`} style={{ color: corNivel(n.nivel) }} />
                  <span className="flex-grow-1 text-wrap">
                    <span className="d-block sino-titulo">{n.titulo}</span>
                    {n.mensagem && <span className="d-block small text-muted">{n.mensagem}</span>}
                  </span>
                  <span className="small text-muted text-nowrap">{quando(n.criada_em)}</span>
                </Dropdown.Item>
              </li>
            ))}
          </ul>
        )}
        <div className="d-flex border-top small">
          <Dropdown.Item as={Link} to="/notificacoes" className="text-center py-2">
            Ver todas
          </Dropdown.Item>
          <Dropdown.Item as={Link} to="/notificacoes#preferencias" className="text-center py-2 border-start">
            Preferências
          </Dropdown.Item>
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
