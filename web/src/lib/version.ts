import { useEffect, useState } from 'react';
import { appInfo, type VersionInfo } from '@frame/shared';

/** Versão deste front: a do sistema (app/info.ts) ou a do frame, gravada no build (vite.config.ts) */
export const APP_VERSION: VersionInfo = {
  version: appInfo.versao ?? __APP_VERSION__,
  commit: __APP_COMMIT__,
  frame: __APP_VERSION__,
};

/** Texto do tooltip: "Finanças 0.1.0 · frame 0.5.1 · commit abc123" */
export const versionTitle = (v: VersionInfo = APP_VERSION) =>
  appInfo.versao
    ? `${appInfo.nome ?? 'Sistema'} ${v.version} · frame ${v.frame} · commit ${v.commit}`
    : `Versão ${v.version} (commit ${v.commit})`;

export const versionLabel = (v: VersionInfo = APP_VERSION) => `v${v.version} · ${v.commit}`;

const CHECK_EVERY_MS = 5 * 60_000;

/**
 * Em produção, confere periodicamente (e ao voltar para a aba) se o servidor
 * foi atualizado. Retorna a versão nova quando o navegador está desatualizado.
 */
export function useNewVersion(enabled = import.meta.env.PROD): VersionInfo | null {
  const [nova, setNova] = useState<VersionInfo | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const check = () =>
      fetch('/api/health')
        .then((r) => r.json() as Promise<VersionInfo>)
        .then((v) => {
          if (v.version && (v.version !== APP_VERSION.version || v.commit !== APP_VERSION.commit)) setNova(v);
        })
        .catch(() => {});
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onFocus = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onFocus);
    check();
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [enabled]);
  return nova;
}
