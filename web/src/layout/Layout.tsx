import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileTabs from './MobileTabs';
import { menu, tabItems } from '../config/menu';
import { useIsDesktop } from '../lib/media';
import { useSettings } from '../context/SettingsContext';
import { useNewVersion } from '../lib/version';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { fmtDate } from '../lib/format';
import { recarregarNoEspaco } from '../lib/espacos';

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
  const { user } = useAuth();
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
    <div
      className={`app-shell menu-${settings.tema === 'minimalista' ? 'neutro' : settings.estilo_menu} ${
        isCollapsed ? 'sidebar-collapsed' : ''
      } ${tabItems(menu).length ? 'has-tabs' : ''}`}
    >
      <Sidebar
        collapsed={isCollapsed}
        mobileOpen={mobileOpen}
        onToggle={() => setCollapsed((c) => !c)}
        onClose={() => setMobileOpen(false)}
      />
      <div className="app-main">
        <Topbar onMenu={() => setMobileOpen(true)} />
        {user?.espaco?.suporte && (
          <div className="suporte-bar" role="status">
            <i className="bi bi-headset" />
            <span>
              Modo suporte em <b>{user.espaco.nome}</b> (
              {user.espaco.papel === 'editor' ? 'pode alterar' : 'só leitura'}) até{' '}
              {fmtDate(user.espaco.suporte.ate, true)}. Tudo fica no log do espaço.
            </span>
            <button
              className="btn btn-sm btn-light"
              onClick={() => void api.post('/plataforma/suporte/sair', {}).finally(recarregarNoEspaco)}
            >
              Sair do suporte
            </button>
          </div>
        )}
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
      <MobileTabs onMenu={() => setMobileOpen(true)} />
    </div>
  );
}
