// =============================================================================
// Anexos: arquivos ligados a um registro (entidade + id). Metadados na tabela
// `anexos`; o conteúdo em disco, em UPLOAD_DIR/<entidade>/<nome aleatório>.
// O nome original nunca vira caminho no disco (evita path traversal).
// =============================================================================
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Anexo, EntityDef } from '@frame/shared';
import type { Db } from '../db/knex';
import { HttpError } from '../utils/http';
import { nowLocal } from '../utils/time';
import { addLog } from './logs';
import type { OpCtx } from './records';

let storeDir = path.resolve('data/anexos');
let maxBytes = 10 * 1024 * 1024;

/** Chamado pelo createApp com a pasta e o limite do .env */
export function configureAnexos(opts: { dir: string; maxMb: number }) {
  storeDir = opts.dir;
  maxBytes = opts.maxMb * 1024 * 1024;
}
export const anexoMaxBytes = () => maxBytes;
export const anexoDir = () => storeDir;

/** Tipo pelo nome do arquivo (não confia no que o navegador manda) */
const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  csv: 'text/csv',
  xml: 'application/xml',
  ofx: 'application/x-ofx',
  json: 'application/json',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
};
export const mimeOf = (nome: string) => MIME[path.extname(nome).slice(1).toLowerCase()] ?? 'application/octet-stream';

/** Tipos que o navegador pode abrir direto (o resto sempre baixa) */
export const INLINE_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
]);

/** Nome seguro para exibir/baixar: sem pastas, sem caracteres de controle */
export function cleanName(nome: string) {
  const base = path.basename(nome.replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  const limpo = base.replace(/[\u0000-\u001f\u007f"<>|]/g, '').trim();
  return (limpo || 'arquivo').slice(0, 200);
}

const fileOf = (entidade: string, arquivo: string) => path.join(storeDir, entidade, arquivo);

export async function listAnexos(db: Db, entidade: string, registroId: number): Promise<Anexo[]> {
  return db('anexos as a')
    .leftJoin('usuarios as u', 'u.id', 'a.usuario_id')
    .where({ 'a.entidade': entidade, 'a.registro_id': registroId })
    .orderBy('a.id', 'desc')
    .select('a.id', 'a.nome', 'a.tipo', 'a.tamanho', 'a.criado_em', 'u.nome as usuario_nome');
}

export async function saveAnexo(
  c: OpCtx,
  entidade: string,
  ent: EntityDef,
  registroId: number,
  nome: string,
  conteudo: Buffer,
) {
  if (!ent.anexos) throw new HttpError(400, 'Esta entidade não aceita anexos');
  if (!conteudo.length) throw new HttpError(422, 'Arquivo vazio');
  if (conteudo.length > maxBytes) throw new HttpError(413, `Arquivo maior que ${maxBytes / 1024 / 1024} MB`);
  const limpo = cleanName(nome);
  const arquivo = crypto.randomUUID();
  fs.mkdirSync(path.join(storeDir, entidade), { recursive: true });
  fs.writeFileSync(fileOf(entidade, arquivo), conteudo);
  try {
    const [row] = await c
      .db('anexos')
      .insert({
        entidade,
        registro_id: registroId,
        nome: limpo,
        tipo: mimeOf(limpo),
        tamanho: conteudo.length,
        arquivo,
        usuario_id: c.user.id,
        criado_em: nowLocal(),
      })
      .returning('id');
    await addLog(
      c.db,
      { entidade, registro_id: registroId, acao: 'anexo incluído', detalhe: limpo },
      { id: c.user.id, nome: c.user.nome, ip: c.ip },
    );
    const id = typeof row === 'object' ? row.id : row;
    return (await listAnexos(c.db, entidade, registroId)).find((a) => a.id === id)!;
  } catch (err) {
    fs.rmSync(fileOf(entidade, arquivo), { force: true });
    throw err;
  }
}

async function findAnexo(db: Db, entidade: string, registroId: number, id: number) {
  const a = await db('anexos').where({ id, entidade, registro_id: registroId }).first();
  if (!a) throw new HttpError(404, 'Anexo não encontrado');
  return a as { id: number; nome: string; tipo: string; arquivo: string; tamanho: number };
}

/** Caminho do arquivo para download (404 se o arquivo sumiu do disco) */
export async function anexoFile(db: Db, entidade: string, registroId: number, id: number) {
  const a = await findAnexo(db, entidade, registroId, id);
  const file = fileOf(entidade, a.arquivo);
  if (!fs.existsSync(file)) throw new HttpError(404, 'Arquivo não encontrado no servidor');
  return { ...a, file };
}

export async function removeAnexo(c: OpCtx, entidade: string, registroId: number, id: number) {
  const a = await findAnexo(c.db, entidade, registroId, id);
  await c.db('anexos').where({ id }).del();
  fs.rmSync(fileOf(entidade, a.arquivo), { force: true });
  await addLog(
    c.db,
    { entidade, registro_id: registroId, acao: 'anexo excluído', detalhe: a.nome },
    { id: c.user.id, nome: c.user.nome, ip: c.ip },
  );
}

/** Apaga os anexos de registros excluídos de vez */
export async function deleteAnexosOf(db: Db, entidade: string, ids: number[]) {
  const rows = await db('anexos').where({ entidade }).whereIn('registro_id', ids).select('arquivo');
  await db('anexos').where({ entidade }).whereIn('registro_id', ids).del();
  for (const r of rows) fs.rmSync(fileOf(entidade, r.arquivo), { force: true });
}
