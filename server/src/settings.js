import { db, log } from './db.js';

// =============================================================================
// Configurações do sistema (identidade visual, organização, manutenção).
// Ficam numa tabela chave/valor; estes são os valores padrão de um sistema novo.
// =============================================================================
export const DEFAULT_SETTINGS = {
  nome_sistema: 'Meu Sistema',
  icone: 'box-seam',
  logo: '', // data URL (png/jpg/svg/webp) — se preenchido, substitui o ícone
  cor_primaria: '#4f6ef7',
  cor_secundaria: '#7b4fd6',
  organizacao: '',
  telefone: '',
  email: '',
  endereco: '',
  dias_logs: 90, // 0 = nunca excluir
};

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_LOGO = 400 * 1024; // ~300 KB de imagem em base64

export function migrateSettings() {
  db.exec('CREATE TABLE IF NOT EXISTS configuracoes (chave TEXT PRIMARY KEY, valor TEXT)');
}

export function getSettings() {
  const rows = db.prepare('SELECT chave, valor FROM configuracoes').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const { chave, valor } of rows) {
    if (chave in s) s[chave] = typeof DEFAULT_SETTINGS[chave] === 'number' ? Number(valor) : valor;
  }
  return s;
}

export function validateSettings(body) {
  const data = {};
  const errors = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (body[key] === undefined) continue;
    let v = body[key] ?? '';
    if (typeof v === 'string') v = v.trim();
    data[key] = v;
  }
  if ('nome_sistema' in data && !data.nome_sistema) errors.nome_sistema = 'Informe o nome do sistema';
  if ('nome_sistema' in data && data.nome_sistema.length > 40) errors.nome_sistema = 'Máximo de 40 caracteres';
  if ('icone' in data && !/^[a-z0-9-]+$/.test(data.icone)) errors.icone = 'Nome de ícone inválido';
  for (const k of ['cor_primaria', 'cor_secundaria'])
    if (k in data && !HEX.test(data[k])) errors[k] = 'Use o formato #RRGGBB';
  if ('email' in data && data.email && !/^\S+@\S+\.\S+$/.test(data.email)) errors.email = 'E-mail inválido';
  if ('logo' in data && data.logo) {
    if (!/^data:image\/(png|jpe?g|svg\+xml|webp);base64,/.test(data.logo)) errors.logo = 'Formato de imagem não suportado';
    else if (data.logo.length > MAX_LOGO) errors.logo = 'Imagem muito grande (máx. ~300 KB)';
  }
  if ('dias_logs' in data) {
    const n = Number(data.dias_logs);
    if (!Number.isInteger(n) || n < 0 || n > 3650) errors.dias_logs = 'Entre 0 e 3650 dias';
    else data.dias_logs = n;
  }
  return { data, errors };
}

export function saveSettings(data) {
  const up = db.prepare(
    'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
  );
  db.transaction(() => {
    for (const [k, v] of Object.entries(data)) up.run(k, String(v));
  })();
  log('sistema', null, 'configuração', `Alterado: ${Object.keys(data).join(', ')}`);
  purgeLogs();
}

export function resetSettings() {
  db.prepare('DELETE FROM configuracoes').run();
  log('sistema', null, 'configuração', 'Configurações restauradas para o padrão');
}

/** Remove logs mais antigos que `dias_logs` (0 = mantém tudo). */
export function purgeLogs() {
  const { dias_logs } = getSettings();
  if (!dias_logs) return 0;
  const info = db
    .prepare("DELETE FROM logs WHERE criado_em < datetime('now','localtime', ?)")
    .run(`-${dias_logs} days`);
  if (info.changes) console.log(`🧹 ${info.changes} log(s) antigo(s) removido(s)`);
  return info.changes;
}
