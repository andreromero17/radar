// Registro das telas plugáveis do módulo de demonstração (componentes em ./pages.tsx)
import { registerPage, registerScreens } from '../lib/screens';
import { CategoriasCards, MovimentosComResumo, ResumoCategorias } from './pages';

export function registerDemoScreens() {
  registerScreens('demo_movimentos', { list: MovimentosComResumo });
  registerScreens('demo_categorias', { list: CategoriasCards });
  registerPage({ path: 'demo/resumo', component: ResumoCategorias, perm: ['demo_movimentos', 'ver'] });
}
