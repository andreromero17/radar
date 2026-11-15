import { Router, type CookieOptions, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  APARENCIAS,
  TAMANHOS_TEXTO,
  passwordSchema,
  toFieldErrors,
  type AuthUser,
  type SessionInfo,
} from '@frame/shared';
import { COOKIE_NAME, parseCookies, userOf } from '../auth/middleware';
import { hashPassword, verifyPassword } from '../auth/password';
import { minutes, RateLimiter } from '../auth/rateLimit';
import {
  createSession,
  definirEspacoDaSessao,
  deleteSession,
  deleteUserSessions,
  loadAuthUser,
  resolveSession,
  type SessionConfig,
} from '../auth/sessions';
import { atualizarCopias, espacosDoUsuario } from '../espacos';
import { espacoDeSuporte, nomeDeSuporte, sairDoSuporte } from '../espacos/suporte';
import { aceitarConvite, novaContaSchema, verConvite } from '../services/membros';
import {
  ativarDoisFatores,
  codigosRestantes,
  conferirSegundoFator,
  desativarDoisFatores,
  doisFatoresObrigatorio,
  iniciarDoisFatores,
  regerarCodigos,
} from '../services/doisFatores';
import { getSettings } from '../services/settings';
import {
  cadastrar,
  cadastroSchema,
  confirmarEmail,
  espacosQueSaemJunto,
  excluirConta,
  exportarMeusDados,
  verConvitePlataforma,
} from '../services/conta';
import { hashToken, newToken } from '../auth/tokens';
import type { Db } from '../db/knex';
import { addLog, type Actor } from '../services/logs';
import type { Mailer } from '../services/mailer';
import { badRequest, HttpError } from '../utils/http';
import { nowLocal } from '../utils/time';

export interface AuthOptions extends SessionConfig {
  cookieSecure: boolean;
  /** Endereço do front, para montar o link de redefinição */
  appUrl: string;
  mailer: Mailer;
}

const RESET_HOURS = 1;
/** Tempo para digitar o código da verificação em duas etapas depois da senha */
const DESAFIO_MINUTOS = 5;
const MAX_TENTATIVAS_2FA = 5;
const GENERIC_LOGIN_ERROR = 'E-mail ou senha inválidos.';

/**
 * Usuário com os espaços dele e o em uso (o da sessão ou, sem ele, o primeiro): o que o front recebe.
 * Em sessão de suporte, o espaço em uso é o da liberação (marcado com `suporte`).
 */
async function comEspacos(u: AuthUser | null, sessao?: { espacoId?: number | null; suporteId?: number | null }) {
  if (!u) return u;
  const espacos = await espacosDoUsuario(u.id);
  const sup = sessao?.suporteId ? await espacoDeSuporte(sessao.suporteId, u) : null;
  if (sup) return { ...u, nome: nomeDeSuporte(u.nome), espacos, espaco: sup };
  return { ...u, espacos, espaco: espacos.find((e) => e.id === sessao?.espacoId) ?? espacos[0] };
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Informe o e-mail'),
  senha: z.string().min(1, 'Informe a senha'),
  lembrar: z.boolean().optional().default(false),
});

const parse = <T extends z.ZodType>(schema: T, body: unknown): z.infer<T> => {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw badRequest('Verifique os campos', toFieldErrors(r.error));
  return r.data;
};

/**
 * Rotas públicas e de conta:
 *   POST /api/auth/login              entra (cria sessão em cookie httpOnly)
 *   POST /api/auth/logout             sai
 *   GET  /api/auth/me                 usuário logado + permissões
 *   PUT  /api/auth/senha              troca a própria senha
 *   POST /api/auth/esqueci            envia link de redefinição por e-mail
 *   POST /api/auth/redefinir/validar  confere se o link ainda vale
 *   POST /api/auth/redefinir          define nova senha pelo link
 *   PUT  /api/auth/perfil             altera o próprio nome e/ou a aparência (claro/escuro)
 *   GET  /api/auth/convites/:token    dados do convite (público)
 *   POST /api/auth/convites/:token/aceitar  aceita (logado com o e-mail do convite, ou cria a conta)
 *   POST /api/auth/espaco             troca o espaço em uso nesta sessão
 *   GET  /api/auth/sessoes            sessões abertas do próprio usuário
 *   DELETE /api/auth/sessoes/:id      encerra uma sessão
 *   DELETE /api/auth/sessoes          encerra todas as outras
 */
