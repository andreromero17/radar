import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { applyTheme } from '../lib/theme';

const SettingsContext = createContext(null);
const CACHE_KEY = 'app-settings';

// Espelho dos padrões do servidor, usado até a primeira resposta da API
const DEFAULTS = {
  nome_sistema: 'Meu Sistema', icone: 'box-seam', logo: '', cor_primaria: '#4f6ef7', cor_secundaria: '#7b4fd6',
  organizacao: '', telefone: '', email: '', endereco: '', dias_logs: 90,
};

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
};
const writeCache = (s) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
};

/**
 * Carrega /api/settings e aplica o tema. Usa um cache local para o app já abrir
 * com as cores e o nome certos, sem "piscar" o tema padrão.
 */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    const cached = readCache();
    applyTheme(cached);
    return cached;
  });

  useEffect(() => {
    api.get('/settings').then((s) => {
      setSettings(s);
      applyTheme(s);
      writeCache(s);
    }).catch(() => {});
  }, []);

  const commit = useCallback((s) => {
    setSettings(s);
    applyTheme(s);
    writeCache(s);
    return s;
  }, []);

  const save = useCallback((data) => api.put('/settings', data).then(commit), [commit]);
  const reset = useCallback(() => api.del('/settings').then(commit), [commit]);

  return (
    <SettingsContext.Provider value={{ settings: { ...DEFAULTS, ...settings }, save, reset, preview: applyTheme }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
