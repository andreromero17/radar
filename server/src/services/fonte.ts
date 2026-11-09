// =============================================================================
// Fonte própria do sistema (ex.: uma fonte licenciada da empresa, como a ABC Oracle):
// o administrador envia o arquivo (regular e, opcionalmente, negrito), que fica na
// tabela de configurações e é servido em /api/settings/fonte/:peso (rota pública,
// porque a tela de login também usa a fonte).
// =============================================================================
import { MAX_FONTE_BYTES, PESOS_FONTE, type PesoFonte } from '@frame/shared';
import type { Db } from '../db/knex';
import { HttpError } from '../utils/http';
import { addLog, type Actor } from './logs';
import { getSettings, saveSettings } from './settings';

const chave = (peso: PesoFonte) => `fonte_arquivo_${peso}`;

/** Tipo pelo conteúdo (nunca pelo navegador): woff2, woff, otf ou ttf */
export function tipoFonte(buf: Buffer): { mime: string; ext: string } | null {
  const sig = buf.subarray(0, 4).toString('latin1');
  if (sig === 'wOF2') return { mime: 'font/woff2', ext: 'woff2' };
  if (sig === 'wOFF') return { mime: 'font/woff', ext: 'woff' };
  if (sig === 'OTTO') return { mime: 'font/otf', ext: 'otf' };
  if (buf.readUInt32BE(0) === 0x00010000 || sig === 'true') return { mime: 'font/ttf', ext: 'ttf' };
  return null;
}

export const pesoValido = (p: unknown): p is PesoFonte => PESOS_FONTE.includes(p as PesoFonte);

async function atualizarControle(db: Db, actor: Actor) {
  const rows = await db('configuracoes').whereIn('chave', PESOS_FONTE.map(chave)).select('chave');
  const arquivos = PESOS_FONTE.filter((p) => rows.some((r) => r.chave === chave(p))).join(',');
  await db('configuracoes')
    .insert([
      { chave: 'fonte_propria_arquivos', valor: arquivos },
      { chave: 'fonte_propria_versao', valor: String(Date.now()) },
    ])
    .onConflict('chave')
    .merge();
  // sem arquivo regular, a fonte própria não funciona: volta para a do tema
  const s = await getSettings(db);
  if (!arquivos.includes('regular') && s.fonte === 'propria') await saveSettings(db, { fonte: 'tema' }, actor);
}

export async function salvarFonte(db: Db, peso: PesoFonte, buf: Buffer, nome: string, actor: Actor) {
  if (buf.length > MAX_FONTE_BYTES) throw new HttpError(422, 'Arquivo de fonte muito grande (máx. 600 KB)');
  const tipo = tipoFonte(buf);
  if (!tipo) throw new HttpError(422, 'Arquivo de fonte inválido (use .woff2, .woff, .otf ou .ttf)');
  await db('configuracoes')
    .insert({ chave: chave(peso), valor: `data:${tipo.mime};base64,${buf.toString('base64')}` })
    .onConflict('chave')
    .merge();
  await atualizarControle(db, actor);
  await addLog(
    db,
    { entidade: 'sistema', acao: 'configuração', detalhe: `Fonte própria (${peso}) enviada: ${nome || tipo.ext}` },
    actor,
  );
}

export async function removerFonte(db: Db, peso: PesoFonte, actor: Actor) {
  await db('configuracoes')
    .where({ chave: chave(peso) })
    .del();
  await atualizarControle(db, actor);
  await addLog(db, { entidade: 'sistema', acao: 'configuração', detalhe: `Fonte própria (${peso}) removida` }, actor);
}

export async function lerFonte(db: Db, peso: PesoFonte): Promise<{ mime: string; buf: Buffer } | null> {
  const row = await db('configuracoes')
    .where({ chave: chave(peso) })
    .first('valor');
  const m = row && /^data:([^;]+);base64,(.*)$/s.exec(String(row.valor));
  return m ? { mime: m[1], buf: Buffer.from(m[2], 'base64') } : null;
}
