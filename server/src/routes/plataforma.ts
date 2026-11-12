import fs from 'node:fs';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAdmin, userOf } from '../auth/middleware';
import { deleteUserSessions } from '../auth/sessions';
import type { Db } from '../db/knex';
import { toDbValue } from '../db/knex';
import { arquivoEspaco, comEspaco } from '../espacos';
import { derrubarSuporte, entrarComoSuporte, liberacaoAtiva, sairDoSuporte } from '../espacos/suporte';
import { desativarDoisFatores } from '../services/doisFatores';
import { addLog, type Actor } from '../services/logs';
import { lerOuFalhar } from '../services/membros';
import { conflict, HttpError } from '../utils/http';
import { nowLocal } from '../utils/time';

/**
 * Painel da PLATAFORMA (Fase 5C) — só administradores. Mostra só METADADOS (nomes, contagens, tamanhos, acessos):
 * nenhum dado de dentro dos espaços. Entrar num espaço só pelo acesso de suporte liberado pelo dono.
 * Montado antes do resolverEspaco (o administrador pode não estar em espaço nenhum).
 *   GET  /api/plataforma                         totais, espaços e usuários
 *   PUT  /api/plataforma/espacos/:id             { ativo }   desativa/reativa um espaço (todos perdem o acesso)
 *   PUT  /api/plataforma/usuarios/:id            { ativo }   desativa/reativa uma conta
 *   POST /api/plataforma/usuarios/:id/sessoes    encerra as sessões
 *   POST /api/plataforma/usuarios/:id/2fa        desliga a verificação em duas etapas (celular perdido)
 *   POST /api/plataforma/suporte/:espacoId       entra no espaço como suporte (precisa da liberação do dono)
 *   POST /api/plataforma/suporte/sair            volta ao normal
 */