export function authRouter(db: Db, opts: AuthOptions) {
  const router = Router();

  // Limites de tentativa (por instância do servidor)
  // por IP conta só falhas: vários usuários legítimos podem sair do mesmo IP (empresa, casa)
  const falhasPorIp = new RateLimiter(30, 15 * 60_000);
  const falhasPorEmail = new RateLimiter(5, 15 * 60_000);
  const esqueciPorIp = new RateLimiter(5, 60 * 60_000);
  const esqueciPorEmail = new RateLimiter(3, 60 * 60_000);

  const cookieOptions = (lembrar: boolean): CookieOptions => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: opts.cookieSecure,
    path: '/',
    ...(lembrar && { maxAge: opts.rememberDays * 86_400_000 }),
  });

  const actor = (req: Request, u?: { id: number; nome: string } | null): Actor => ({
    id: u?.id ?? null,
    nome: u?.nome ?? 'Anônimo',
    ip: req.ip,
  });

  const tooMany = (sec: number) =>
    new HttpError(429, `Muitas tentativas. Tente novamente em ${minutes(sec)} minuto(s).`);

  router.post('/login', async (req: Request, res: Response) => {
    const ip = req.ip ?? 'desconhecido';
    const blockedIp = falhasPorIp.blockedFor(ip);
    if (blockedIp) throw tooMany(blockedIp);

    const { email, senha, lembrar } = parse(loginSchema, req.body);
    const blockedEmail = falhasPorEmail.blockedFor(email);
    if (blockedEmail) throw tooMany(blockedEmail);

    const user = await db('usuarios')
      .where({ email })
      .first('id', 'nome', 'senha', 'ativo', 'dois_fatores', 'confirmar_email');
    const ok = await verifyPassword(senha, user?.senha); // sempre gasta o mesmo tempo
    if (!user || !ok) {
      falhasPorEmail.hit(email);
      falhasPorIp.hit(ip);
      await addLog(db, { entidade: 'auth', acao: 'login falhou', detalhe: email }, actor(req, user));
      throw new HttpError(401, GENERIC_LOGIN_ERROR);
    }
    if (!user.ativo) throw new HttpError(403, 'Usuário inativo. Fale com o administrador do sistema.');
    if (user.confirmar_email)
      throw new HttpError(
        403,
        'Confirme seu e-mail pelo link que enviamos para ativar a conta.',
        undefined,
        'EMAIL_NAO_CONFIRMADO',
      );

    falhasPorEmail.reset(email);
    // verificação em duas etapas: a senha só abre um desafio curto; a sessão vem com o código
    if (user.dois_fatores) {
      const desafio = newToken();
      await db('desafios_2fa').insert({
        id: hashToken(desafio),
        usuario_id: user.id,
        lembrar: lembrar ? 1 : 0,
        tentativas: 0,
        criado_em: nowLocal(),
        expira_em: nowLocal(new Date(Date.now() + DESAFIO_MINUTOS * 60_000)),
      });
      return res.json({ segundo_fator: true, desafio });
    }
    await entrar(req, res, user, lembrar, 'login');
  });

  /** Cria a sessão (cookie) e responde com o usuário */
  async function entrar(
    req: Request,
    res: Response,
    user: { id: number; nome: string; email?: string },
    lembrar: boolean,
    acao: string,
  ) {
    const { token } = await createSession(db, opts, user.id, {
      lembrar,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    await db('usuarios').where({ id: user.id }).update({ ultimo_acesso: nowLocal() });
    const u = await loadAuthUser(db, user.id);
    await addLog(db, { entidade: 'auth', registro_id: user.id, acao, detalhe: u?.email ?? '' }, actor(req, user));
    res.cookie(COOKIE_NAME, token, cookieOptions(lembrar));
    res.json(await comEspacos(u));
  }

  // ---------- Cadastro (Fase 5D) ----------
  const cadastrosPorIp = new RateLimiter(10, 60 * 60_000);
  const envio = { mailer: opts.mailer, appUrl: opts.appUrl };

  router.get('/cadastro/convite/:token', async (req, res) => {
    const token = conviteToken(req);
    res.json(await contarFalha(req, () => verConvitePlataforma(token)));
  });

  router.post('/cadastro', async (req, res) => {
    const ip = req.ip ?? 'desconhecido';
    const bloqueado = cadastrosPorIp.blockedFor(ip);
    if (bloqueado) throw tooMany(bloqueado);
    cadastrosPorIp.hit(ip);
    const dados = parse(cadastroSchema, req.body);
    const r = await cadastrar(dados, envio, req.ip);
    if (!r.entrou) return res.json({ entrou: false, email: dados.email });
    await entrar(req, res, { id: r.usuarioId, nome: dados.nome }, false, 'login (cadastro)');
  });

  router.post('/cadastro/confirmar', async (req, res) => {
    const { token } = parse(z.object({ token: z.string().min(1) }), req.body);
    const r = await confirmarEmail(token, req.ip);
    const u = await db('usuarios').where({ id: r.usuarioId }).first('id', 'nome');
    await entrar(req, res, u, false, 'login (e-mail confirmado)');
  });

  // ---------- Meus dados e exclusão da conta (LGPD) ----------
  router.post('/meus-dados', async (req, res) => {
    const me = userOf(req);
    await confirmarSenha(me.id, (req.body ?? {}).senha);
    const dados = await exportarMeusDados(me.id);
    await addLog(
      db,
      { entidade: 'auth', registro_id: me.id, acao: 'baixou os próprios dados', detalhe: me.email },
      actor(req, me),
    );
    res.setHeader('Content-Disposition', `attachment; filename="meus-dados-${nowLocal().slice(0, 10)}.json"`);
    res.json(dados);
  });

  router.get('/excluir-conta', async (req, res) => {
    res.json({ espacos: await espacosQueSaemJunto(userOf(req).id) });
  });

  router.post('/excluir-conta', async (req, res) => {
    const me = userOf(req);
    const body = parse(
      z.object({
        senha: z.string().min(1, 'Informe a senha'),
        confirmacao: z.literal('EXCLUIR', { message: 'Digite EXCLUIR para confirmar' }),
        codigo: z.string().optional(),
      }),
      req.body,
    );
    await confirmarSenha(me.id, body.senha);
    if (me.dois_fatores && !(body.codigo && (await conferirSegundoFator(db, me.id, body.codigo))))
      throw badRequest('Código incorreto', { codigo: 'Informe o código da verificação em duas etapas' });
    const r = await excluirConta(me.id, envio, req.ip);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(false), maxAge: undefined });
    res.json({ ok: true, ...r });
  });

  // ---------- Verificação em duas etapas (Fase 5C) ----------
  router.post('/2fa/entrar', async (req, res) => {
    const ip = req.ip ?? 'desconhecido';
    const bloqueado = falhasPorIp.blockedFor(ip);
    if (bloqueado) throw tooMany(bloqueado);
    const { desafio, codigo } = parse(
      z.object({ desafio: z.string().min(1), codigo: z.string().trim().min(1, 'Informe o código') }),
      req.body,
    );
    const d = await db('desafios_2fa')
      .where({ id: hashToken(desafio) })
      .where('expira_em', '>', nowLocal())
      .first();
    if (!d)
      throw new HttpError(401, 'O tempo para digitar o código acabou. Entre de novo.', undefined, 'DESAFIO_EXPIRADO');
    const user = await db('usuarios')
      .where({ id: d.usuario_id })
      .whereIn('ativo', [1, true])
      .first('id', 'nome', 'email');
    const tipo = user ? await conferirSegundoFator(db, d.usuario_id, codigo) : null;
    if (!user || !tipo) {
      falhasPorIp.hit(ip);
      const tentativas = Number(d.tentativas) + 1;
      if (tentativas >= MAX_TENTATIVAS_2FA) await db('desafios_2fa').where({ id: d.id }).del();
      else await db('desafios_2fa').where({ id: d.id }).update({ tentativas });
      await addLog(
        db,
        { entidade: 'auth', registro_id: d.usuario_id, acao: 'código 2FA incorreto', detalhe: user?.email ?? '' },
        actor(req, user),
      );
      if (tentativas >= MAX_TENTATIVAS_2FA)
        throw new HttpError(401, 'Muitas tentativas. Entre de novo.', undefined, 'DESAFIO_EXPIRADO');
      throw badRequest('Código incorreto', { codigo: 'Código incorreto' });
    }
    await db('desafios_2fa').where({ id: d.id }).del();
    await entrar(
      req,
      res,
      user,
      !!d.lembrar,
      tipo === 'recuperacao' ? 'login (código de recuperação)' : 'login (2 etapas)',
    );
  });

  /** Confere a senha do próprio usuário (para mexer na verificação em duas etapas) */
  const confirmarSenha = async (usuarioId: number, senha: unknown) => {
    const row = await db('usuarios').where({ id: usuarioId }).first('senha');
    if (!(await verifyPassword(String(senha ?? ''), row?.senha)))
      throw badRequest('Verifique os campos', { senha: 'Senha incorreta' });
  };

  router.get('/2fa', async (req, res) => {
    const me = userOf(req);
    res.json({
      ativo: !!me.dois_fatores,
      obrigatorio: doisFatoresObrigatorio(me.admin),
      codigos_restantes: me.dois_fatores ? await codigosRestantes(db, me.id) : 0,
    });
  });

  router.post('/2fa/iniciar', async (req, res) => {
    const me = userOf(req);
    await confirmarSenha(me.id, (req.body ?? {}).senha);
    const { nome_sistema } = await getSettings(db);
    res.json(await iniciarDoisFatores(db, me.id, nome_sistema));
  });

  router.post('/2fa/ativar', async (req, res) => {
    const me = userOf(req);
    const { codigo } = parse(z.object({ codigo: z.string().trim().min(1, 'Informe o código') }), req.body);
    const codigos = await ativarDoisFatores(db, me.id, codigo);
    await addLog(db, { entidade: 'auth', registro_id: me.id, acao: '2FA ativada', detalhe: me.email }, actor(req, me));
    res.json({ codigos, usuario: await comEspacos(await loadAuthUser(db, me.id), req.auth) });
  });

  router.post('/2fa/codigos', async (req, res) => {
    const me = userOf(req);
    await confirmarSenha(me.id, (req.body ?? {}).senha);
    const codigos = await regerarCodigos(db, me.id);
    await addLog(
      db,
      { entidade: 'auth', registro_id: me.id, acao: '2FA: novos códigos de recuperação', detalhe: me.email },
      actor(req, me),
    );
    res.json({ codigos });
  });

  router.post('/2fa/desativar', async (req, res) => {
    const me = userOf(req);
    if (doisFatoresObrigatorio(me.admin))
      throw new HttpError(403, 'Para administradores a verificação em duas etapas é obrigatória.');
    const { senha, codigo } = parse(
      z.object({ senha: z.string().min(1, 'Informe a senha'), codigo: z.string().trim().min(1, 'Informe o código') }),
      req.body,
    );
    await confirmarSenha(me.id, senha);
    if (!(await conferirSegundoFator(db, me.id, codigo)))
      throw badRequest('Código incorreto', { codigo: 'Código incorreto' });
    await desativarDoisFatores(db, me.id);
    await addLog(
      db,
      { entidade: 'auth', registro_id: me.id, acao: '2FA desativada', detalhe: me.email },
      actor(req, me),
    );
    res.json(await comEspacos(await loadAuthUser(db, me.id), req.auth));
  });

  router.post('/logout', async (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (token) {
      const s = await resolveSession(db, opts, token);
      if (s) {
        await deleteSession(db, s.sessionId);
        await addLog(
          db,
          { entidade: 'auth', registro_id: s.user.id, acao: 'logout', detalhe: s.user.email },
          actor(req, s.user),
        );
      }
    }
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(false), maxAge: undefined });
    res.status(204).end();
  });

  // Não usa requireAuth: precisa funcionar mesmo quando o usuário deve trocar a senha
  // ---------- Convites (Fase 5B) ----------
  // Públicos: quem recebe o link pode não ter conta. O token é a credencial: vale uma vez, 7 dias, só para o
  // e-mail convidado. Falhas contam no limite por IP (não dá para varrer tokens).
  const convitesPorIp = new RateLimiter(30, 60 * 60_000);
  const conviteToken = (req: Request) => {
    const ip = req.ip ?? 'desconhecido';
    const bloqueado = convitesPorIp.blockedFor(ip);
    if (bloqueado) throw tooMany(bloqueado);
    return String(req.params.token ?? '');
  };
  const contarFalha = async <T>(req: Request, fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof HttpError && e.status === 400) convitesPorIp.hit(req.ip ?? 'desconhecido');
      throw e;
    }
  };

  router.get('/convites/:token', async (req, res) => {
    const token = conviteToken(req);
    const c = await contarFalha(req, () => verConvite(token));
    const logado = req.auth?.user;
    res.json({ ...c, logado_como: logado ? { nome: logado.nome, email: logado.email } : null });
  });

  router.post('/convites/:token/aceitar', async (req, res) => {
    const token = conviteToken(req);
    const logado = req.auth;
    if (logado) {
      const r = await contarFalha(req, () => aceitarConvite(token, { usuario: logado.user }, req.ip));
      await definirEspacoDaSessao(db, logado.sessionId, r.espacoId);
      return res.json({ ok: true, espaco_id: r.espacoId });
    }
    const dados = parse(
      z.object({
        nome: novaContaSchema.shape.nome,
        senha: passwordSchema,
        aceite: z.literal(true, { message: 'É preciso aceitar os termos de uso e a política de privacidade' }),
      }),
      req.body,
    );
    const r = await contarFalha(req, () => aceitarConvite(token, { nova: dados }, req.ip));
    const sessao = await createSession(db, opts, r.usuarioId, {
      lembrar: false,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    await definirEspacoDaSessao(db, sessao.id, r.espacoId);
    await db('usuarios').where({ id: r.usuarioId }).update({ ultimo_acesso: nowLocal() });
    res.cookie(COOKIE_NAME, sessao.token, cookieOptions(false));
    res.json({ ok: true, espaco_id: r.espacoId });
  });

  router.get('/me', async (req, res) => {
    res.json(await comEspacos(userOf(req), req.auth));
  });

  // Troca o espaço em uso nesta sessão (só para um espaço em que o usuário é membro ativo)
  router.post('/espaco', async (req, res) => {
    const u = userOf(req);
    const id = Number((req.body ?? {}).id);
    const espacos = await espacosDoUsuario(u.id);
    const alvo = espacos.find((e) => e.id === id);
    if (!alvo) throw new HttpError(404, 'Espaço não encontrado');
    await sairDoSuporte(u, req.auth!.sessionId, req.ip); // trocar de espaço encerra o suporte
    await definirEspacoDaSessao(db, req.auth!.sessionId, alvo.id);
    await addLog(
      db,
      { entidade: 'auth', registro_id: u.id, acao: 'trocou de espaço', detalhe: alvo.nome },
      actor(req, u),
    );
    res.json({ ...u, espacos, espaco: alvo });
  });

  router.put('/senha', async (req, res) => {
    const me = userOf(req);
    const body = parse(z.object({ atual: z.string().min(1, 'Informe a senha atual'), nova: passwordSchema }), req.body);
    const row = await db('usuarios').where({ id: me.id }).first('senha');
    if (!(await verifyPassword(body.atual, row?.senha))) {
      throw badRequest('Verifique os campos', { atual: 'Senha atual incorreta' });
    }
    if (body.atual === body.nova) {
      throw badRequest('Verifique os campos', { nova: 'A nova senha deve ser diferente da atual' });
    }
    await db('usuarios')
      .where({ id: me.id })
      .update({ senha: await hashPassword(body.nova), trocar_senha: 0, atualizado_em: nowLocal() });
    await deleteUserSessions(db, me.id, req.auth?.sessionId); // encerra as outras sessões
    await addLog(
      db,
      { entidade: 'auth', registro_id: me.id, acao: 'senha alterada', detalhe: me.email },
      actor(req, me),
    );
    res.json(await comEspacos(await loadAuthUser(db, me.id), req.auth));
  });

  router.post('/esqueci', async (req, res) => {
    const blocked = esqueciPorIp.hit(req.ip ?? 'desconhecido');
    if (blocked) throw tooMany(blocked);
    const { email } = parse(z.object({ email: z.string().trim().toLowerCase().min(1, 'Informe o e-mail') }), req.body);

    // Resposta sempre igual, exista ou não o e-mail (não revela quem é cadastrado)
    const resposta = { ok: true };
    if (esqueciPorEmail.hit(email)) return res.json(resposta);

    const user = await db('usuarios').where({ email }).whereIn('ativo', [1, true]).first('id', 'nome', 'email');
    if (user) {
      const token = newToken();
      await db('tokens_senha').insert({
        id: hashToken(token),
        usuario_id: user.id,
        criado_em: nowLocal(),
        expira_em: nowLocal(new Date(Date.now() + RESET_HOURS * 3_600_000)),
      });
      const link = `${opts.appUrl.replace(/\/$/, '')}/redefinir-senha?token=${token}`;
      // falha no envio fica só no log: a resposta continua igual (não revela quem é cadastrado)
      const enviado = await opts.mailer
        .send({
          to: user.email,
          subject: 'Redefinição de senha',
          text:
            `Olá, ${user.nome}.\n\nRecebemos um pedido para redefinir sua senha. ` +
            `Para criar uma nova, acesse o link abaixo (válido por ${RESET_HOURS} hora):\n\n${link}\n\n` +
            'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
        })
        .then(
          () => true,
          () => false,
        );
      await addLog(
        db,
        {
          entidade: 'auth',
          registro_id: user.id,
          acao: enviado ? 'redefinição solicitada' : 'redefinição solicitada (e-mail não enviado)',
          detalhe: email,
        },
        actor(req, user),
      );
    }
    res.json(resposta);
  });

  /** Token válido → registro do token + usuário; senão lança 400 */
  async function findResetToken(token: string) {
    const row = await db('tokens_senha as t')
      .join('usuarios as u', 'u.id', 't.usuario_id')
      .where('t.id', hashToken(token))
      .whereNull('t.usado_em')
      .where('t.expira_em', '>', nowLocal())
      .whereIn('u.ativo', [1, true])
      .first('t.id', 'u.id as usuario_id', 'u.nome', 'u.email');
    if (!row) throw new HttpError(400, 'Link inválido ou expirado. Peça um novo.');
    return row;
  }

  router.post('/redefinir/validar', async (req, res) => {
    const { token } = parse(z.object({ token: z.string().min(1) }), req.body);
    const t = await findResetToken(token);
    res.json({ ok: true, nome: t.nome });
  });

  router.post('/redefinir', async (req, res) => {
    const { token, senha } = parse(z.object({ token: z.string().min(1), senha: passwordSchema }), req.body);
    const t = await findResetToken(token);
    await db.transaction(async (trx) => {
      await trx('usuarios')
        .where({ id: t.usuario_id })
        .update({ senha: await hashPassword(senha), trocar_senha: 0, atualizado_em: nowLocal() });
      await trx('tokens_senha').where({ usuario_id: t.usuario_id }).update({ usado_em: nowLocal() });
    });
    await deleteUserSessions(db, t.usuario_id);
    await addLog(
      db,
      { entidade: 'auth', registro_id: t.usuario_id, acao: 'senha redefinida', detalhe: t.email },
      actor(req, { id: t.usuario_id, nome: t.nome }),
    );
    res.json({ ok: true });
  });

  // ---------- Meu perfil ----------
  /** id público da sessão: começo do hash (suficiente para identificar, inútil para entrar) */
  const publicId = (hash: string) => hash.slice(0, 16);

  router.put('/perfil', async (req, res) => {
    const me = userOf(req);
    const {
      nome = me.nome,
      aparencia,
      tamanho_texto,
    } = parse(
      z.object({
        nome: z.string().trim().min(1, 'Informe o nome').max(120, 'Máximo de 120 caracteres').optional(),
        aparencia: z.enum(APARENCIAS, { error: 'Aparência inválida' }).optional(),
        tamanho_texto: z.enum(TAMANHOS_TEXTO, { error: 'Tamanho inválido' }).optional(),
      }),
      req.body,
    );
    // preferência visual: sem log (não é dado de cadastro)
    if (aparencia && aparencia !== me.aparencia) await db('usuarios').where({ id: me.id }).update({ aparencia });
    if (tamanho_texto && tamanho_texto !== me.tamanho_texto)
      await db('usuarios').where({ id: me.id }).update({ tamanho_texto });
    if (nome !== me.nome) {
      await db('usuarios').where({ id: me.id }).update({ nome, atualizado_em: nowLocal() });
      await atualizarCopias(me.id);
      await addLog(
        db,
        {
          entidade: 'usuarios',
          registro_id: me.id,
          acao: 'alteração',
          detalhe: nome,
          alteracoes: { nome: { de: me.nome, para: nome } },
        },
        actor(req, { id: me.id, nome }),
      );
    }
    res.json(await comEspacos(await loadAuthUser(db, me.id), req.auth));
  });

  router.get('/sessoes', async (req, res) => {
    const me = userOf(req);
    const rows = await db('sessoes')
      .where({ usuario_id: me.id })
      .where('expira_em', '>', nowLocal())
      .orderBy('ultimo_uso', 'desc')
      .select('id', 'lembrar', 'criado_em', 'ultimo_uso', 'ip', 'user_agent');
    res.json(
      rows.map((r) => ({
        ...r,
        id: publicId(r.id),
        atual: r.id === req.auth?.sessionId,
        lembrar: !!r.lembrar,
      })) satisfies SessionInfo[],
    );
  });

  /** Encerra uma sessão específica do próprio usuário */
  router.delete('/sessoes/:id', async (req, res) => {
    const me = userOf(req);
    const id = String(req.params.id);
    if (!/^[0-9a-f]{16}$/.test(id)) throw new HttpError(404, 'Sessão não encontrada');
    const removidas = await db('sessoes').where({ usuario_id: me.id }).where('id', 'like', `${id}%`).del();
    if (!removidas) throw new HttpError(404, 'Sessão não encontrada');
    res.status(204).end();
  });

  /** Encerra todas as outras sessões (mantém a atual) */
  router.delete('/sessoes', async (req, res) => {
    const me = userOf(req);
    const n = await deleteUserSessions(db, me.id, req.auth?.sessionId);
    if (n) {
      await addLog(
        db,
        { entidade: 'auth', registro_id: me.id, acao: 'sessões encerradas', detalhe: `${n} sessão(ões)` },
        actor(req, me),
      );
    }
    res.json({ encerradas: n });
  });

  return router;
}
