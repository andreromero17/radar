import { Router, type Request } from 'express';
import { z } from 'zod';
import { getEntity, toFieldErrors, type BulkResponse, type EntityDef } from '@frame/shared';
import { assertCan, userOf } from '../auth/middleware';
import type { Db } from '../db/knex';
import { buildExport, exportColumns, type ExportFormat } from '../services/export';
import {
  createRecord,
  getRecord,
  listRecords,
  relationOptions,
  removeRecord,
  restoreRecord,
  updateRecord,
  type OpCtx,
} from '../services/records';
import { badRequest, HttpError } from '../utils/http';
import { nowLocal } from '../utils/time';

/**
 * CRUD genérico para qualquer entidade de shared/src/entities.ts
 *   GET    /api/:entity                  lista (busca, filtros, período, ordenação, totais)   [ver]
 *   GET    /api/:entity/opcoes           { value, label } para selects de relação           [logado]
 *   GET    /api/:entity/exportar         CSV ou XLSX com os mesmos filtros (?formato=xlsx)   [ver]
 *   POST   /api/:entity/lote             ações em lote: excluir, restaurar, editar...         [excluir/editar]
 *   GET    /api/:entity/:id              detalhe                                             [ver]
 *   POST   /api/:entity                  cria                                                [criar]
 *   PUT    /api/:entity/:id              atualiza (parcial)                                  [editar]
 *   DELETE /api/:entity/:id              exclui (ou envia à lixeira); ?definitivo=1          [excluir]
 *   POST   /api/:entity/:id/restaurar    tira da lixeira                                     [excluir]
 * Filtros aceitos: veja applyFilters em services/records.ts.
 * Regras específicas de cada entidade ficam nos hooks.
 */
export function crudRouter(db: Db) {
  const router = Router();

  const resolve = (req: Request): [string, EntityDef] => {
    const name = String(req.params.entity);
    const ent = getEntity(name);
    if (!ent) throw new HttpError(404, 'Entidade não encontrada');
    return [name, ent];
  };
  const idParam = (req: Request) => Number(req.params.id);
  const ctxOf = (req: Request): OpCtx => ({ db, user: userOf(req), sessionId: req.auth?.sessionId, ip: req.ip });
  const wantsTrash = (req: Request) => req.query.lixeira === '1' || req.query.lixeira === 'true';

  router.get('/:entity', async (req, res) => {
    const [table, ent] = resolve(req);
    assertCan(req, table, wantsTrash(req) ? 'excluir' : 'ver');
    res.json(await listRecords(db, table, ent, req.query));
  });

  // Opções para selects de relação: só id + nome, liberado para qualquer usuário logado
  // (quem cria um registro precisa escolher o relacionado, mesmo sem acessar aquele cadastro)
  router.get('/:entity/opcoes', async (req, res) => {
    const [table, ent] = resolve(req);
    res.json(await relationOptions(db, table, ent, req.query));
  });

  router.get('/:entity/exportar', async (req, res) => {
    const [table, ent] = resolve(req);
    assertCan(req, table, wantsTrash(req) ? 'excluir' : 'ver');
    const format: ExportFormat = req.query.formato === 'xlsx' ? 'xlsx' : 'csv';
    const pedidas = typeof req.query.colunas === 'string' ? req.query.colunas.split(',').filter(Boolean) : undefined;
    const { rows, totais } = await listRecords(db, table, ent, req.query, { all: true });
    const file = await buildExport(format, ent, exportColumns(ent, pedidas), rows, totais);
    const nome = `${table}-${nowLocal().slice(0, 10)}.${format}`;
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(file.body);
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
    const [table, ent] = resolve(req);
    const parsed = bulkSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw badRequest('Verifique os campos', toFieldErrors(parsed.error));
    const { acao, ids, dados } = parsed.data;
    assertCan(req, table, acao === 'editar' ? 'editar' : 'excluir');
    if (acao === 'editar' && !Object.keys(dados ?? {}).length) throw badRequest('Informe o que alterar');

    const c = ctxOf(req);
    const result: BulkResponse = { ok: 0, erros: [] };
    // um por vez: cada registro passa pelas mesmas regras, hooks e log da operação individual
    for (const id of [...new Set(ids)]) {
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

  router.get('/:entity/:id', async (req, res) => {
    const [table, ent] = resolve(req);
    assertCan(req, table, 'ver');
    const id = idParam(req);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Registro não encontrado');
    res.json(await getRecord(db, table, ent, id));
  });

  router.post('/:entity', async (req, res) => {
    const [table, ent] = resolve(req);
    assertCan(req, table, 'criar');
    res.status(201).json(await createRecord(ctxOf(req), table, ent, req.body));
  });

  router.put('/:entity/:id', async (req, res) => {
    const [table, ent] = resolve(req);
    assertCan(req, table, 'editar');
    res.json(await updateRecord(ctxOf(req), table, ent, idParam(req), req.body));
  });

  router.delete('/:entity/:id', async (req, res) => {
    const [table, ent] = resolve(req);
    assertCan(req, table, 'excluir');
    const definitivo = req.query.definitivo === '1' || req.query.definitivo === 'true';
    const r = await removeRecord(ctxOf(req), table, ent, idParam(req), definitivo);
    if (r === 'lixeira') res.json({ lixeira: true });
    else res.status(204).end();
  });

  router.post('/:entity/:id/restaurar', async (req, res) => {
    const [table, ent] = resolve(req);
    assertCan(req, table, 'excluir');
    res.json(await restoreRecord(ctxOf(req), table, ent, idParam(req)));
  });

  return router;
}
