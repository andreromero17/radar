import { Route, Routes } from 'react-router-dom';
import Layout from './layout/Layout';
import { Guard, PublicOnly, RequireAuth } from './components/RouteGuards';
import Dashboard from './pages/Dashboard';
import { EntityForm, EntityList } from './pages/EntityRoutes';
import { customPages } from './lib/screens';
import Logs from './pages/Logs';
import Backup from './pages/Backup';
import MeuPerfil from './pages/MeuPerfil';
import NotFound from './pages/NotFound';
import Relatorio, { Relatorios } from './pages/Relatorio';
import Notificacoes from './pages/Notificacoes';
import Login from './pages/auth/Login';
import EsqueciSenha from './pages/auth/EsqueciSenha';
import RedefinirSenha from './pages/auth/RedefinirSenha';
import TrocarSenha from './pages/auth/TrocarSenha';
import AceitarConvite from './pages/auth/AceitarConvite';
import ConfigurarDoisFatores from './pages/auth/ConfigurarDoisFatores';
import Plataforma from './pages/Plataforma';
import Membros from './pages/Membros';

export default function App() {
  return (
    <Routes>
      {/* só para quem não está logado */}
      <Route element={<PublicOnly />}>
        <Route path="login" element={<Login />} />
        <Route path="esqueci-senha" element={<EsqueciSenha />} />
      </Route>
      {/* link do e-mail: funciona logado ou não */}
      <Route path="redefinir-senha" element={<RedefinirSenha />} />
      <Route path="convite/:token" element={<AceitarConvite />} />

      <Route element={<RequireAuth passwordChangePage />}>
        <Route path="trocar-senha" element={<TrocarSenha />} />
      </Route>
      <Route element={<RequireAuth configurar2faPage />}>
        <Route path="configurar-2fa" element={<ConfigurarDoisFatores />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="perfil" element={<MeuPerfil />} />
          <Route
            path="logs"
            element={
              <Guard resource="logs" action="ver">
                <Logs />
              </Guard>
            }
          />
          <Route
            path="backup"
            element={
              <Guard resource="backup" action="ver">
                <Backup />
              </Guard>
            }
          />
          {/* relatórios dinâmicos (conjuntos registrados no servidor; a permissão vem de cada conjunto) */}
          <Route path="notificacoes" element={<Notificacoes />} />
          <Route
            path="plataforma"
            element={
              <Guard resource="plataforma" action="ver">
                <Plataforma />
              </Guard>
            }
          />
          <Route
            path="membros"
            element={
              <Guard resource="membros" action="ver">
                <Membros />
              </Guard>
            }
          />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="relatorios/:conjunto" element={<Relatorio />} />
          {/* páginas próprias da aplicação (web/src/app/screens.tsx) */}
          {customPages().map(({ path, component: Page, perm }) => (
            <Route
              key={path}
              path={path}
              element={
                perm ? (
                  <Guard resource={perm[0]} action={perm[1]}>
                    <Page />
                  </Guard>
                ) : (
                  <Page />
                )
              }
            />
          ))}
          {/* CRUD: telas genéricas ou as registradas para a entidade (permissões checadas na página) */}
          <Route path=":entity" element={<EntityList />} />
          <Route path=":entity/novo" element={<EntityForm />} />
          <Route path=":entity/:id" element={<EntityForm />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
