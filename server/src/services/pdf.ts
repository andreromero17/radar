// =============================================================================
// Texto de PDF em linhas (para importar documentos: faturas, extratos, notas).
// O PDF não tem "linhas": cada pedaço de texto tem uma posição. Aqui os pedaços
// são agrupados pela altura (y) e ordenados pela posição horizontal (x); um
// espaço grande entre pedaços vira "   " (ajuda a separar colunas).
// =============================================================================
import { getDocumentProxy } from 'unpdf';
import { HttpError } from '../utils/http';

export interface LinhaPdf {
  pagina: number;
  texto: string;
}

interface Pedaco {
  x: number;
  y: number;
  w: number;
  t: string;
}

/** Máximo de páginas lidas (fatura/extrato longo cabe com folga) */
const MAX_PAGINAS = 60;

export async function linhasPdf(buf: Buffer): Promise<LinhaPdf[]> {
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(422, 'Arquivo não é um PDF');
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(buf));
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    throw new HttpError(
      422,
      /password/i.test(msg) ? 'O PDF tem senha: abra, salve sem senha e envie de novo' : 'Não foi possível ler o PDF',
    );
  }
  const out: LinhaPdf[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGINAS); p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const pedacos: Pedaco[] = [];
    for (const it of items as { str?: string; transform?: number[]; width?: number }[]) {
      if (!it.str?.trim() || !it.transform) continue;
      pedacos.push({ x: it.transform[4], y: it.transform[5], w: it.width ?? 0, t: it.str });
    }
    // agrupa por y (tolerância de 2 pt), de cima para baixo
    pedacos.sort((a, b) => b.y - a.y || a.x - b.x);
    const grupos: Pedaco[][] = [];
    for (const pc of pedacos) {
      const g = grupos[grupos.length - 1];
      if (g && Math.abs(g[0].y - pc.y) <= 2) g.push(pc);
      else grupos.push([pc]);
    }
    for (const g of grupos) {
      g.sort((a, b) => a.x - b.x);
      let texto = '';
      let fim = -Infinity;
      for (const pc of g) {
        const gap = pc.x - fim;
        texto += texto ? (gap > 25 ? '   ' : gap > 1.5 ? ' ' : '') : '';
        texto += pc.t;
        fim = pc.x + pc.w;
      }
      const t = texto.replace(/[ \t]+$/g, '');
      if (t.trim()) out.push({ pagina: p, texto: t });
    }
  }
  await doc.cleanup?.();
  return out;
}
