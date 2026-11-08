import { useEffect, useState } from 'react';
import { Dropdown, Form, InputGroup } from 'react-bootstrap';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import SettingsModal from '../components/SettingsModal';

export default function Topbar({ onMenu }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [term, setTerm] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  // Notificações simples derivadas do dashboard (trocar por um endpoint próprio depois)
  useEffect(() => {
    api
      .get('/dashboard')
      .then(({ cards }) => {
        const a = [];
        if (cards.urgentes) a.push({ icon: 'exclamation-triangle text-danger', text: `${cards.urgentes} chamado(s) urgente(s) ativo(s)`, to: '/chamados?prioridade=Urgente' });
        if (cards.semResponsavel) a.push({ icon: 'person-x text-warning', text: `${cards.semResponsavel} chamado(s) sem responsável`, to: '/chamados' });
        if (cards.aguardando) a.push({ icon: 'hourglass-split text-primary', text: `${cards.aguardando} aguardando cliente`, to: '/chamados?status=Aguardando cliente' });
        setAlerts(a);
      })
      .catch(() => {});
  }, [location.pathname]);

  const submit = (e) => {
    e.preventDefault();
    navigate(`/chamados?q=${encodeURIComponent(term.trim())}`);
    setTerm('');
  };

  return (
    <header className="app-topbar">
      <button className="btn btn-light d-lg-none" onClick={onMenu} aria-label="Abrir menu">
        <i className="bi bi-list fs-5" />
      </button>

      <Form className="topbar-search" onSubmit={submit}>
        <InputGroup>
          <InputGroup.Text className="bg-white">
            <i className="bi bi-search" />
          </InputGroup.Text>
          <Form.Control placeholder="Buscar protocolo..." value={term} onChange={(e) => setTerm(e.target.value)} />
        </InputGroup>
      </Form>

      <Dropdown align="end">
        <Dropdown.Toggle variant="light" className="position-relative no-caret" aria-label="Notificações">
          <i className="bi bi-bell fs-5" />
          {alerts.length > 0 && (
            <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">{alerts.length}</span>
          )}
        </Dropdown.Toggle>
        <Dropdown.Menu className="shadow-sm" style={{ minWidth: 290 }}>
          <Dropdown.Header>Notificações</Dropdown.Header>
          {alerts.length === 0 && <Dropdown.ItemText className="text-muted">Nada por aqui 🎉</Dropdown.ItemText>}
          {alerts.map((a) => (
            <Dropdown.Item key={a.text} as={Link} to={a.to} className="d-flex gap-2 align-items-center py-2">
              <i className={`bi bi-${a.icon}`} />
              {a.text}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown>

      <Dropdown align="end">
        <Dropdown.Toggle variant="light" className="d-flex align-items-center gap-2">
          <span className="avatar">UA</span>
          <span className="fw-bold d-none d-md-inline">Usuário Administrador</span>
        </Dropdown.Toggle>
        <Dropdown.Menu className="shadow-sm">
          <Dropdown.Item as={Link} to="/usuarios/1"><i className="bi bi-person me-2" />Meu perfil</Dropdown.Item>
          <Dropdown.Item onClick={() => setShowSettings(true)}><i className="bi bi-gear me-2" />Configurações</Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item onClick={() => alert('Autenticação entra numa próxima etapa 🙂')}>
            <i className="bi bi-box-arrow-left me-2" />Sair
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      <SettingsModal show={showSettings} onHide={() => setShowSettings(false)} />
    </header>
  );
}
