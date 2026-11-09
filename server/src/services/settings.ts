import {
  appSettings,
  appSettingsSchema,
  defaultAppSettings,
  DEFAULT_SETTINGS,
  PUBLIC_SETTINGS_KEYS,
  settingsSchema,
  type AppSettings,
  type PublicSettings,
  type Settings,
} from '@frame/shared';
import type { Db } from '../db/knex';
import { addLog, purgeLogs, SYSTEM_ACTOR, type Actor } from './logs';

export async function getSettings(db: Db): Promise<Settings> {
  const rows = (await db('configuracoes').select('chave', 'valor')) as { chave: string; valor: string }[];
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const { chave, valor } of rows) if (chave in merged) merged[chave] = valor;
  // Valores gravados que deixaram de ser válidos voltam ao padrão
  const parsed = settingsSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  const fixed = { ...merged };
  for (const issue of parsed.error.issues) {
    const k = String(issue.path[0]) as keyof Settings;
    fixed[k] = DEFAULT_SETTINGS[k];
  }
  return settingsSchema.parse(fixed);
}

export async function saveSettings(db: Db, data: Partial<Settings>, actor: Actor = SYSTEM_ACTOR): Promise<Settings> {
  const atual = await getSettings(db);
  // só o que realmente mudou (o modal envia o formulário inteiro)
  const entries = Object.entries(data).filter(
    ([k, v]) => v !== undefined && String(v) !== String(atual[k as keyof Settings]),
  );
  if (entries.length) {
    await db('configuracoes')
      .insert(entries.map(([chave, valor]) => ({ chave, valor: String(valor) })))
      .onConflict('chave')
      .merge();
    // imagem em base64 não vai para o log, só a indicação
    const resumo = (k: string, v: unknown) => (k === 'logo' ? (v ? '(imagem)' : '(sem logo)') : v);
    await addLog(
      db,
      {
        entidade: 'sistema',
        acao: 'configuração',
        detalhe: `Alterado: ${entries.map(([k]) => k).join(', ')}`,
        alteracoes: Object.fromEntries(
          entries.map(([k, v]) => [k, { de: resumo(k, atual[k as keyof Settings]), para: resumo(k, v) }]),
        ),
      },
      actor,
    );
  }
  const settings = await getSettings(db);
  await purgeLogs(db, settings.dias_logs);
  return settings;
}

export async function resetSettings(db: Db, actor: Actor = SYSTEM_ACTOR): Promise<Settings> {
  await db('configuracoes').del();
  await addLog(
    db,
    { entidade: 'sistema', acao: 'configuração', detalhe: 'Configurações restauradas para o padrão' },
    actor,
  );
  return getSettings(db);
}

/** Só a identidade visual, para a tela de login */
export async function getPublicSettings(db: Db): Promise<PublicSettings> {
  const s = await getSettings(db);
  return Object.fromEntries(PUBLIC_SETTINGS_KEYS.map((k) => [k, s[k]])) as PublicSettings;
}

// ---------------------------------------------------------------- configurações do sistema derivado
const PREFIXO = 'app.';

/** Configurações próprias do sistema (app/settings.ts), com os padrões no que não foi gravado ou ficou inválido */
export async function getAppSettings(db: Db): Promise<AppSettings> {
  const out: AppSettings = defaultAppSettings();
  if (!appSettings.length) return out;
  const rows = (await db('configuracoes').where('chave', 'like', `${PREFIXO}%`).select('chave', 'valor')) as {
    chave: string;
    valor: string;
  }[];
  const schema = appSettingsSchema();
  for (const { chave, valor } of rows) {
    const k = chave.slice(PREFIXO.length);
    if (!(k in out)) continue;
    const campo = schema.shape[k].safeParse(valor);
    if (campo.success) out[k] = campo.data as string | number | boolean;
  }
  return out;
}

/** Uma configuração do sistema (no servidor, para as regras da aplicação) */
export async function getAppSetting<T extends string | number | boolean = string>(db: Db, chave: string): Promise<T> {
  return (await getAppSettings(db))[chave] as T;
}

export async function saveAppSettings(db: Db, data: AppSettings, actor: Actor = SYSTEM_ACTOR): Promise<AppSettings> {
  const atual = await getAppSettings(db);
  const entries = Object.entries(data).filter(([k, v]) => k in atual && String(v) !== String(atual[k]));
  if (entries.length) {
    await db('configuracoes')
      .insert(entries.map(([k, v]) => ({ chave: `${PREFIXO}${k}`, valor: String(v) })))
      .onConflict('chave')
      .merge();
    const rotulo = (k: string) => appSettings.find((d) => d.chave === k)?.label ?? k;
    await addLog(
      db,
      {
        entidade: 'sistema',
        acao: 'configuração',
        detalhe: `Alterado: ${entries.map(([k]) => rotulo(k)).join(', ')}`,
        alteracoes: Object.fromEntries(entries.map(([k, v]) => [k, { de: atual[k], para: v }])),
      },
      actor,
    );
  }
  return getAppSettings(db);
}
