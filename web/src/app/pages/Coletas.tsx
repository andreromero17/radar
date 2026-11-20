import { useState } from 'react';
import CrudList from '../../pages/CrudList';
import ColetarAgora from '../components/ColetarAgora';

/** Execuções da coleta + botão "Coletar agora" */
export default function Coletas() {
  const [versao, setVersao] = useState(0);
  return <CrudList key={versao} entity="coletas" actions={<ColetarAgora onFeito={() => setVersao((v) => v + 1)} />} />;
}
