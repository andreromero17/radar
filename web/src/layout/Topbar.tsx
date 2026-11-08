import { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import SettingsModal from '../components/SettingsModal';
import { useAuth } from '../context/AuthContext';
import { initials } from '../lib/format';

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, can, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <header className="app-topbar">
      <button className="btn btn-light d-lg-none" onClick={onMenu} aria-label="Abrir menu">
        <i className="bi bi-list fs-5" />
      </button>

      {/* espaço para filtros globais da aplicação (ex.: seletor de período) */}
      <div className="topbar-center" id="topbar-slot" />

      <Dropdown align="end">
        <Dropdown.Toggle variant="light" className="d-flex align-items-center gap-2" aria-label="Menu do usuário">
          <span className="avatar">{initials(user?.nome)}</span>
          <span className="fw-bold d-none d-md-inline">{user?.nome}</span>
        </Dropdown.Toggle>
        <Dropdown.Menu className="shadow-sm" style={{ minWidth: 240 }}>
          <div className="px-3 py-2 border-bottom mb-1">
            <div className="fw-bold text-truncate">{user?.nome}</div>
            <div className="small text-muted text-truncate">{user?.email}</div>
            <span className="badge rounded-pill text-bg-light border mt-1">
              <i className="bi bi-shield-lock me-1" />
              {user?.perfil}
            </span>
          </div>
          <Dropdown.Item as={Link} to="/perfil">
            <i className="bi bi-person me-2" />
            Meu perfil
          </Dropdown.Item>
          <Dropdown.Item as={Link} to="/trocar-senha">
            <i className="bi bi-key me-2" />
            Alterar senha
          </Dropdown.Item>
          {can('configuracoes', 'editar') && (
            <Dropdown.Item onClick={() => setShowSettings(true)}>
              <i className="bi bi-gear me-2" />
              Configurações
            </Dropdown.Item>
          )}
          <Dropdown.Divider />
          <Dropdown.Item onClick={() => void logout()}>
            <i className="bi bi-box-arrow-left me-2" />
            Sair
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      <SettingsModal show={showSettings} onHide={() => setShowSettings(false)} />
    </header>
  );
}
