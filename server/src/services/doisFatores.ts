// =============================================================================
// Verificação em duas etapas (Fase 5C). Segredo TOTP por usuário (plataforma), configurado pelo próprio usuário
// (QR + primeiro código), 8 códigos de recuperação de uso único (só o hash fica guardado). Obrigatória para
// administradores quando `exigirParaAdmin` (produção): até configurar, a API responde 403 CONFIGURAR_2FA.
// =============================================================================
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { hashToken } from '../auth/tokens';
import { conferirCodigo, novoSegredo, otpauthUri } from '../auth/totp';
import { toDbValue, type Db } from '../db/knex';
import { badRequest, HttpError } from '../utils/http';

let exigirAdmin = false;
/** No boot (config ADMIN_2FA_OBRIGATORIO) e nos testes */
export const configurarDoisFatores = (opts: { exigirParaAdmin: boolean }) => {
  exigirAdmin = opts.exigirParaAdmin;
};
export const doisFatoresObrigatorio = (admin: boolean) => admin && exigirAdmin;

const QTD_RECUPERACAO = 8;
/** Código de recuperação: 10 caracteres legíveis, mostrados como XXXXX-XXXXX */
const novoCodigoRecuperacao = () => {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  const s = [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
  return `${s.slice(0, 5)}-${s.slice(5)}`;
};
const normalizarRecuperacao = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

async function linha(db: Db, usuarioId: number) {
  const u = await db('usuarios')
    .where({ id: usuarioId })
    .first(
      'id',
      'email',
      'dois_fatores',
      'segredo_2fa',
      'segredo_2fa_pendente',
      'segredo_2fa_recuperacao',
      'segredo_2fa_passo',
    );
  if (!u) throw new HttpError(404, 'Usuário não encontrado');
  return u as {
    id: number;
    email: string;
    dois_fatores: unknown;
    segredo_2fa: string | null;
    segredo_2fa_pendente: string | null;
    segredo_2fa_recuperacao: string | null;
    segredo_2fa_passo: number | null;
  };
}

/** Passo 1: segredo novo (pendente) + QR para o aplicativo */
export async function iniciarDoisFatores(db: Db, usuarioId: number, emissor: string) {
  const u = await linha(db, usuarioId);
  const segredo = novoSegredo();
  await db('usuarios').where({ id: usuarioId }).update({ segredo_2fa_pendente: segredo });
  const uri = otpauthUri(emissor || 'Sistema', u.email, segredo);
  const qr = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { segredo, uri, qr };
}

async function novosCodigos(db: Db, usuarioId: number) {
  const codigos = Array.from({ length: QTD_RECUPERACAO }, novoCodigoRecuperacao);
  await db('usuarios')
    .where({ id: usuarioId })
    .update({ segredo_2fa_recuperacao: JSON.stringify(codigos.map((c) => hashToken(normalizarRecuperacao(c)))) });
  return codigos;
}

/** Passo 2: confere o primeiro código do aplicativo e liga; devolve os códigos de recuperação (mostrados uma vez) */
export async function ativarDoisFatores(db: Db, usuarioId: number, codigo: string) {
  const u = await linha(db, usuarioId);
  if (!u.segredo_2fa_pendente) throw badRequest('Comece a configuração de novo', { codigo: 'Configuração expirada' });
  const passo = conferirCodigo(u.segredo_2fa_pendente, codigo);
  if (passo == null)
    throw badRequest('Código incorreto', { codigo: 'Código incorreto. Confira o horário do celular.' });
  await db('usuarios')
    .where({ id: usuarioId })
    .update({
      dois_fatores: toDbValue(db, true),
      segredo_2fa: u.segredo_2fa_pendente,
      segredo_2fa_pendente: null,
      segredo_2fa_passo: passo,
    });
  return novosCodigos(db, usuarioId);
}

export async function desativarDoisFatores(db: Db, usuarioId: number) {
  await db('usuarios')
    .where({ id: usuarioId })
    .update({
      dois_fatores: toDbValue(db, false),
      segredo_2fa: null,
      segredo_2fa_pendente: null,
      segredo_2fa_recuperacao: null,
      segredo_2fa_passo: null,
    });
}

export async function regerarCodigos(db: Db, usuarioId: number) {
  const u = await linha(db, usuarioId);
  if (!u.dois_fatores) throw badRequest('A verificação em duas etapas não está ligada');
  return novosCodigos(db, usuarioId);
}

export async function codigosRestantes(db: Db, usuarioId: number) {
  const u = await linha(db, usuarioId);
  return u.segredo_2fa_recuperacao ? (JSON.parse(u.segredo_2fa_recuperacao) as string[]).length : 0;
}

/**
 * Confere o código do aplicativo OU um código de recuperação (que é gasto). true = ok.
 * Atualiza o último passo usado (o mesmo código não serve duas vezes).
 */
export async function conferirSegundoFator(
  db: Db,
  usuarioId: number,
  codigo: string,
): Promise<'app' | 'recuperacao' | null> {
  const u = await linha(db, usuarioId);
  if (!u.dois_fatores || !u.segredo_2fa) return null;
  const digitos = codigo.replace(/\D/g, '');
  if (digitos.length === 6 && digitos === codigo.replace(/\s/g, '')) {
    const passo = conferirCodigo(u.segredo_2fa, digitos, u.segredo_2fa_passo);
    if (passo == null) return null;
    // só grava se ninguém usou um passo igual ou maior no meio tempo
    const n = await db('usuarios')
      .where({ id: usuarioId })
      .where((q) => q.whereNull('segredo_2fa_passo').orWhere('segredo_2fa_passo', '<', passo))
      .update({ segredo_2fa_passo: passo });
    return n ? 'app' : null;
  }
  const lista = u.segredo_2fa_recuperacao ? (JSON.parse(u.segredo_2fa_recuperacao) as string[]) : [];
  const h = hashToken(normalizarRecuperacao(codigo));
  if (!lista.includes(h)) return null;
  await db('usuarios')
    .where({ id: usuarioId })
    .update({ segredo_2fa_recuperacao: JSON.stringify(lista.filter((x) => x !== h)) });
  return 'recuperacao';
}
