import { Router, type CookieOptions, type Request, type Response } from 'express';
import { z } from 'zod';
import { passwordSchema, toFieldErrors } from '@frame/shared';
import { COOKIE_NAME, parseCookies, userOf } from '../auth/middleware';
import { hashPassword, verifyPassword } from '../auth/password';
import { minutes, RateLimiter } from '../auth/rateLimit';
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  loadAuthUser,
  resolveSession,
  type SessionConfig,
} from '../auth/sessions';
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
const GENERIC_LOGIN_ERROR = 'E-mail ou senha inválidos.';

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
 */
export function authRouter(db: Db, opts: AuthOptions) {
  const router = Router();

  // Limites de tentativa (por instância do servidor)
  const loginPorIp = new RateLimiter(30, 15 * 60_000);
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
    const blockedIp = loginPorIp.hit(ip);
    if (blockedIp) throw tooMany(blockedIp);

    const { email, senha, lembrar } = parse(loginSchema, req.body);
    const blockedEmail = falhasPorEmail.blockedFor(email);
    if (blockedEmail) throw tooMany(blockedEmail);

    const user = await db('usuarios').where({ email }).first('id', 'nome', 'senha', 'ativo');
    const ok = await verifyPassword(senha, user?.senha); // sempre gasta o mesmo tempo
    if (!user || !ok) {
      falhasPorEmail.hit(email);
      await addLog(db, { entidade: 'auth', acao: 'login falhou', detalhe: email }, actor(req, user));
      throw new HttpError(401, GENERIC_LOGIN_ERROR);
    }
    if (!user.ativo) throw new HttpError(403, 'Usuário inativo. Fale com o administrador do sistema.');

    falhasPorEmail.reset(email);
    const { token } = await createSession(db, opts, user.id, {
      lembrar,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    await db('usuarios').where({ id: user.id }).update({ ultimo_acesso: nowLocal() });
    await addLog(db, { entidade: 'auth', registro_id: user.id, acao: 'login', detalhe: email }, actor(req, user));

    res.cookie(COOKIE_NAME, token, cookieOptions(lembrar));
    res.json(await loadAuthUser(db, user.id));
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
  router.get('/me', (req, res) => {
    res.json(userOf(req));
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
    res.json(await loadAuthUser(db, me.id));
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
      await opts.mailer.send({
        to: user.email,
        subject: 'Redefinição de senha',
        text:
          `Olá, ${user.nome}.\n\nRecebemos um pedido para redefinir sua senha. ` +
          `Para criar uma nova, acesse o link abaixo (válido por ${RESET_HOURS} hora):\n\n${link}\n\n` +
          'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
      });
      await addLog(
        db,
        { entidade: 'auth', registro_id: user.id, acao: 'redefinição solicitada', detalhe: email },
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

  return router;
}
