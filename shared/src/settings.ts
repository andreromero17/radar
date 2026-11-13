// =============================================================================
// Configurações do sistema (identidade visual, organização, manutenção).
// Padrões e validação compartilhados: o modal valida antes de enviar e a API
// valida de novo ao receber.
// =============================================================================
import { z } from 'zod';
import { appInfo } from './app/info';
import { appSettings } from './app/settings';
import type { AppSettingDef, AppSettings } from './types';

const HEX = /^#[0-9a-f]{6}$/i;
const EMAIL = /^\S+@\S+\.\S+$/;
const LOGO = /^data:image\/(png|jpe?g|svg\+xml|webp);base64,/;
/** ~300 KB de imagem viram ~400 KB em base64 */
export const MAX_LOGO_CHARS = 400 * 1024;
export const MAX_LOGO_BYTES = 300 * 1024;

export const MENU_STYLES = ['colorido', 'claro'] as const;
export type MenuStyle = (typeof MENU_STYLES)[number];

/**
 * Tema do sistema (o administrador escolhe): Vibrante = cores fortes, menu colorido, cards em bloco;
 * Minimalista = neutro, bordas finas, cor da marca só nos destaques. Os dois têm modo claro e escuro,
 * que cada usuário escolhe (aparência).
 */
export const TEMAS = ['vibrante', 'minimalista'] as const;
export type Tema = (typeof TEMAS)[number];

/**
 * Fonte do sistema (o administrador escolhe). 'tema' = a do tema (Vibrante: Nunito; Minimalista: Inter);
 * 'sistema' = a fonte do aparelho (não baixa nada). As demais vêm do Google Fonts.
 */
export const FONTES = [
  'tema',
  'inter',
  'nunito',
  'roboto',
  'open-sans',
  'lato',
  'source-sans',
  'sistema',
  'propria',
] as const;
/** Pesos da fonte própria que podem ser enviados (arquivos .woff2/.woff/.ttf/.otf) */
export const PESOS_FONTE = ['regular', 'negrito'] as const;
export type PesoFonte = (typeof PESOS_FONTE)[number];
/** Tamanho máximo de cada arquivo de fonte própria */
export const MAX_FONTE_BYTES = 600 * 1024;
export type Fonte = (typeof FONTES)[number];

const color = z.string().trim().regex(HEX, 'Use o formato #RRGGBB');
const dias = 'Entre 0 e 3650 dias';

export const settingsSchema = z.object({
  nome_sistema: z.string().trim().min(1, 'Informe o nome do sistema').max(40, 'Máximo de 40 caracteres'),
  icone: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Nome de ícone inválido'),
  logo: z
    .string()
    .refine((v) => v === '' || LOGO.test(v), 'Formato de imagem não suportado')
    .refine((v) => v.length <= MAX_LOGO_CHARS, 'Imagem muito grande (máx. ~300 KB)'),
  cor_primaria: color,
  cor_secundaria: color,
  organizacao: z.string().trim().max(120, 'Máximo de 120 caracteres'),
  telefone: z.string().trim().max(40, 'Máximo de 40 caracteres'),
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || EMAIL.test(v), 'E-mail inválido'),
  endereco: z.string().trim().max(200, 'Máximo de 200 caracteres'),
  dias_logs: z.coerce.number({ error: dias }).int(dias).min(0, dias).max(3650, dias),
  /** Registros na lixeira são apagados de vez após X dias (0 = nunca) */
  dias_lixeira: z.coerce.number({ error: dias }).int(dias).min(0, dias).max(3650, dias),
  /** Link da Central de Ajuda; vazio = item não aparece no menu */
  url_ajuda: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\/\S+\.\S+/.test(v), 'Use um endereço completo, começando com https://'),
  estilo_menu: z.enum(MENU_STYLES, { error: 'Estilo inválido' }),
  tema: z.enum(TEMAS, { error: 'Tema inválido' }),
  fonte: z.enum(FONTES, { error: 'Fonte inválida' }),
  /** Fonte própria (ex.: uma fonte licenciada da empresa): nome exibido e controle dos arquivos enviados */
  fonte_propria_nome: z.string().trim().max(60, 'Máximo de 60 caracteres'),
  /** Mantidos pelo servidor ao enviar/remover arquivos: pesos presentes ("regular,negrito") e versão (cache) */
  fonte_propria_arquivos: z.string().max(40),
  fonte_propria_versao: z.string().max(20),
  /** Qualquer pessoa pode criar conta (com confirmação de e-mail). Desligado: só por convite da plataforma */
  cadastro_aberto: z.boolean({ error: 'Valor inválido' }),
});

/** Atualização parcial: só os campos enviados são validados/gravados */
// arquivos e versão da fonte própria só mudam pelo envio de arquivo (rota própria)
export const settingsUpdateSchema = settingsSchema
  .omit({ fonte_propria_arquivos: true, fonte_propria_versao: true })
  .partial();

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  // o sistema derivado define nome e ícone padrão em app/info.ts
  nome_sistema: appInfo.nome ?? 'Meu Sistema',
  icone: appInfo.icone ?? 'box-seam',
  logo: '', // data URL; se preenchido, substitui o ícone
  cor_primaria: '#4f6ef7',
  cor_secundaria: '#7b4fd6',
  organizacao: '',
  telefone: '',
  email: '',
  endereco: '',
  dias_logs: 90, // 0 = nunca excluir
  dias_lixeira: 30, // 0 = nunca esvaziar
  url_ajuda: '',
  estilo_menu: 'colorido',
  tema: 'vibrante',
  fonte: 'tema',
  fonte_propria_nome: '',
  fonte_propria_arquivos: '',
  fonte_propria_versao: '',
  cadastro_aberto: false,
};

/** Campos visíveis sem login (identidade visual da tela de entrada) */
export const PUBLIC_SETTINGS_KEYS = [
  'nome_sistema',
  'icone',
  'logo',
  'cor_primaria',
  'cor_secundaria',
  'estilo_menu',
  'tema',
  'fonte',
  'fonte_propria_nome',
  'fonte_propria_arquivos',
  'fonte_propria_versao',
  'cadastro_aberto',
] as const;
export type PublicSettings = Pick<Settings, (typeof PUBLIC_SETTINGS_KEYS)[number]>;

// ---------------------------------------------------------------- configurações do sistema derivado
/** Schema das configurações próprias do sistema (app/settings.ts) */
export function appSettingsSchema(defs: AppSettingDef[] = appSettings) {
  const shape: Record<string, z.ZodType> = {};
  for (const d of defs) {
    if (d.type === 'boolean')
      shape[d.chave] = z.preprocess((v) => v === true || v === 'true' || v === '1' || v === 1, z.boolean());
    else if (d.type === 'number') {
      let n = z.coerce.number({ error: 'Informe um número' });
      if (d.min != null) n = n.min(d.min, `Mínimo ${d.min}`);
      if (d.max != null) n = n.max(d.max, `Máximo ${d.max}`);
      shape[d.chave] = n;
    } else if (d.type === 'select')
      shape[d.chave] = z.enum((d.options ?? []).map((o) => o.value) as [string, ...string[]], {
        error: 'Opção inválida',
      });
    else shape[d.chave] = z.string().trim().max(500, 'Máximo de 500 caracteres');
  }
  return z.object(shape);
}

/** Padrões das configurações do sistema */
export function defaultAppSettings(defs: AppSettingDef[] = appSettings): AppSettings {
  return Object.fromEntries(defs.map((d) => [d.chave, d.default]));
}
