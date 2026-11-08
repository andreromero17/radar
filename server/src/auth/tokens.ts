import { createHash, randomBytes } from 'node:crypto';

/** Token aleatório para cookie/link. No banco guardamos só o hash. */
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
