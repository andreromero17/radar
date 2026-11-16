// =============================================================================
// Importação de CSV/Excel para qualquer entidade. Em dois passos:
//   1. prévia: lê o arquivo, sugere o mapeamento coluna → campo e valida cada linha
//   2. importação: grava as linhas válidas (mesmas regras do cadastro manual)
// Converte o formato brasileiro: 1.234,56 · 31/12/2026 · Sim/Não · nomes das relações.
// =============================================================================
import ExcelJS from 'exceljs';
import {
  editableFields,
  getEntity,
  validateEntity,
  type EntityDef,
  type FieldDef,
  type ImportPreview,
  type ImportResult,
} from '@frame/shared';
import type { Db } from '../db/knex';
import { HttpError } from '../utils/http';
import { addLog } from './logs';
import { checkRelations, createRecord, TRASH_COLUMN, type OpCtx } from './records';

export const MAX_IMPORT_ROWS = 5000;
const NOT_IMPORTABLE = new Set(['password', 'permissions', 'image']);

/** Campos que recebem dados do arquivo */
export const importFields = (ent: EntityDef) => editableFields(ent).filter((f) => !NOT_IMPORTABLE.has(f.type));

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------- leitura

interface Sheet {
  colunas: string[];
  linhas: string[][];
}

/** CSV com aspas, separador detectado (; , ou tab) */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', ',', '\t'].reduce((best, c) => (first.split(c).length > first.split(best).length ? c : best), ';');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** UTF-8 (com ou sem BOM); se não for UTF-8 válido, Windows-1252 (CSV salvo pelo Excel antigo) */
function decode(buf: Buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

function cellString(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  // datas do Excel chegam em UTC
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'object') {
    if ('result' in v) return cellString(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    return '';
  }
  return String(v);
}

async function readXlsx(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new HttpError(422, 'Não foi possível ler a planilha. Salve como .xlsx ou .csv e tente de novo.');
  }
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const out: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) out.push(cellString(row.getCell(c).value));
    rows.push(out);
  });
  return rows;
}

export async function readSheet(buf: Buffer, nome: string): Promise<Sheet> {
  if (!buf.length) throw new HttpError(422, 'Arquivo vazio');
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // .xlsx é um zip
  if (/\.xls$/i.test(nome)) throw new HttpError(422, 'Formato .xls antigo não suportado: salve como .xlsx ou .csv');
  const all = isZip ? await readXlsx(buf) : parseCsv(decode(buf));
  const [cabecalho = [], ...resto] = all;
  const colunas = cabecalho.map((c, i) => c.trim() || `Coluna ${i + 1}`);
  if (!colunas.length)
    throw new HttpError(422, 'O arquivo não tem cabeçalho (primeira linha com os nomes das colunas)');
  const linhas = resto.filter((r) => r.some((c) => c.trim() !== ''));
  if (linhas.length > MAX_IMPORT_ROWS)
    throw new HttpError(422, `No máximo ${MAX_IMPORT_ROWS} linhas por importação (o arquivo tem ${linhas.length})`);
  return { colunas, linhas };
}

// ---------------------------------------------------------------- conversão

/** Sugere coluna → campo pelo nome ou rótulo (sem acento, maiúscula, espaço...) */
export function suggestMap(colunas: string[], fields: FieldDef[]) {
  const mapa: Record<string, string> = {};
  const usados = new Set<string>();
  for (const c of colunas) {
    const n = norm(c);
    const f = fields.find((x) => !usados.has(x.name) && (norm(x.label) === n || norm(x.name) === n));
    mapa[c] = f?.name ?? '';
    if (f) usados.add(f.name);
  }
  return mapa;
}

type Lookup = Map<string, Map<string, number>>;
/** Nome repetido em mais de um registro: não dá para saber qual é */
const AMBIGUO = -1;

/**
 * Nome → id dos registros das relações (para aceitar "Mercado" em vez do id). Também aceita os campos de
 * `chavesImportacao` da entidade apontada (ex.: código), que têm prioridade sobre o nome. Nome repetido em mais
 * de um registro fica marcado como ambíguo (erro na linha, em vez de ligar ao registro errado).
 */
async function relationLookup(db: Db, fields: FieldDef[]): Promise<Lookup> {
  const out: Lookup = new Map();
  for (const f of fields) {
    const rel = f.type === 'relation' ? getEntity(f.entity) : undefined;
    if (!rel || out.has(f.entity!)) continue;
    const chaves = (rel.chavesImportacao ?? []).filter((c) => c !== rel.labelField);
    const q = db(f.entity!).select('id', `${rel.labelField} as label`, ...chaves);
    if (rel.lixeira) q.whereNull(TRASH_COLUMN);
    const porNome = new Map<string, number>();
    const porChave = new Map<string, number>();
    for (const r of await q) {
      const id = Number(r.id);
      const nome = norm(String(r.label ?? ''));
      porNome.set(nome, porNome.has(nome) && porNome.get(nome) !== id ? AMBIGUO : id);
      for (const c of chaves) {
        const v = norm(String(r[c] ?? ''));
        if (v) porChave.set(v, porChave.has(v) && porChave.get(v) !== id ? AMBIGUO : id);
      }
    }
    const m = new Map(porNome);
    for (const [k, id] of porChave) if (id !== AMBIGUO || !m.has(k)) m.set(k, id);
    out.set(f.entity!, m);
  }
  return out;
}

