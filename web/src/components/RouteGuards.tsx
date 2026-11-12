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
  if (!passwordChangePage && user.espacos && user.espacos.length === 0) return <SemEspaco />;
  return <Outlet />;
}

/** Logado, mas sem nenhum espaço ativo (removido ou inativado de todos) */
function SemEspaco() {
  const { user, logout } = useAuth();
  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100 p-3">
      <div className="card card-app p-4 text-center" style={{ maxWidth: '28rem' }}>
        <i className="bi bi-house-lock fs-1 text-muted mb-2" />
        <h1 className="h5">Nenhum espaço disponível</h1>
        <p className="text-muted">
          {user?.nome.split(' ')[0]}, sua conta está ativa, mas você não participa de nenhum espaço no momento. Se
          alguém compartilhou um espaço com você, peça para conferir o seu acesso.
        </p>
        <button type="button" className="btn btn-light border" onClick={() => void logout()}>
          Sair
        </button>
      </div>
    </div>
  );
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
