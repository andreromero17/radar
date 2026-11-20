// Telas próprias do Radar. O resto usa as telas genéricas do frame.
import { registerPage, registerScreens } from '../lib/screens';
import './styles.css';
import Coletas from './pages/Coletas';
import EmpresaDetalhe from './pages/EmpresaDetalhe';
import Empresas from './pages/Empresas';

export function registerAppScreens() {
  registerScreens('empresas', { list: Empresas });
  registerScreens('coletas', { list: Coletas });
  registerPage({ path: 'empresa/:id', component: EmpresaDetalhe, perm: ['empresas', 'ver'] });
}
