import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, ButtonGroup, Card, Col, Dropdown, Form, Row, Spinner, Table, ToggleButton } from 'react-bootstrap';
import {
  PAPEL_LABELS,
  TIPO_ESPACO_LABELS,
  type EspacoPlataforma,
  type PlataformaResposta,
  type UsuarioPlataforma,
} from '@frame/shared';
import { api, errorMessage } from '../lib/api';
import { fmtBytes, fmtDate } from '../lib/format';
import { recarregarNoEspaco } from '../lib/espacos';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import ConfirmModal from '../components/ConfirmModal';

/**
 * Painel da plataforma (administradores): assinantes, espaços e uso. Só metadados — os dados de um espaço só
 * se veem entrando como suporte, quando o dono libera.
 */
export default function Plataforma() {
  const { user } = useAuth();
  const toast = useToast();
  const [dados, setDados] = useState<PlataformaResposta | null>(null);
  const [aba, setAba] = useState<'espacos' | 'usuarios'>('espacos');
  const [busca, setBusca] = useState('');
  const [confirma, setConfirma] = useState<{
    titulo: string;
    msg: string;
    botao: string;
    fazer: () => Promise<unknown>;
  } | null>(null);

  const carregar = useCallback(() => {
    api
      .get<PlataformaResposta>('/plataforma')
      .then(setDados)
      .catch((e) => toast.error(errorMessage(e)));
  }, [toast]);
  useEffect(carregar, [carregar]);

  const acao = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      carregar();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const filtro = busca.trim().toLowerCase();
  const espacos = useMemo(
    () =>
      (dados?.espacos ?? []).filter(
        (e) => !filtro || `${e.nome} ${e.dono ?? ''} ${e.dono_email ?? ''}`.toLowerCase().includes(filtro),
      ),
    [dados, filtro],
  );
  const usuarios = useMemo(
    () => (dados?.usuarios ?? []).filter((u) => !filtro || `${u.nome} ${u.email}`.toLowerCase().includes(filtro)),
    [dados, filtro],
  );

  if (!dados)
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );

  const entrarSuporte = (e: EspacoPlataforma) =>
    setConfirma({
      titulo: 'Entrar como suporte',
      msg: `Você vai ver "${e.nome}" como ${PAPEL_LABELS[e.suporte!.papel].toLowerCase()}, com liberação do dono até ${fmtDate(
        e.suporte!.expira_em,
        true,
      )}. A entrada, a saída e o que você alterar ficam no log do espaço, visível ao dono.`,
      botao: 'Entrar',
      fazer: async () => {
        await api.post(`/plataforma/suporte/${e.id}`, {});
        recarregarNoEspaco();
      },
    });

  const linhaEspaco = (e: EspacoPlataforma) => (
    <tr key={e.id} className={e.ativo ? '' : 'text-muted'}>
      <td>
        <div className="fw-semibold">{e.nome}</div>
        <div className="small text-muted">
          {TIPO_ESPACO_LABELS[e.tipo] ?? e.tipo} · desde {fmtDate(e.criado_em)}
        </div>
      </td>
      <td>
        <div>{e.dono ?? '—'}</div>
        <div className="small text-muted">{e.dono_email}</div>
      </td>
      <td className="text-end">
        {e.membros}
        {e.convites > 0 && <div className="small text-muted">+{e.convites} convite(s)</div>}
      </td>
      <td className="text-end text-nowrap">{fmtBytes(e.tamanho)}</td>
      <td className="small text-nowrap">{e.ultimo_acesso ? fmtDate(e.ultimo_acesso, true) : '—'}</td>
      <td>
        {!e.ativo ? (
          <Badge bg="secondary">Desativado</Badge>
        ) : e.suporte ? (
          <Badge bg="info" text="dark" title={`Liberado por ${e.suporte.liberado_por ?? '—'}`}>
            Suporte liberado até {fmtDate(e.suporte.expira_em, true)}
          </Badge>
        ) : (
          <Badge bg="success">Ativo</Badge>
        )}
      </td>
      <td className="text-end">
        <Dropdown align="end">
          <Dropdown.Toggle variant="light" size="sm" className="no-caret" aria-label={`Ações de ${e.nome}`}>
            <i className="bi bi-three-dots-vertical" />
          </Dropdown.Toggle>
          <Dropdown.Menu className="shadow-sm">
            <Dropdown.Item
              disabled={!e.suporte || !e.ativo || user?.espacos?.some((x) => x.id === e.id)}
              onClick={() => entrarSuporte(e)}
            >
              <i className="bi bi-headset me-2" />
              Entrar como suporte
              {!e.suporte && <div className="small text-muted">O dono não liberou</div>}
            </Dropdown.Item>
            <Dropdown.Divider />
            {e.ativo ? (
              <Dropdown.Item
                className="text-danger"
                onClick={() =>
                  setConfirma({
                    titulo: 'Desativar espaço',
                    msg: `Todos os membros de "${e.nome}" perdem o acesso na hora. Os dados ficam guardados; dá para reativar.`,
                    botao: 'Desativar',
                    fazer: () => api.put(`/plataforma/espacos/${e.id}`, { ativo: false }),
                  })
                }
              >
                <i className="bi bi-pause-circle me-2" />
                Desativar espaço
              </Dropdown.Item>
            ) : (
              <Dropdown.Item
                onClick={() =>
                  void acao(() => api.put(`/plataforma/espacos/${e.id}`, { ativo: true }), 'Espaço reativado')
                }
              >
                <i className="bi bi-play-circle me-2" />
                Reativar espaço
              </Dropdown.Item>
            )}
          </Dropdown.Menu>
        </Dropdown>
      </td>
    </tr>
  );

  const linhaUsuario = (u: UsuarioPlataforma) => (
    <tr key={u.id} className={u.ativo ? '' : 'text-muted'}>
      <td>
        <div className="fw-semibold">
          {u.nome}
          {u.id === user?.id && <span className="text-muted fw-normal"> (você)</span>}
        </div>
        <div className="small text-muted">{u.email}</div>
      </td>
      <td>{u.admin ? <Badge bg="primary">Administrador</Badge> : <span className="small">{u.perfil}</span>}</td>
      <td className="text-end">{u.espacos}</td>
      <td>
        {u.dois_fatores ? (
          <Badge bg="success">
            <i className="bi bi-shield-check me-1" />
            Ligada
          </Badge>
        ) : (
          <Badge bg={u.admin ? 'warning' : 'light'} text="dark" className="border">
            Desligada
          </Badge>
        )}
      </td>
      <td className="small text-nowrap">{u.ultimo_acesso ? fmtDate(u.ultimo_acesso, true) : '—'}</td>
      <td>{u.ativo ? <Badge bg="success">Ativa</Badge> : <Badge bg="secondary">Desativada</Badge>}</td>
      <td className="text-end">
        <Dropdown align="end">
          <Dropdown.Toggle variant="light" size="sm" className="no-caret" aria-label={`Ações de ${u.nome}`}>
            <i className="bi bi-three-dots-vertical" />
          </Dropdown.Toggle>
          <Dropdown.Menu className="shadow-sm">
            <Dropdown.Item
              onClick={() =>
                void acao(() => api.post(`/plataforma/usuarios/${u.id}/sessoes`, {}), 'Sessões encerradas')
              }
            >
              <i className="bi bi-box-arrow-right me-2" />
              Encerrar sessões
            </Dropdown.Item>
            <Dropdown.Item
              disabled={!u.dois_fatores || u.id === user?.id}
              onClick={() =>
                setConfirma({
                  titulo: 'Desligar a verificação em duas etapas',
                  msg: `Use quando ${u.nome} perdeu o celular e os códigos de recuperação. Confirme a identidade da pessoa antes: ela passa a entrar só com a senha${u.admin ? ' (e, sendo administrador, configura de novo no próximo acesso)' : ''}.`,
                  botao: 'Desligar',
                  fazer: () => api.post(`/plataforma/usuarios/${u.id}/2fa`, {}),
                })
              }
            >
              <i className="bi bi-shield-x me-2" />
              Desligar 2 etapas
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item
              disabled={u.id === user?.id}
              className={u.ativo ? 'text-danger' : ''}
              onClick={() =>
                u.ativo
                  ? setConfirma({
                      titulo: 'Desativar conta',
                      msg: `${u.nome} não entra mais em nenhum espaço. Dá para reativar.`,
                      botao: 'Desativar',
                      fazer: () => api.put(`/plataforma/usuarios/${u.id}`, { ativo: false }),
                    })
                  : void acao(() => api.put(`/plataforma/usuarios/${u.id}`, { ativo: true }), 'Conta reativada')
              }
            >
              <i className={`bi bi-${u.ativo ? 'person-slash' : 'person-check'} me-2`} />
              {u.ativo ? 'Desativar conta' : 'Reativar conta'}
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </td>
    </tr>
  );

  const t = dados.totais;
  return (
    <>
      <PageHeader title="Plataforma" icon="hdd-network" subtitle="Assinantes, espaços e uso — sem acesso aos dados" />
      <Row className="g-3 mb-3">
        <Col xs={6} lg={3}>
          <StatCard label="Contas ativas" value={t.usuarios} icon="people" />
        </Col>
        <Col xs={6} lg={3}>
          <StatCard label="Espaços ativos" value={t.espacos} icon="house-door" color="purple" />
        </Col>
        <Col xs={6} lg={3}>
          <StatCard label="Sessões abertas" value={t.sessoes} icon="display" color="teal" />
        </Col>
        <Col xs={6} lg={3}>
          <StatCard label="Dados guardados" value={fmtBytes(t.tamanho)} icon="database" color="orange" />
        </Col>
      </Row>
      {t.sem_2fa_admin > 0 && (
        <div className="alert alert-warning small">
          <i className="bi bi-shield-exclamation me-1" />
          {t.sem_2fa_admin} administrador(es) sem a verificação em duas etapas.
        </div>
      )}

      <Card className="card-app">
        <Card.Body className="d-flex flex-wrap gap-2 align-items-center border-bottom">
          <ButtonGroup>
            {(['espacos', 'usuarios'] as const).map((a) => (
              <ToggleButton
                key={a}
                id={`aba-${a}`}
                type="radio"
                variant="light"
                className="border"
                value={a}
                checked={aba === a}
                onChange={() => setAba(a)}
              >
                {a === 'espacos' ? `Espaços (${dados.espacos.length})` : `Contas (${dados.usuarios.length})`}
              </ToggleButton>
            ))}
          </ButtonGroup>
          <Form.Control
            className="ms-auto"
            style={{ maxWidth: '18rem' }}
            placeholder="Buscar nome ou e-mail…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </Card.Body>
        <div className="table-responsive">
          {aba === 'espacos' ? (
            <Table hover className="mb-0 align-middle tabela-plataforma">
              <thead>
                <tr>
                  <th>Espaço</th>
                  <th>Dono</th>
                  <th className="text-end">Membros</th>
                  <th className="text-end">Tamanho</th>
                  <th>Último acesso</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>{espacos.map(linhaEspaco)}</tbody>
            </Table>
          ) : (
            <Table hover className="mb-0 align-middle tabela-plataforma">
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>Perfil</th>
                  <th className="text-end">Espaços</th>
                  <th>2 etapas</th>
                  <th>Último acesso</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>{usuarios.map(linhaUsuario)}</tbody>
            </Table>
          )}
        </div>
      </Card>

      <ConfirmModal
        show={!!confirma}
        title={confirma?.titulo}
        message={confirma?.msg}
        confirmLabel={confirma?.botao}
        onConfirm={() => {
          const c = confirma;
          setConfirma(null);
          if (c) void acao(c.fazer, 'Feito');
        }}
        onCancel={() => setConfirma(null)}
      />
    </>
  );
}
