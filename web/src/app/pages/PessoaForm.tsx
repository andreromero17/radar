// Formulário de pessoa: o genérico + link para a página da pessoa (0.4.9)
import { Link, useParams } from 'react-router-dom';
import CrudForm from '../../pages/CrudForm';

export default function PessoaForm() {
  const { id } = useParams();
  return (
    <CrudForm
      entity="pessoas"
      after={
        id ? (
          <div className="mt-3">
            <Link to={`/pessoa/${id}`} className="btn btn-light border btn-sm">
              <i className="bi bi-graph-up me-1" />
              Ver página da pessoa (posts e estatísticas)
            </Link>
          </div>
        ) : null
      }
    />
  );
}