const TRUE = new Set(['sim', 's', 'true', 'verdadeiro', 'v', '1', 'x', 'yes', 'y']);
const FALSE = new Set(['nao', 'n', 'false', 'falso', 'f', '0', 'no', '']);

/** Converte o texto da célula para o que a validação da entidade espera */
function convert(f: FieldDef, raw: string, lookup: Lookup): { value?: unknown; error?: string } {
  const v = raw.trim();
  if (v === '') return { value: f.type === 'boolean' ? false : f.type === 'multiselect' ? [] : undefined };
  switch (f.type) {
    case 'boolean':
      if (TRUE.has(norm(v))) return { value: true };
      if (FALSE.has(norm(v))) return { value: false };
      return { error: 'Use Sim ou Não' };
    case 'date': {
      const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
      if (br) {
        const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
        return { value: `${ano}-${pad(Number(br[2]))}-${pad(Number(br[1]))}` };
      }
      return { value: v.slice(0, 10) };
    }
    case 'datetime': {
      const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
      if (br)
        return {
          value: `${br[3]}-${pad(Number(br[2]))}-${pad(Number(br[1]))} ${pad(Number(br[4] ?? 0))}:${br[5] ?? '00'}`,
        };
      return { value: v };
    }
    case 'percent':
      return { value: v.replace('%', '').trim() };
    case 'select': {
      const op = f.options?.find((o) => norm(o) === norm(v));
      return { value: op ?? v };
    }
    case 'multiselect':
      return {
        value: v
          .split(/[,;|]/)
          .map((x) => x.trim())
          .filter(Boolean)
          .map((x) => f.options?.find((o) => norm(o) === norm(x)) ?? x),
      };
    case 'relation': {
      if (/^\d+$/.test(v)) return { value: Number(v) };
      const id = lookup.get(f.entity!)?.get(norm(v));
      const rel = getEntity(f.entity);
      if (id === AMBIGUO)
        return { error: `“${v}” aparece em mais de um registro de ${rel?.label ?? f.entity}: use um nome único` };
      return id ? { value: id } : { error: `“${v}” não encontrado em ${rel?.label ?? f.entity}` };
    }
    default:
      return { value: v };
  }
}

interface Parsed {
  linha: number;
  valores: Record<string, string>;
  erros: Record<string, string>;
  dados?: Record<string, unknown>;
}

function parseRows(ent: EntityDef, sheet: Sheet, mapa: Record<string, string>, lookup: Lookup): Parsed[] {
  const fields = importFields(ent);
  const byName = new Map(fields.map((f) => [f.name, f]));
  return sheet.linhas.map((cells, i) => {
    const valores: Record<string, string> = {};
    const input: Record<string, unknown> = {};
    const erros: Record<string, string> = {};
    sheet.colunas.forEach((col, c) => {
      const f = byName.get(mapa[col] ?? '');
      if (!f) return;
      valores[f.name] = cells[c] ?? '';
      const r = convert(f, cells[c] ?? '', lookup);
      if (r.error) erros[f.name] = r.error;
      else if (r.value !== undefined) input[f.name] = r.value;
    });
    const v = validateEntity(ent, input, 'create');
    if (!v.ok) for (const [k, msg] of Object.entries(v.errors)) erros[k] ??= msg;
    // linha 1 é o cabeçalho
    return { linha: i + 2, valores, erros, ...(v.ok && !Object.keys(erros).length && { dados: v.data }) };
  });
}

/** Mapa vindo da tela: só aceita campos importáveis e cada campo uma vez */
function cleanMap(ent: EntityDef, colunas: string[], pedido: unknown): Record<string, string> {
  const fields = importFields(ent);
  if (!pedido || typeof pedido !== 'object') return suggestMap(colunas, fields);
  const usados = new Set<string>();
  const out: Record<string, string> = {};
  for (const c of colunas) {
    const campo = String((pedido as Record<string, unknown>)[c] ?? '');
    const ok = fields.some((f) => f.name === campo) && !usados.has(campo);
    out[c] = ok ? campo : '';
    if (ok) usados.add(campo);
  }
  return out;
}

