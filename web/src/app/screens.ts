// Telas próprias do Radar. O resto usa as telas genéricas do frame.
import { registerScreens } from '../lib/screens';
import Empresas from './pages/Empresas';

export function registerAppScreens() {
  registerScreens('empresas', { list: Empresas });
}
