import { DEFAULT_SETTINGS, settingsSchema, type Settings } from '@frame/shared';
import type { Db } from '../db/knex';
import { addLog, purgeLogs } from './logs';

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

export async function saveSettings(db: Db, data: Partial<Settings>): Promise<Settings> {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entries.length) {
    await db('configuracoes')
      .insert(entries.map(([chave, valor]) => ({ chave, valor: String(valor) })))
      .onConflict('chave')
      .merge();
    await addLog(db, { entidade: 'sistema', acao: 'configuração', detalhe: `Alterado: ${entries.map(([k]) => k).join(', ')}` });
  }
  const settings = await getSettings(db);
  await purgeLogs(db, settings.dias_logs);
  return settings;
}

export async function resetSettings(db: Db): Promise<Settings> {
  await db('configuracoes').del();
  await addLog(db, { entidade: 'sistema', acao: 'configuração', detalhe: 'Configurações restauradas para o padrão' });
  return getSettings(db);
}
