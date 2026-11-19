import { useState } from 'react';
import CrudList from '../../pages/CrudList';
import SincronizarPipedrive from '../components/SincronizarPipedrive';

/** Listagem genérica de empresas + botão de sincronizar com o Pipedrive */
export default function Empresas() {
  const [versao, setVersao] = useState(0);
  return (
    <CrudList
      key={versao}
      entity="empresas"
      actions={<SincronizarPipedrive onFeito={() => setVersao((v) => v + 1)} />}
    />
  );
}
