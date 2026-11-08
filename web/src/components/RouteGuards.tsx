import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from 'react-bootstrap';
import type { Action } from '@frame/shared';
import { useAuth } from '../context/AuthContext';
import Forbidden from '../pages/Forbidden';

const FullPageSpinner = () => (
  <div className="vh-100 d-grid place-center">
    <Spinner animation="border" variant="primary" />
  </div>
);

/** Exige login. Se a troca de senha for obrigatória, só libera a tela de troca. */
export function RequireAuth({ passwordChangePage = false }: { passwordChangePage?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) {
    const next = location.pathname + location.search;
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (user.trocar_senha && !passwordChangePage) return <Navigate to="/trocar-senha" replace />;
  return <Outlet />;
}

/** Telas de quem NÃO está logado (login, esqueci a senha) */
export function PublicOnly() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (user) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }
  return <Outlet />;
}

/** Mostra o conteúdo só com a permissão; senão, a página "sem permissão" */
export function Guard({ resource, action, children }: { resource: string; action: Action; children: ReactNode }) {
  const { can } = useAuth();
  return can(resource, action) ? <>{children}</> : <Forbidden />;
}
