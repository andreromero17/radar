import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Collapse } from 'react-bootstrap';
import { activeMenuPath, menu, type MenuItem } from '../config/menu';
import { useSettings } from '../context/SettingsContext';
import BrandMark from '../components/BrandMark';

function MenuLink({ item, active, collapsed }: { item: MenuItem; active: boolean; collapsed: boolean }) {
  return (
    <Link
      to={item.to ?? '#'}
      className={`nav-link-item ${active ? 'active' : ''}`}
      title={collapsed ? item.label : undefined}
    >
      <i className={`bi bi-${item.icon}`} />
      <span className="nav-label">{item.label}</span>
    </Link>
  );
}

function MenuGroup({ item, activePath, collapsed }: { item: MenuItem; activePath?: string; collapsed: boolean }) {
  const children = item.children ?? [];
  const hasActive = children.some((c) => c.to === activePath);
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        className={`nav-link-item ${hasActive && !open ? 'active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={collapsed ? item.label : undefined}
      >
        <i className={`bi bi-${item.icon}`} />
        <span className="nav-label">{item.label}</span>
        <i className={`bi bi-chevron-down nav-caret ${open ? 'open' : ''}`} />
      </button>
      <Collapse in={open}>
        <div className="nav-sub">
          {children.map((c) => (
            <MenuLink key={c.to} item={c} active={c.to === activePath} collapsed={collapsed} />
          ))}
        </div>
      </Collapse>
    </div>
  );
}

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export default function Sidebar({ collapsed, mobileOpen, onToggle, onClose }: SidebarProps) {
  const { pathname } = useLocation();
  const activePath = activeMenuPath(pathname);
  const { settings } = useSettings();

  return (
    <>
      <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <BrandMark settings={settings} />
          <span className="brand-text" title={settings.nome_sistema}>
            {settings.nome_sistema || 'Meu Sistema'}
          </span>
          <button
            className="btn btn-sm btn-light sidebar-toggle d-none d-lg-inline-flex"
            onClick={onToggle}
            aria-label="Recolher menu"
          >
            <i className="bi bi-list" />
          </button>
          <button className="btn btn-sm btn-light ms-auto d-lg-none" onClick={onClose} aria-label="Fechar menu">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <nav className="sidebar-nav">
          {menu.map((item) =>
            item.children ? (
              <MenuGroup key={item.label} item={item} activePath={activePath} collapsed={collapsed} />
            ) : (
              <MenuLink key={item.to} item={item} active={item.to === activePath} collapsed={collapsed} />
            ),
          )}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="nav-link-item"
            onClick={() => alert('Autenticação entra numa próxima etapa 🙂')}
          >
            <i className="bi bi-box-arrow-left" />
            <span className="nav-label">Sair</span>
          </button>
        </div>
      </aside>
      {mobileOpen && <div className="sidebar-backdrop d-lg-none" onClick={onClose} />}
    </>
  );
}
