import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { appInfo, type VersionInfo } from '@frame/shared';
import { SERVER_ROOT } from './config';

/**
 * Versão: a do sistema (shared/src/app/info.ts) ou, sem ela, a do frame
 * (package.json da raiz) + commit do git.
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
  return { version: appInfo.versao ?? version, commit, frame: version };
}

export const VERSION: VersionInfo = readVersion();
