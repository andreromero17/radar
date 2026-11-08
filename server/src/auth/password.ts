// =============================================================================
// Hash de senha com scrypt (nativo do Node: sem dependência compilada).
// Formato gravado: scrypt$N$r$p$salt$hash (base64). Os parâmetros ficam no
// próprio hash, então dá para aumentar o custo no futuro sem invalidar senhas.
// =============================================================================
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const KEYLEN = 64;
/** Custo: 2^16 em produção/dev (~64 MB, ~100 ms); menor nos testes para rodarem rápido */
const COST = process.env.NODE_ENV === 'test' ? 2 ** 12 : 2 ** 16;
const R = 8;
const P = 1;

function derive(senha: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  const opts: ScryptOptions = { N, r, p, maxmem: 256 * N * r };
  return new Promise((resolve, reject) =>
    scrypt(senha.normalize('NFKC'), salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(senha, salt, COST, R, P);
  return ['scrypt', COST, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(senha: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    // Gasta o mesmo tempo mesmo sem usuário/senha, para não revelar quais e-mails existem
    await derive(senha, randomBytes(16), COST, R, P);
    return false;
  }
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(senha, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Senha aleatória legível (sem caracteres ambíguos), sempre com letras e números */
export function randomPassword(length = 12): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const bytes = randomBytes(length);
  const chars = Array.from(bytes, (b) => all[b % all.length]);
  chars[0] = letters[bytes[0] % letters.length];
  chars[1] = digits[bytes[1] % digits.length];
  return chars.join('');
}
