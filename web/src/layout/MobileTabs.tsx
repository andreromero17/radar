import { Link, useLocation } from 'react-router-dom';
import { activeMenuPath, menu, tabItems, visibleMenu } from '../config/menu';
import { useAuth } from '../context/AuthContext';

/** Abas fixas no rodapé (celular): itens do menu com `tab` + "Menu" (abre o lateral) */
export default function MobileTabs({ onMenu }: { onMenu: () => void }) {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const ativo = activeMenuPath(pathname);
  const itens = tabItems(visibleMenu(menu, can));
  if (!itens.length) return null;
  return (
    <nav className="mobile-tabs" aria-label="Atalhos">
      {itens.map((m) => (
        <Link key={m.to} to={m.to!} className={`mobile-tab ${m.to === ativo ? 'active' : ''}`}>
          <i className={`bi bi-${m.icon}`} />
          <span>{m.label}</span>
        </Link>
      ))}
      <button type="button" className="mobile-tab" onClick={onMenu}>
        <i className="bi bi-grid" />
        <span>Menu</span>
      </button>
    </nav>
  );
}
