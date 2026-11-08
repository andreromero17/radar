/// <reference types="vite/client" />

/** Versão do package.json da raiz (definida em vite.config.ts) */
declare const __APP_VERSION__: string;
/** Commit curto do git no momento do build (ou APP_COMMIT) */
declare const __APP_COMMIT__: string;
/** Módulo de demonstração ligado (DEMO=true no server/.env) */
declare const __DEMO__: boolean;
