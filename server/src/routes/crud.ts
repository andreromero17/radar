import express, { Router, type Request } from 'express';
import { z } from 'zod';
import { canImport, getEntity, toFieldErrors, type BulkResponse, type EntityDef } from '@frame/shared';
import { assertCan, userOf } from '../auth/middleware';
import type { Db } from '../db/knex';
import { ENTIDADES_DA_PLATAFORMA } from '../db/diff';
import { anexoFile, INLINE_TYPES, listAnexos, removeAnexo, saveAnexo } from '../services/anexos';
import { buildExport, exportColumns, type ExportFormat } from '../services/export';
import { importTemplate, previewImport, runImport } from '../services/import';
import {
  createRecord,
  getRecord,
  listRecords,
  listWithExtras,
  relationOptions,
  emptyTrash,
  removeRecord,
  restoreRecord,
  updateRecord,
  type OpCtx,
} from '../services/records';
import { hooks } from '../hooks';
import { espacoAtivo, idsDosMembros } from '../espacos';
import { badRequest, HttpError } from '../utils/http';
import { nowLocal } from '../utils/time';

/**
 * CRUD genérico para qualquer entidade de shared/src/entities.ts
 *   GET    /api/:entity                  lista (busca, filtros, período, ordenação, totais)   [ver]
 *   GET    /api/:entity/opcoes           { value, label } para selects de relação           [logado]
 *   GET    /api/:entity/exportar         CSV ou XLSX com os mesmos filtros (?formato=xlsx)   [ver]
 *   POST   /api/:entity/lixeira/esvaziar  apaga de vez tudo o que está na lixeira          [excluir]
 *   POST   /api/:entity/lote             ações em lote: excluir, restaurar, editar...         [excluir/editar]
 *   GET    /api/:entity/:id              detalhe                                             [ver]
 *   POST   /api/:entity                  cria                                                [criar]
 *   PUT    /api/:entity/:id              atualiza (parcial)                                  [editar]
 *   DELETE /api/:entity/:id              exclui (ou envia à lixeira); ?definitivo=1          [excluir]
 *   POST   /api/:entity/:id/restaurar    tira da lixeira                                     [excluir]
 *   GET    /api/:entity/importar/modelo  planilha modelo para importação                     [criar]
 *   POST   /api/:entity/importar         arquivo no corpo; ?previa=1 só valida; ?mapa={...}  [criar]
 *   GET    /api/:entity/:id/anexos       lista os anexos                                     [ver]
 *   POST   /api/:entity/:id/anexos       arquivo no corpo, ?nome=arquivo.pdf                 [editar]
 *   GET    /api/:entity/:id/anexos/:aid  baixa (?inline=1 abre imagens/PDF no navegador)     [ver]
 *   DELETE /api/:entity/:id/anexos/:aid  exclui o anexo                                      [editar]
 * Filtros aceitos: veja applyFilters em services/records.ts.
 * Regras específicas de cada entidade ficam nos hooks.
 */
/** Entidades do núcleo que moram na PLATAFORMA (as demais ficam no banco do espaço da sessão) */

