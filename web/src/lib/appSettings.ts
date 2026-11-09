// Configurações próprias do sistema derivado (shared/src/app/settings.ts), lidas uma vez e compartilhadas.
import { useEffect, useState } from 'react';
import { appSettings, defaultAppSettings, type AppSettings } from '@frame/shared';
import { api } from './api';

let atual: AppSettings | null = null;
let pedido: Promise<AppSettings> | null = null;
const ouvintes = new Set<(s: AppSettings) => void>();

export function carregarAppSettings(): Promise<AppSettings> {
  if (!appSettings.length) return Promise.resolve(defaultAppSettings());
  pedido ??= api
    .get<AppSettings>('/settings/app')
    .then((s) => {
      definirAppSettings(s);
      return s;
    })
    .finally(() => {
      pedido = null;
    });
  return pedido;
}

/** Depois de salvar: avisa as telas abertas */
export function definirAppSettings(s: AppSettings) {
  atual = s;
  ouvintes.forEach((f) => f(s));
}

/** Configurações do sistema (null enquanto carrega) */
export function useAppSettings(): AppSettings | null {
  const [s, setS] = useState<AppSettings | null>(atual);
  useEffect(() => {
    ouvintes.add(setS);
    if (!atual) carregarAppSettings().catch(() => setS(defaultAppSettings()));
    return () => {
      ouvintes.delete(setS);
    };
  }, []);
  return s;
}
