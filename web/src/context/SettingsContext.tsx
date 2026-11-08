import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '@frame/shared';
import { api } from '../lib/api';
import { applyTheme } from '../lib/theme';

interface SettingsApi {
  settings: Settings;
  save(data: Partial<Settings>): Promise<Settings>;
  reset(): Promise<Settings>;
  /** Aplica um tema temporário (pré-visualização) sem salvar */
  preview(s: Partial<Settings>): void;
}

const SettingsContext = createContext<SettingsApi | null>(null);
const CACHE_KEY = 'app-settings';

const readCache = (): Partial<Settings> | null => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
  } catch {
    return null;
  }
};
const writeCache = (s: Settings) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    /* armazenamento indisponível: segue sem cache */
  }
};

/**
 * Carrega /api/settings e aplica o tema. Usa um cache local para o app já abrir
 * com as cores e o nome certos, sem "piscar" o tema padrão.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const merged = { ...DEFAULT_SETTINGS, ...readCache() };
    applyTheme(merged);
    return merged;
  });

  const commit = useCallback((s: Settings) => {
    setSettings(s);
    applyTheme(s);
    writeCache(s);
    return s;
  }, []);

  useEffect(() => {
    api
      .get<Settings>('/settings')
      .then(commit)
      .catch(() => {});
  }, [commit]);

  const value = useMemo<SettingsApi>(
    () => ({
      settings,
      save: (data) => api.put<Settings>('/settings', data).then(commit),
      reset: () => api.del<Settings>('/settings').then(commit),
      preview: applyTheme,
    }),
    [settings, commit],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings precisa estar dentro de <SettingsProvider>');
  return ctx;
}
