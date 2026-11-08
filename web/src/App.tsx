import { Route, Routes } from 'react-router-dom';
import Layout from './layout/Layout';
import { Guard, PublicOnly, RequireAuth } from './components/RouteGuards';
import Dashboard from './pages/Dashboard';
import CrudList from './pages/CrudList';
import CrudForm from './pages/CrudForm';
import Logs from './pages/Logs';
import Backup from './pages/Backup';
import MeuPerfil from './pages/MeuPerfil';
import NotFound from './pages/NotFound';
import Login from './pages/auth/Login';
import EsqueciSenha from './pages/auth/EsqueciSenha';
import RedefinirSenha from './pages/auth/RedefinirSenha';
import TrocarSenha from './pages/auth/TrocarSenha';

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

      <Route element={<RequireAuth passwordChangePage />}>
        <Route path="trocar-senha" element={<TrocarSenha />} />
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
          {/* CRUD genérico: qualquer entidade de shared/src/entities.ts (permissões checadas na página) */}
          <Route path=":entity" element={<CrudList />} />
          <Route path=":entity/novo" element={<CrudForm />} />
          <Route path=":entity/:id" element={<CrudForm />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
