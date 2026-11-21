// Telas próprias do Radar. O resto usa as telas genéricas do frame.
import { registerPage, registerScreens } from '../lib/screens';
import './styles.css';
import Coletas from './pages/Coletas';
import EmpresaDetalhe from './pages/EmpresaDetalhe';
import PessoasSugeridas from './pages/PessoasSugeridas';
import PessoaDetalhe from './pages/PessoaDetalhe';
import PessoaForm from './pages/PessoaForm';
import EmpresaForm from './pages/EmpresaForm';
import Empresas from './pages/Empresas';
import Sinais from './pages/Sinais';

export function registerAppScreens() {
  registerScreens('empresas', { list: Empresas, form: EmpresaForm });
  registerScreens('coletas', { list: Coletas });
  registerScreens('sinais', { list: Sinais });
  registerScreens('pessoas', { form: PessoaForm });
  registerPage({ path: 'empresa/:id', component: EmpresaDetalhe, perm: ['empresas', 'ver'] });
  registerPage({ path: 'pessoa/:id', component: PessoaDetalhe, perm: ['pessoas', 'ver'] });
  registerPage({ path: 'pessoas-sugeridas', component: PessoasSugeridas, perm: ['pessoas', 'ver'] });
}
