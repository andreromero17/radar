// =============================================================================
// Configurações do sistema (identidade visual, organização, manutenção).
// Padrões e validação compartilhados: o modal valida antes de enviar e a API
// valida de novo ao receber.
// =============================================================================
import { z } from 'zod';

const HEX = /^#[0-9a-f]{6}$/i;
const EMAIL = /^\S+@\S+\.\S+$/;
const LOGO = /^data:image\/(png|jpe?g|svg\+xml|webp);base64,/;
/** ~300 KB de imagem viram ~400 KB em base64 */
export const MAX_LOGO_CHARS = 400 * 1024;
export const MAX_LOGO_BYTES = 300 * 1024;

export const MENU_STYLES = ['colorido', 'claro'] as const;
export type MenuStyle = (typeof MENU_STYLES)[number];

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
});

/** Atualização parcial: só os campos enviados são validados/gravados */
export const settingsUpdateSchema = settingsSchema.partial();

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  nome_sistema: 'Meu Sistema',
  icone: 'box-seam',
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
};

/** Campos visíveis sem login (identidade visual da tela de entrada) */
export const PUBLIC_SETTINGS_KEYS = [
  'nome_sistema',
  'icone',
  'logo',
  'cor_primaria',
  'cor_secundaria',
  'estilo_menu',
] as const;
export type PublicSettings = Pick<Settings, (typeof PUBLIC_SETTINGS_KEYS)[number]>;
