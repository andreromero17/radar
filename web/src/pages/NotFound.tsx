import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="text-center py-5">
      <i className="bi bi-signpost-split fs-1 text-primary" />
      <h4 className="mt-3 fw-bold">Página não encontrada</h4>
      <Link to="/" className="btn btn-primary mt-2">
        Voltar ao dashboard
      </Link>
    </div>
  );
}