export function plataformaRouter(db: Db) {
  const router = Router();
  const actor = (req: Request): Actor & { id: number } => ({ id: userOf(req).id, nome: userOf(req).nome, ip: req.ip });
  const idDe = (v: unknown) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Não encontrado');
    return n;
  };
  const tamanho = (id: number) => {
    const f = arquivoEspaco(id);
    if (!f) return 0;
    let t = 0;
    for (const x of [f, `${f}-wal`]) if (fs.existsSync(x)) t += fs.statSync(x).size;
    return t;
  };

  // sair do suporte: qualquer sessão logada (a pessoa pode ter perdido o perfil de administrador no meio)
  router.post('/plataforma/suporte/sair', async (req, res) => {
    await sairDoSuporte(userOf(req), req.auth!.sessionId, req.ip);
    res.json({ ok: true });
  });

  router.use('/plataforma', requireAdmin);

  router.get('/plataforma', async (_req, res) => {
    const agora = nowLocal();
    const espacos = (await db('espacos as e')
      .leftJoin('usuarios as u', 'u.id', 'e.dono_id')
      .orderBy('e.id')
      .select('e.id', 'e.nome', 'e.tipo', 'e.ativo', 'e.criado_em', 'u.nome as dono', 'u.email as dono_email')) as {
      id: number;
      ativo: unknown;
      [k: string]: unknown;
    }[];
    const membros: { espaco_id: number; n: number }[] = await db('membros')
      .whereIn('ativo', [1, true])
      .groupBy('espaco_id')
      .select('espaco_id')
      .count({ n: '*' });
    const nMembros = new Map(membros.map((m) => [Number(m.espaco_id), Number(m.n)]));
    const convites: { espaco_id: number; n: number }[] = await db('convites')
      .whereNull('aceito_em')
      .whereNull('cancelado_em')
      .where('expira_em', '>', agora)
      .groupBy('espaco_id')
      .select('espaco_id')
      .count({ n: '*' });
    const nConvites = new Map(convites.map((m) => [Number(m.espaco_id), Number(m.n)]));
    const acessos: { espaco_id: number; u: string }[] = await db('sessoes')
      .whereNotNull('espaco_id')
      .groupBy('espaco_id')
      .select('espaco_id')
      .max({ u: 'ultimo_uso' });
    const ultimo = new Map(acessos.map((a) => [Number(a.espaco_id), a.u as string]));
    const listaEspacos = [];
    for (const e of espacos)
      listaEspacos.push({
        ...e,
        ativo: !!e.ativo,
        membros: nMembros.get(e.id) ?? 0,
        convites: nConvites.get(e.id) ?? 0,
        tamanho: tamanho(e.id),
        ultimo_acesso: ultimo.get(e.id) ?? null,
        suporte: await liberacaoAtiva(e.id),
      });

    const usuarios = (await db('usuarios as u')
      .join('perfis as p', 'p.id', 'u.perfil_id')
      .orderBy('u.nome')
      .select(
        'u.id',
        'u.nome',
        'u.email',
        'u.ativo',
        'u.dois_fatores',
        'u.ultimo_acesso',
        'u.criado_em',
        'p.nome as perfil',
        'p.admin',
      )) as { id: number; ativo: unknown; dois_fatores: unknown; admin: unknown; [k: string]: unknown }[];
    const porUsuario: { usuario_id: number; n: number }[] = await db('membros')
      .whereIn('ativo', [1, true])
      .groupBy('usuario_id')
      .select('usuario_id')
      .count({ n: '*' });
    const nEspacos = new Map(porUsuario.map((m) => [Number(m.usuario_id), Number(m.n)]));
    const sessoes = await db('sessoes').where('expira_em', '>', agora).count({ n: '*' }).first();

    res.json({
      totais: {
        usuarios: usuarios.filter((u) => u.ativo).length,
        espacos: listaEspacos.filter((e) => e.ativo).length,
        membros: [...nMembros.values()].reduce((a, n) => a + n, 0),
        sessoes: Number(sessoes?.n ?? 0),
        tamanho: listaEspacos.reduce((a, e) => a + e.tamanho, 0),
        sem_2fa_admin: usuarios.filter((u) => u.admin && u.ativo && !u.dois_fatores).length,
      },
      espacos: listaEspacos,
      usuarios: usuarios.map((u) => ({
        ...u,
        ativo: !!u.ativo,
        admin: !!u.admin,
        dois_fatores: !!u.dois_fatores,
        espacos: nEspacos.get(u.id) ?? 0,
      })),
    });
  });

  const ativoSchema = z.object({ ativo: z.boolean({ message: 'Informe ativo' }) });

  router.put('/plataforma/espacos/:id', async (req, res) => {
    const id = idDe(req.params.id);
    const { ativo } = lerOuFalhar(ativoSchema, req.body);
    const esp = await db('espacos').where({ id }).first('nome');
    if (!esp) throw new HttpError(404, 'Espaço não encontrado');
    const acao = ativo ? 'espaço reativado' : 'espaço desativado';
    const noEspaco = () =>
      comEspaco(id, (d) =>
        // o administrador não é membro (não há cópia dele no espaço): registra só o nome
        addLog(
          d,
          { entidade: 'sistema', acao, detalhe: 'pela administração da plataforma' },
          { ...actor(req), id: null },
        ),
      );
    if (!ativo) await noEspaco(); // registra antes: espaço desativado não abre
    await db('espacos')
      .where({ id })
      .update({ ativo: toDbValue(db, ativo) });
    if (!ativo) {
      await db('sessoes').where({ espaco_id: id }).update({ espaco_id: null });
      await derrubarSuporte(id);
    } else await noEspaco();
    await addLog(db, { entidade: 'espacos', registro_id: id, acao, detalhe: esp.nome }, actor(req));
    res.json({ ok: true });
  });

  async function usuarioOu404(id: number) {
    const u = await db('usuarios as u')
      .join('perfis as p', 'p.id', 'u.perfil_id')
      .where('u.id', id)
      .first('u.id', 'u.nome', 'u.email', 'u.ativo', 'p.admin');
    if (!u) throw new HttpError(404, 'Usuário não encontrado');
    return u as { id: number; nome: string; email: string; ativo: unknown; admin: unknown };
  }

  router.put('/plataforma/usuarios/:id', async (req, res) => {
    const id = idDe(req.params.id);
    const { ativo } = lerOuFalhar(ativoSchema, req.body);
    const u = await usuarioOu404(id);
    if (!ativo) {
      if (id === userOf(req).id) throw conflict('Você não pode desativar a própria conta.');
      if (u.admin) {
        const outros = await db('usuarios as u')
          .join('perfis as p', 'p.id', 'u.perfil_id')
          .whereIn('p.admin', [1, true])
          .whereIn('u.ativo', [1, true])
          .whereNot('u.id', id)
          .count({ n: '*' })
          .first();
        if (!Number(outros?.n)) throw conflict('O sistema precisa de ao menos um administrador ativo.');
      }
    }
    await db('usuarios')
      .where({ id })
      .update({ ativo: toDbValue(db, ativo), atualizado_em: nowLocal() });
    if (!ativo) await deleteUserSessions(db, id);
    await addLog(
      db,
      { entidade: 'usuarios', registro_id: id, acao: ativo ? 'conta reativada' : 'conta desativada', detalhe: u.email },
      actor(req),
    );
    res.json({ ok: true });
  });

  router.post('/plataforma/usuarios/:id/sessoes', async (req, res) => {
    const u = await usuarioOu404(idDe(req.params.id));
    await deleteUserSessions(db, u.id, u.id === userOf(req).id ? req.auth?.sessionId : undefined);
    await addLog(
      db,
      { entidade: 'usuarios', registro_id: u.id, acao: 'sessões encerradas', detalhe: u.email },
      actor(req),
    );
    res.json({ ok: true });
  });

  router.post('/plataforma/usuarios/:id/2fa', async (req, res) => {
    const u = await usuarioOu404(idDe(req.params.id));
    if (u.id === userOf(req).id) throw conflict('Para a própria conta, use Meu perfil.');
    await desativarDoisFatores(db, u.id);
    await deleteUserSessions(db, u.id);
    await addLog(
      db,
      { entidade: 'usuarios', registro_id: u.id, acao: '2FA desligada pela administração', detalhe: u.email },
      actor(req),
    );
    res.json({ ok: true });
  });

  router.post('/plataforma/suporte/:espacoId', async (req, res) => {
    const l = await entrarComoSuporte(userOf(req), idDe(req.params.espacoId), req.auth!.sessionId, req.ip);
    res.json({ ok: true, papel: l.papel, ate: l.expira_em });
  });

  return router;
}
