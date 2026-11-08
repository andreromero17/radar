import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles.css';
import { registerEntities } from '@frame/shared';
import { demoEntities } from '@frame/shared/demo';
import App from './App';
import { registerAppScreens } from './app/screens';
import { registerDemoScreens } from './demo/screens';
import { ToastProvider } from './context/ToastContext';
import { SettingsProvider } from './context/SettingsContext';
import { AuthProvider } from './context/AuthContext';

// Módulo de demonstração (DEMO=true no server/.env); some do build quando desligado
if (__DEMO__) {
  registerEntities(demoEntities);
  registerDemoScreens();
}
registerAppScreens();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SettingsProvider>
            <App />
          </SettingsProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
