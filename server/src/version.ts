import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { VersionInfo } from '@frame/shared';
import { SERVER_ROOT } from './config';

/**
 * Versão do sistema: número do package.json da raiz + commit do git.
 * Em produção sem git (ex.: Docker), informe o commit em APP_COMMIT.
 */
function readVersion(): VersionInfo {
  let version = '0.0.0';
  try {
    version = JSON.parse(fs.readFileSync(path.resolve(SERVER_ROOT, '../package.json'), 'utf8')).version;
  } catch {
    /* sem package.json da raiz */
  }
  let commit = process.env.APP_COMMIT ?? '';
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short HEAD', { cwd: SERVER_ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      commit = 'dev';
    }
  }
  return { version, commit };
}

export const VERSION: VersionInfo = readVersion();