export function crudRouter(bancos: { plataforma: Db; espaco: Db }, opts: { uploadMaxMb?: number } = {}) {
  const router = Router();
  const dbDe = (table: string) => (ENTIDADES_DA_PLATAFORMA.has(table) ? bancos.plataforma : bancos.espaco);
  /**
   * Usuários moram na plataforma, mas cada espaço só enxerga os SEUS membros: lista, opções, exportação, detalhe,
   * edição e exclusão ficam restritos a eles (outro id = 404, como se não existisse).
   */
  const escopoIds = async (table: string): Promise<number[] | null> =>
    table === 'usuarios' ? idsDosMembros(espacoAtivo().espacoId) : null;
  // arquivos chegam crus no corpo (application/octet-stream), sem multipart
  const rawFile = express.raw({ type: () => true, limit: `${opts.uploadMaxMb ?? 10}mb` });
  const fileBody = (req: Request) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Envie o arquivo no corpo da requisição');
    return req.body;
  };
  const fileName = (req: Request) => (typeof req.query.nome === 'string' && req.query.nome) || 'arquivo';

  const resolve = async (req: Request): Promise<[string, EntityDef]> => {
    const name = String(req.params.entity);
    const ent = getEntity(name);
    if (!ent) throw new HttpError(404, 'Entidade não encontrada');
    if (req.params.id !== undefined) {
      const ids = await escopoIds(name);
      if (ids && !ids.includes(Number(req.params.id))) throw new HttpError(404, 'Registro não encontrado');
    }
    return [name, ent];
  };
  const idParam = (req: Request) => Number(req.params.id);
  const ctxOf = (req: Request): OpCtx => ({
    db: dbDe(String(req.params.entity)),
    user: userOf(req),
    sessionId: req.auth?.sessionId,
    ip: req.ip,
  });
  const wantsTrash = (req: Request) => req.query.lixeira === '1' || req.query.lixeira === 'true';

  router.get('/:entity', async (req, res) => {
    const [table, ent] = await resolve(req);
    assertCan(req, table, wantsTrash(req) ? 'excluir' : 'ver');
    const extrasDe = hooks[table]?.listExtras;
    if (extrasDe && !wantsTrash(req)) {
      const extras = await extrasDe(req.query, { db: dbDe(table), actor: userOf(req) });
      return void res.json(await listWithExtras(dbDe(table), table, ent, req.query, extras));
    }
    res.json(await listRecords(dbDe(table), table, ent, req.query, { somenteIds: await escopoIds(table) }));
  });

  // Opções para selects de relação: só id + nome, liberado para qualquer usuário logado
  // (quem cria um registro precisa escolher o relacionado, mesmo sem acessar aquele cadastro)
  router.get('/:entity/opcoes', async (req, res) => {
    const [table, ent] = await resolve(req);
    res.json(await relationOptions(dbDe(table), table, ent, req.query, await escopoIds(table)));
  });

  router.get('/:entity/exportar', async (req, res) => {
    const [table, ent] = await resolve(req);
    assertCan(req, table, wantsTrash(req) ? 'excluir' : 'ver');
    const format: ExportFormat = req.query.formato === 'xlsx' ? 'xlsx' : 'csv';
    const pedidas = typeof req.query.colunas === 'string' ? req.query.colunas.split(',').filter(Boolean) : undefined;
    const { rows, totais } = await listRecords(dbDe(table), table, ent, req.query, {
      all: true,
      somenteIds: await escopoIds(table),
    });
    const file = await buildExport(format, ent, exportColumns(ent, pedidas), rows, totais);
    const nome = `${table}-${nowLocal().slice(0, 10)}.${format}`;
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(file.body);
  });

  // ---------- importação ----------
  const importable = async (req: Request) => {
    const [table, ent] = await resolve(req);
    assertCan(req, table, 'criar');
    if (!canImport(table, ent)) throw new HttpError(404, 'Esta entidade não aceita importação');
    return [table, ent] as const;
  };

  router.get('/:entity/importar/modelo', async (req, res) => {
    const [table, ent] = await importable(req);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="modelo-${table}.xlsx"`);
    res.send(await importTemplate(ent));
  });

  router.post('/:entity/importar', rawFile, async (req, res) => {
    const [table, ent] = await importable(req);
    let mapa: unknown;
    if (typeof req.query.mapa === 'string' && req.query.mapa) {
      try {
        mapa = JSON.parse(req.query.mapa);
      } catch {
        throw badRequest('Mapeamento de colunas inválido');
      }
    }
    const previa = req.query.previa === '1' || req.query.previa === 'true';
    res.json(
      previa
        ? await previewImport(dbDe(table), ent, fileBody(req), fileName(req), mapa)
        : await runImport(ctxOf(req), table, ent, fileBody(req), fileName(req), mapa),
    );
  });

  const bulkSchema = z.object({
    acao: z.enum(['excluir', 'restaurar', 'editar', 'excluir_definitivo'], { error: 'Ação inválida' }),
    ids: z
      .array(z.number().int().positive(), { error: 'Lista de registros inválida' })
      .min(1, 'Selecione ao menos um registro')
      .max(500, 'No máximo 500 registros por vez'),
    dados: z.record(z.string(), z.unknown()).optional(),
  });

  router.post('/:entity/lote', async (req, res) => {
    const [table, ent] = await resolve(req);
    const parsed = bulkSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw badRequest('Verifique os campos', toFieldErrors(parsed.error));
    const { acao, ids, dados } = parsed.data;
    assertCan(req, table, acao === 'editar' ? 'editar' : 'excluir');
    if (acao === 'editar' && !Object.keys(dados ?? {}).length) throw badRequest('Informe o que alterar');

    const c = ctxOf(req);
    const result: BulkResponse = { ok: 0, erros: [] };
    // um por vez: cada registro passa pelas mesmas regras, hooks e log da operação individual
    const escopo = await escopoIds(table);
    for (const id of [...new Set(ids)].filter((i) => !escopo || escopo.includes(i))) {
      try {
        if (acao === 'editar') await updateRecord(c, table, ent, id, dados);
        else if (acao === 'restaurar') await restoreRecord(c, table, ent, id);
        else await removeRecord(c, table, ent, id, acao === 'excluir_definitivo');
        result.ok++;
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        const detalhe = err.fields ? Object.values(err.fields)[0] : undefined;
        result.erros.push({ id, error: detalhe ? `${err.message}: ${detalhe}` : err.message });
      }
    }
    res.json(result);
  });

  router.post('/:entity/lixeira/esvaziar', async (req, res) => {
    const [table, ent] = await resolve(req);
    assertCan(req, table, 'excluir');
    res.json({ apagados: await emptyTrash(ctxOf(req), table, ent) });
  });

  router.get('/:entity/:id', async (req, res) => {
    const [table, ent] = await resolve(req);
    assertCan(req, table, 'ver');
    const id = idParam(req);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Registro não encontrado');
    res.json(await getRecord(dbDe(table), table, ent, id));
  });

  router.post('/:entity', async (req, res) => {
    const [table, ent] = await resolve(req);
    assertCan(req, table, 'criar');
    res.status(201).json(await createRecord(ctxOf(req), table, ent, req.body));
  });

  router.put('/:entity/:id', async (req, res) => {
    const [table, ent] = await resolve(req);
    assertCan(req, table, 'editar');
    res.json(await updateRecord(ctxOf(req), table, ent, idParam(req), req.body));
  });

  router.delete('/:entity/:id', async (req, res) => {
    const [table, ent] = await resolve(req);
    assertCan(req, table, 'excluir');
    const definitivo = req.query.definitivo === '1' || req.query.definitivo === 'true';
    const r = await removeRecord(ctxOf(req), table, ent, idParam(req), definitivo);
    if (r === 'lixeira') res.json({ lixeira: true });
    else res.status(204).end();
  });

  router.post('/:entity/:id/restaurar', async (req, res) => {
    const [table, ent] = await resolve(req);
    assertCan(req, table, 'excluir');
    res.json(await restoreRecord(ctxOf(req), table, ent, idParam(req)));
  });

  // ---------- anexos ----------
  const withAnexos = async (req: Request, action: 'ver' | 'editar') => {
    const [table, ent] = await resolve(req);
    assertCan(req, table, action);
    if (!ent.anexos) throw new HttpError(404, 'Esta entidade não aceita anexos');
    const id = idParam(req);
    const row = await dbDe(table)(table)
      .where({ id: Number.isInteger(id) ? id : 0 })
      .first();
    if (!row) throw new HttpError(404, 'Registro não encontrado');
    if (action === 'editar' && ent.lixeira && row.excluido_em) throw new HttpError(409, 'Registro está na lixeira');
    return [table, ent, id] as const;
  };

  router.get('/:entity/:id/anexos', async (req, res) => {
    const [table, , id] = await withAnexos(req, 'ver');
    res.json(await listAnexos(dbDe(table), table, id));
  });

  router.post('/:entity/:id/anexos', rawFile, async (req, res) => {
    const [table, ent, id] = await withAnexos(req, 'editar');
    res.status(201).json(await saveAnexo(ctxOf(req), table, ent, id, fileName(req), fileBody(req)));
  });

  router.get('/:entity/:id/anexos/:aid', async (req, res) => {
    const [table, , id] = await withAnexos(req, 'ver');
    const a = await anexoFile(dbDe(table), table, id, Number(req.params.aid));
    const inline = (req.query.inline === '1' || req.query.inline === 'true') && INLINE_TYPES.has(a.tipo);
    res.setHeader('Content-Type', a.tipo);
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(a.file);
  });

  router.delete('/:entity/:id/anexos/:aid', async (req, res) => {
    const [table, , id] = await withAnexos(req, 'editar');
    await removeAnexo(ctxOf(req), table, id, Number(req.params.aid));
    res.status(204).end();
  });

  return router;
}
