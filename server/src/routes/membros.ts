import { Router, type Request } from 'express';
import { requirePermission, userOf } from '../auth/middleware';
import { definirEspacoDaSessao } from '../auth/sessions';
import type { Db } from '../db/knex';
import { copiarDoModelo, dbEspaco, espacoAtivo, espacosDoUsuario, modeloDisponivel, plataformaDb } from '../espacos';
import { liberacaoAtiva, liberacaoSchema, liberarSuporte, revogarSuporte } from '../espacos/suporte';
import { addLog, type Actor } from '../services/logs';
import type { Mailer } from '../services/mailer';
import {
  alterarEspaco,
  alterarMembro,
  alterarMembroSchema,
  cancelarConvite,
  conviteSchema,
  convidar,
  criarEspacoDoUsuario,
  espacoSchema,
  lerOuFalhar,
  listarConvites,
  listarMembros,
  podeCriarEspaco,
  reenviarConvite,
  removerMembro,
} from '../services/membros';
import { HttpError } from '../utils/http';

/**
 * Membros do espaço em uso e espaços do usuário (Fase 5B). Montado DEPOIS do resolverEspaco: o espaço é sempre o
 * da sessão — não há id de espaço na URL, então não dá para mexer nos membros de outro.
 *   GET    /api/membros                       espaço, membros e convites pendentes (convites: só o dono)
 *   PUT    /api/membros/:usuarioId            { papel?, ativo? }                       (dono)
 *   DELETE /api/membros/:usuarioId            remove do espaço                         (dono)
 *   POST   /api/membros/sair                  o próprio usuário sai do espaço
 *   POST   /api/membros/convites              { email, papel }                         (dono)
 *   POST   /api/membros/convites/:id/reenviar link novo, prazo renovado                (dono)
 *   DELETE /api/membros/convites/:id          cancela                                  (dono)
 *   GET    /api/suporte                       liberação do suporte em vigor + histórico
 *   POST   /api/suporte                       { horas: 24|72|168, papel: leitor|editor } (dono)
 *   DELETE /api/suporte                       revoga (quem estiver dentro sai na hora)  (dono)
 *   PUT    /api/espaco                        { nome, tipo } do espaço em uso          (dono)
 *   POST   /api/espacos                       { nome, tipo } cria um espaço e entra nele
 *   GET    /api/espaco/modelo                 { disponivel } há espaço modelo para trazer novidades
 *   POST   /api/espaco/modelo                 traz do modelo o que falta (não sobrescreve o que é do espaço) (dono)
 */
export function membrosRouter(plataforma: Db, opts: { mailer: Mailer; appUrl: string }) {
  const router = Router();
  const actor = (req: Request): Actor & { id: number } => ({
    id: userOf(req).id,
    nome: userOf(req).nome,
    ip: req.ip,
  });
  const espacoId = () => espacoAtivo().espacoId;
  const idDe = (v: unknown) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Não encontrado');
    return n;
  };
  const envio = { mailer: opts.mailer, appUrl: opts.appUrl };
  const gerencia = requirePermission('membros', 'editar');

  router.get('/membros', requirePermission('membros', 'ver'), async (req, res) => {
    const user = userOf(req);
    const id = espacoId();
    const esp = await plataformaDb()('espacos').where({ id }).first('id', 'nome', 'tipo', 'criado_em');
    const dono = user.espaco?.papel === 'dono';
    res.json({
      espaco: esp,
      papel: user.espaco?.papel,
      membros: await listarMembros(id),
      convites: dono ? await listarConvites(id) : [],
      pode_gerenciar: dono,
      pode_criar_espaco: await podeCriarEspaco(user),
    });
  });

  router.put('/membros/:usuarioId', gerencia, async (req, res) => {
    const dados = lerOuFalhar(alterarMembroSchema, req.body);
    res.json(await alterarMembro(espacoId(), idDe(req.params.usuarioId), dados, actor(req)));
  });

  router.delete('/membros/:usuarioId', gerencia, async (req, res) => {
    await removerMembro(espacoId(), idDe(req.params.usuarioId), actor(req));
    res.status(204).end();
  });

  router.post('/membros/sair', requirePermission('membros', 'ver'), async (req, res) => {
    await removerMembro(espacoId(), userOf(req).id, actor(req));
    // a sessão vai para outro espaço (ou fica sem nenhum)
    const outro = (await espacosDoUsuario(userOf(req).id))[0];
    await definirEspacoDaSessao(plataforma, req.auth!.sessionId, outro?.id ?? null);
    res.json({ ok: true, espaco_id: outro?.id ?? null });
  });

  router.post('/membros/convites', gerencia, async (req, res) => {
    const dados = lerOuFalhar(conviteSchema, req.body);
    res.status(201).json(await convidar(espacoId(), dados, actor(req), envio));
  });

  router.post('/membros/convites/:id/reenviar', gerencia, async (req, res) => {
    await reenviarConvite(espacoId(), idDe(req.params.id), actor(req), envio);
    res.json({ ok: true });
  });

  router.delete('/membros/convites/:id', gerencia, async (req, res) => {
    await cancelarConvite(espacoId(), idDe(req.params.id), actor(req));
    res.status(204).end();
  });

  // ---------- acesso do suporte (só o dono libera/revoga; todos os membros veem se está liberado) ----------
  router.get('/suporte', requirePermission('membros', 'ver'), async (_req, res) => {
    const id = espacoId();
    const historico = await espacoAtivo()
      .db('logs')
      .where({ entidade: 'suporte' })
      .orderBy('id', 'desc')
      .limit(30)
      .select('acao', 'detalhe', 'usuario', 'criado_em');
    res.json({ liberacao: await liberacaoAtiva(id), historico });
  });

  router.post('/suporte', gerencia, async (req, res) => {
    const dados = lerOuFalhar(liberacaoSchema, req.body);
    res.status(201).json(await liberarSuporte(espacoId(), dados, actor(req)));
  });

  router.delete('/suporte', gerencia, async (req, res) => {
    await revogarSuporte(espacoId(), actor(req));
    res.status(204).end();
  });

  router.put('/espaco', gerencia, async (req, res) => {
    const dados = lerOuFalhar(espacoSchema, req.body);
    await alterarEspaco(espacoId(), dados, actor(req));
    res.json({ ok: true });
  });

  router.get('/espaco/modelo', async (_req, res) => {
    res.json({ disponivel: await modeloDisponivel(espacoId()) });
  });

  router.post('/espaco/modelo', requirePermission('configuracoes', 'editar'), async (req, res) => {
    const id = espacoId();
    const itens = await copiarDoModelo(id, { novo: false });
    if (!itens) throw new HttpError(404, 'Não há espaço modelo na plataforma.');
    const total = itens.reduce((a, i) => a + i.alterados, 0);
    await addLog(
      dbEspaco,
      {
        entidade: 'sistema',
        acao: 'trazido do modelo',
        detalhe: itens.map((i) => `${i.nome}: ${i.alterados}`).join(', '),
      },
      actor(req),
    );
    res.json({ itens, total });
  });

  router.post('/espacos', async (req, res) => {
    const user = userOf(req);
    const dados = lerOuFalhar(espacoSchema, req.body);
    const id = await criarEspacoDoUsuario(user, dados, req.ip);
    await definirEspacoDaSessao(plataforma, req.auth!.sessionId, id);
    res.status(201).json({ ok: true, espaco_id: id });
  });

  return router;
}
