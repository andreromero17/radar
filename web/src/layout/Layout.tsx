import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useSettings } from '../context/SettingsContext';
import { useNewVersion } from '../lib/version';

const useIsDesktop = () => {
  const query = '(min-width: 992px)';
  const [ok, setOk] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = (e: MediaQueryListEvent) => setOk(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return ok;
};

export default function Layout() {
  const isDesktop = useIsDesktop();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const { settings } = useSettings();
  const contato = [settings.telefone, settings.email, settings.endereco].filter(Boolean);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    try {
      localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
    } catch {
      /* armazenamento indisponível */
    }
  }, [collapsed]);

  const isCollapsed = isDesktop && collapsed;
  const novaVersao = useNewVersion();

  return (
    <div className={`app-shell menu-${settings.estilo_menu} ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        collapsed={isCollapsed}
        mobileOpen={mobileOpen}
        onToggle={() => setCollapsed((c) => !c)}
        onClose={() => setMobileOpen(false)}
      />
      <div className="app-main">
        <Topbar onMenu={() => setMobileOpen(true)} />
        {novaVersao && (
          <div className="new-version-bar" role="status">
            <i className="bi bi-stars" />
            <span>
              Há uma nova versão do sistema (<b>v{novaVersao.version}</b>).
            </span>
            <button className="btn btn-sm btn-light" onClick={() => window.location.reload()}>
              Atualizar agora
            </button>
          </div>
        )}
        <main className="app-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            © {new Date().getFullYear()} {settings.organizacao || settings.nome_sistema}
          </span>
          {contato.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </footer>
      </div>
    </div>
  );
}
