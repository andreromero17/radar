import { Button } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import DoisFatoresCard from '../../components/DoisFatoresCard';

/** Administrador sem a verificação em duas etapas (obrigatória): configura antes de usar o sistema */
export default function ConfigurarDoisFatores() {
  const { user, logout } = useAuth();
  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100 p-3">
      <div style={{ maxWidth: '34rem', width: '100%' }}>
        <h1 className="h4 fw-bold mb-1">Proteja sua conta</h1>
        <p className="text-muted">
          {user?.nome.split(' ')[0]}, contas de administrador precisam da verificação em duas etapas. Leva um minuto.
        </p>
        <DoisFatoresCard onAtivado={() => window.location.assign('/')} />
        <Button variant="link" className="text-muted mt-2 px-0 text-decoration-none" onClick={() => void logout()}>
          Sair
        </Button>
      </div>
    </div>
  );
}
