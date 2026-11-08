import { useParams } from 'react-router-dom';
import { screensOf } from '../lib/screens';
import CrudList from './CrudList';
import CrudForm from './CrudForm';

/** /:entidade → tela própria registrada ou a listagem genérica */
export function EntityList() {
  const { entity } = useParams();
  const Custom = screensOf(entity).list;
  // key: troca de entidade remonta a tela (estado limpo)
  return Custom ? <Custom key={entity} /> : <CrudList key={entity} />;
}

/** /:entidade/novo e /:entidade/:id → formulário próprio ou o genérico */
export function EntityForm() {
  const { entity, id } = useParams();
  const Custom = screensOf(entity).form;
  return Custom ? <Custom key={`${entity}/${id}`} /> : <CrudForm key={`${entity}/${id ?? 'novo'}`} />;
}
