import { Route, Routes } from 'react-router-dom';
import Layout from './layout/Layout';
import Dashboard from './pages/Dashboard';
import CrudList from './pages/CrudList';
import CrudForm from './pages/CrudForm';
import Logs from './pages/Logs';
import Backup from './pages/Backup';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="logs" element={<Logs />} />
        <Route path="backup" element={<Backup />} />
        {/* CRUD genérico: qualquer entidade de server/src/entities.js */}
        <Route path=":entity" element={<CrudList />} />
        <Route path=":entity/novo" element={<CrudForm />} />
        <Route path=":entity/:id" element={<CrudForm />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