export async function previewImport(
  db: Db,
  ent: EntityDef,
  buf: Buffer,
  nome: string,
  pedido?: unknown,
): Promise<ImportPreview> {
  const sheet = await readSheet(buf, nome);
  const fields = importFields(ent);
  const mapa = cleanMap(ent, sheet.colunas, pedido);
  const parsed = parseRows(ent, sheet, mapa, await relationLookup(db, fields));
  // mesmas checagens de relação da gravação (registro existe, combina com o campo do qual depende)
  for (const p of parsed) {
    if (!p.dados) continue;
    try {
      await checkRelations(db, ent, p.dados);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      Object.assign(p.erros, err.fields ?? { _: err.message });
      delete p.dados;
    }
  }
  const validas = parsed.filter((p) => p.dados).length;
  return {
    colunas: sheet.colunas,
    campos: fields.map((f) => ({ name: f.name, label: f.label, required: !!f.required })),
    mapa,
    total: parsed.length,
    validas,
    invalidas: parsed.length - validas,
    linhas: parsed.slice(0, 200).map(({ linha, valores, erros }) => ({ linha, valores, erros })),
  };
}

/**
 * Grava as linhas válidas numa transação só (rápido e consistente). Linhas com erro
 * — de conversão, validação ou regra (hook) — ficam de fora e voltam na lista de erros.
 */
export async function runImport(
  c: OpCtx,
  table: string,
  ent: EntityDef,
  buf: Buffer,
  nome: string,
  pedido?: unknown,
): Promise<ImportResult> {
  const sheet = await readSheet(buf, nome);
  const fields = importFields(ent);
  const mapa = cleanMap(ent, sheet.colunas, pedido);
  if (!Object.values(mapa).some(Boolean)) throw new HttpError(422, 'Nenhuma coluna ligada a um campo');
  const parsed = parseRows(ent, sheet, mapa, await relationLookup(c.db, fields));
  const fmt = (e: Record<string, string>) =>
    Object.entries(e)
      .map(([k, m]) => `${fields.find((f) => f.name === k)?.label ?? k}: ${m}`)
      .join('; ');

  const result: ImportResult = { importados: 0, erros: [] };
  await c.db.transaction(async (trx) => {
    const ctx: OpCtx = { ...c, db: trx, semLog: true };
    for (const p of parsed) {
      if (!p.dados) {
        result.erros.push({ linha: p.linha, error: fmt(p.erros) });
        continue;
      }
      try {
        await createRecord(ctx, table, ent, p.dados);
        result.importados++;
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        result.erros.push({ linha: p.linha, error: err.fields ? fmt(err.fields) : err.message });
      }
    }
    if (result.importados)
      await addLog(
        trx,
        { entidade: table, acao: 'importação', detalhe: `${result.importados} registro(s) de ${nome}` },
        { id: c.user.id, nome: c.user.nome, ip: c.ip },
      );
  });
  return result;
}

/** Planilha modelo: cabeçalho com os rótulos + aba com instruções de cada campo */
export async function importTemplate(ent: EntityDef): Promise<Buffer> {
  const fields = importFields(ent);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(ent.label.slice(0, 31));
  ws.columns = fields.map((f) => ({ header: f.label, key: f.name, width: Math.max(14, f.label.length + 4) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const como: Record<string, string> = {
    money: 'Número: 1.234,56',
    number: 'Número',
    percent: 'Número (12,5 = 12,5%)',
    date: 'Data: 31/12/2026',
    datetime: 'Data e hora: 31/12/2026 14:30',
    boolean: 'Sim ou Não',
    document: 'CPF ou CNPJ (com ou sem pontuação)',
    phone: 'Telefone com DDD',
    color: 'Cor #RRGGBB',
    email: 'E-mail',
  };
  const info = wb.addWorksheet('Instruções');
  info.columns = [
    { header: 'Coluna', key: 'coluna', width: 24 },
    { header: 'Obrigatório', key: 'obrigatorio', width: 12 },
    { header: 'Como preencher', key: 'como', width: 70 },
  ];
  info.getRow(1).font = { bold: true };
  for (const f of fields) {
    let texto = como[f.type] ?? 'Texto';
    if (f.type === 'select') texto = `Uma destas: ${f.options?.join(', ')}`;
    if (f.type === 'multiselect') texto = `Uma ou mais, separadas por vírgula: ${f.options?.join(', ')}`;
    if (f.type === 'relation') {
      const rel = getEntity(f.entity);
      const outros = (rel?.chavesImportacao ?? [])
        .map((c) => rel?.fields.find((x) => x.name === c)?.label?.toLowerCase())
        .filter(Boolean);
      texto = `Nome${outros.length ? ` (ou ${outros.join('/')})` : ''} de um registro de ${rel?.label ?? f.entity} já cadastrado`;
    }
    info.addRow({ coluna: f.label, obrigatorio: f.required ? 'Sim' : '', como: texto });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
