// Telas próprias do Radar. O resto usa as telas genéricas do frame.
import { registerPage, registerScreens } from '../lib/screens';
import './styles.css';
import Coletas from './pages/Coletas';
import EmpresaDetalhe from './pages/EmpresaDetalhe';
import EmpresaForm from './pages/EmpresaForm';
import Empresas from './pages/Empresas';
import Sinais from './pages/Sinais';

export function registerAppScreens() {
  registerScreens('empresas', { list: Empresas, form: EmpresaForm });
  registerScreens('coletas', { list: Coletas });
  registerScreens('sinais', { list: Sinais });
  registerPage({ path: 'empresa/:id', component: EmpresaDetalhe, perm: ['empresas', 'ver'] });
}
