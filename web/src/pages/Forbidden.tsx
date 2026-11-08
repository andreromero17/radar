import { Link } from 'react-router-dom';

export default function Forbidden() {
  return (
    <div className="text-center py-5">
      <i className="bi bi-shield-lock fs-1 text-warning" />
      <h4 className="mt-3 fw-bold">Sem permissão</h4>
      <p className="text-muted">Seu perfil de acesso não permite abrir esta página.</p>
      <Link to="/" className="btn btn-primary mt-2">
        Voltar ao início
      </Link>
    </div>
  );
}
