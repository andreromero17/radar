// =============================================================================
// TOTP (RFC 6238 / RFC 4226): o código de 6 dígitos dos aplicativos autenticadores (Google Authenticator,
// Microsoft Authenticator, 1Password...). HMAC-SHA1, passo de 30 s, aceita 1 passo de tolerância de relógio.
// =============================================================================
import crypto from 'node:crypto';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PASSO_SEGUNDOS = 30;

export function base32(buf: Buffer): string {
  let bits = 0;
  let valor = 0;
  let out = '';
  for (const byte of buf) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALFABETO[(valor << (5 - bits)) & 31];
  return out;
}

export function deBase32(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let valor = 0;
  const out: number[] = [];
  for (const c of limpo) {
    valor = (valor << 5) | ALFABETO.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Segredo novo: 160 bits, em base32 (o que o aplicativo lê no QR) */
export const novoSegredo = () => base32(crypto.randomBytes(20));

export const passoAtual = (agora = Date.now()) => Math.floor(agora / 1000 / PASSO_SEGUNDOS);

export function codigoDoPasso(segredo: string, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = crypto.createHmac('sha1', deBase32(segredo)).update(contador).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const n = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, '0');
}

/**
 * Confere o código (passo atual ± 1). Devolve o passo que bateu ou null. `ultimoPasso`: passos até ele já foram
 * usados (o mesmo código não entra duas vezes).
 */
export function conferirCodigo(segredo: string, codigo: string, ultimoPasso?: number | null, agora = Date.now()) {
  const c = String(codigo).replace(/\D/g, '');
  if (c.length !== 6) return null;
  const atual = passoAtual(agora);
  for (const p of [atual - 1, atual, atual + 1]) {
    if (ultimoPasso != null && p <= ultimoPasso) continue;
    const esperado = codigoDoPasso(segredo, p);
    if (crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(c))) return p;
  }
  return null;
}

export const otpauthUri = (emissor: string, conta: string, segredo: string) =>
  `otpauth://totp/${encodeURIComponent(`${emissor}:${conta}`)}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=${PASSO_SEGUNDOS}`;
