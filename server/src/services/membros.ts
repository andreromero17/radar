// =============================================================================
// Membros e convites dos espaços (Fase 5B). Tudo na PLATAFORMA (quem participa de qual espaço); o registro de
// cada mudança vai para o log do próprio espaço, que o dono vê.
//
//   papéis: dono (tudo, inclusive membros) · editor (altera os dados, conforme o perfil) · leitor (só vê)
//   regra:  todo espaço tem ao menos um DONO ativo
//   convite: link único por e-mail (token só no e-mail; aqui fica o hash), vale 7 dias, uma vez só, e só para a
//            conta com aquele e-mail
// =============================================================================
import {
  PAPEIS,
  PAPEL_LABELS,
  TERMOS_VERSAO,
  TIPOS_ESPACO,
  toFieldErrors,
  type ConviteInfo,
  type ConvitePublico,
  type MembroInfo,
  type Papel,
} from '@frame/shared';
import { z } from 'zod';
import { hashToken, newToken } from '../auth/tokens';
import { hashPassword } from '../auth/password';
import { toDbValue } from '../db/knex';
import {
  abrirEspaco,
  adicionarMembro,
  comEspaco,
  criarEspaco,
  espacosDoUsuario,
  plataformaDb,
  sincronizarUsuarios,
} from '../espacos';
import { badRequest, conflict, HttpError } from '../utils/http';
import { nowLocal } from '../utils/time';
import { addLog, type Actor } from './logs';
import type { Mailer } from './mailer';

export const CONVITE_DIAS = 7;
/** Espaços que uma pessoa pode criar (proteção contra abuso até haver planos) */
export const MAX_ESPACOS_POR_DONO = 20;

const p = () => plataformaDb();
const ativoSim = [1, true];
const papelSchema = z.enum(PAPEIS, { message: 'Papel inválido' });
const emailSchema = z.string().trim().toLowerCase().email('E-mail inválido').max(200);

export const conviteSchema = z.object({ email: emailSchema, papel: papelSchema });
export const alterarMembroSchema = z
  .object({ papel: papelSchema.optional(), ativo: z.boolean().optional() })
  .refine((d) => d.papel != null || d.ativo != null, 'Nada para alterar');
export const espacoSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(80),
  tipo: z.enum(TIPOS_ESPACO, { message: 'Tipo inválido' }),
});

async function logEspaco(espacoId: number, acao: string, detalhe: string, actor: Actor, registroId?: number) {
  await comEspaco(espacoId, (db) =>
    addLog(db, { entidade: 'membros', registro_id: registroId ?? null, acao, detalhe }, actor),
  );
}

// ---------------------------------------------------------------- membros

export async function listarMembros(espacoId: number): Promise<MembroInfo[]> {
  const rows = (await p()('membros as m')
    .join('usuarios as u', 'u.id', 'm.usuario_id')
    .where('m.espaco_id', espacoId)
    .orderBy([{ column: 'm.ativo', order: 'desc' }, 'u.nome'])
    .select('m.usuario_id', 'u.nome', 'u.email', 'm.papel', 'm.ativo', 'u.ativo as conta_ativa', 'm.criado_em')) as {
    usuario_id: number;
    nome: string;
    email: string;
    papel: Papel;
    ativo: unknown;
    conta_ativa: unknown;
    criado_em: string;
  }[];
  return rows.map((r) => ({
    usuario_id: r.usuario_id,
    nome: r.nome,
    email: r.email,
    papel: r.papel,
    ativo: !!r.ativo,
    conta_ativa: !!r.conta_ativa,
    desde: r.criado_em,
  }));
}

/** Donos ativos (membro e conta ativos), opcionalmente fingindo uma mudança num membro */
async function donosAtivos(
  espacoId: number,
  mudanca?: { usuarioId: number; papel?: Papel; ativo?: boolean; sai?: boolean },
) {
  const lista = await listarMembros(espacoId);
  return lista.filter((m) => {
    if (mudanca && m.usuario_id === mudanca.usuarioId) {
      if (mudanca.sai) return false;
      const papel = mudanca.papel ?? m.papel;
      const ativo = mudanca.ativo ?? m.ativo;
      return papel === 'dono' && ativo && m.conta_ativa;
    }
    return m.papel === 'dono' && m.ativo && m.conta_ativa;
  });
}

const SEM_DONO = 'O espaço precisa de ao menos um dono ativo. Torne outro membro dono antes.';

async function membroOu404(espacoId: number, usuarioId: number) {
  const m = (await listarMembros(espacoId)).find((x) => x.usuario_id === usuarioId);
  if (!m) throw new HttpError(404, 'Membro não encontrado');
  return m;
}

/** Atualiza a cópia leve dos usuários no banco do espaço (nome, ativo) */
async function ressincronizar(espacoId: number) {
  await sincronizarUsuarios(espacoId, await abrirEspaco(espacoId));
}

export async function alterarMembro(
  espacoId: number,
  usuarioId: number,
  dados: { papel?: Papel; ativo?: boolean },
  actor: Actor,
): Promise<MembroInfo> {
  const m = await membroOu404(espacoId, usuarioId);
  if (!(await donosAtivos(espacoId, { usuarioId, ...dados })).length) throw conflict(SEM_DONO);
  const mudou: string[] = [];
  const upd: Record<string, unknown> = {};
  if (dados.papel && dados.papel !== m.papel) {
    upd.papel = dados.papel;
    mudou.push(`papel: ${PAPEL_LABELS[m.papel]} → ${PAPEL_LABELS[dados.papel]}`);
  }
  if (dados.ativo != null && dados.ativo !== m.ativo) {
    upd.ativo = toDbValue(p(), dados.ativo);
    mudou.push(dados.ativo ? 'reativado' : 'inativado');
  }
  if (mudou.length) {
    await p()('membros').where({ espaco_id: espacoId, usuario_id: usuarioId }).update(upd);
    await ressincronizar(espacoId);
    await logEspaco(espacoId, 'membro alterado', `${m.nome} (${m.email}): ${mudou.join(', ')}`, actor, usuarioId);
  }
  return membroOu404(espacoId, usuarioId);
}

/** Remove o membro (ou o próprio usuário saindo). Os registros que ele criou continuam no espaço. */
export async function removerMembro(espacoId: number, usuarioId: number, actor: Actor) {
  const m = await membroOu404(espacoId, usuarioId);
  if (!(await donosAtivos(espacoId, { usuarioId, sai: true })).length) throw conflict(SEM_DONO);
  await p()('membros').where({ espaco_id: espacoId, usuario_id: usuarioId }).del();
  // o "dono" de referência do espaço passa para outro dono
  const esp = await p()('espacos').where({ id: espacoId }).first('dono_id');
  if (esp?.dono_id === usuarioId) {
    const outro = (await donosAtivos(espacoId))[0];
    await p()('espacos')
      .where({ id: espacoId })
      .update({ dono_id: outro?.usuario_id ?? null });
  }
  await ressincronizar(espacoId);
  // o que era só dele neste espaço sai junto (avisos e preferências de tela)
  await comEspaco(espacoId, async (db) => {
    await db('notificacoes').where({ usuario_id: usuarioId }).del();
    await db('preferencias').where({ usuario_id: usuarioId }).del();
  });
  const saiu = actor.id === usuarioId;
  await logEspaco(espacoId, saiu ? 'saiu do espaço' : 'membro removido', `${m.nome} (${m.email})`, actor, usuarioId);
}

// ---------------------------------------------------------------- convites

const pendentes = (espacoId: number) =>
  p()('convites').where({ espaco_id: espacoId }).whereNull('aceito_em').whereNull('cancelado_em');

export async function listarConvites(espacoId: number): Promise<ConviteInfo[]> {
  const agora = nowLocal();
  const rows = (await pendentes(espacoId)
    .clone()
    .leftJoin('usuarios as u', 'u.id', 'convites.convidado_por')
    .orderBy('convites.criado_em', 'desc')
    .select(
      'convites.id',
      'convites.email',
      'convites.papel',
      'u.nome as convidado_por',
      'convites.criado_em',
      'convites.expira_em',
    )) as Omit<ConviteInfo, 'expirado'>[];
  return rows.map((r) => ({ ...r, expirado: r.expira_em <= agora }));
}

interface EnvioConvite {
  mailer: Mailer;
  appUrl: string;
}

async function enviarEmailConvite(
  envio: EnvioConvite,
  dados: { email: string; papel: Papel; token: string; espaco: string; quem: string },
) {
  const link = `${envio.appUrl.replace(/\/$/, '')}/convite/${dados.token}`;
  await envio.mailer.send({
    to: dados.email,
    subject: `Convite para o espaço "${dados.espaco}"`,
    text:
      `Olá!\n\n${dados.quem} convidou você para participar do espaço "${dados.espaco}" ` +
      `como ${PAPEL_LABELS[dados.papel].toLowerCase()}.\n\n` +
      `Para aceitar, acesse o link abaixo (válido por ${CONVITE_DIAS} dias):\n\n${link}\n\n` +
      'Se você não esperava este convite, é só ignorar este e-mail.',
  });
}

const expiraEm = () => nowLocal(new Date(Date.now() + CONVITE_DIAS * 86_400_000));

export async function convidar(
  espacoId: number,
  dados: { email: string; papel: Papel },
  actor: Actor & { id: number },
  envio: EnvioConvite,
): Promise<ConviteInfo> {
  const email = dados.email.trim().toLowerCase();
  const membro = (await listarMembros(espacoId)).find((m) => m.email.toLowerCase() === email);
  if (membro)
    throw conflict(
      membro.ativo
        ? `${membro.nome} já participa deste espaço.`
        : `${membro.nome} já é membro, mas está inativo: reative na lista de membros.`,
    );
  const esp = await p()('espacos').where({ id: espacoId }).first('nome');
  // um convite pendente por e-mail: o novo substitui o anterior
  await pendentes(espacoId).clone().where({ email }).update({ cancelado_em: nowLocal() });
  const token = newToken();
  const [id] = await p()('convites').insert({
    espaco_id: espacoId,
    email,
    papel: dados.papel,
    token: hashToken(token),
    convidado_por: actor.id,
    criado_em: nowLocal(),
    expira_em: expiraEm(),
  });
  await enviarEmailConvite(envio, { email, papel: dados.papel, token, espaco: esp.nome, quem: actor.nome });
  await logEspaco(espacoId, 'convite enviado', `${email} como ${PAPEL_LABELS[dados.papel].toLowerCase()}`, actor);
  return (await listarConvites(espacoId)).find((c) => c.id === Number(id))!;
}

async function conviteOu404(espacoId: number, id: number) {
  const c = await pendentes(espacoId).clone().where({ id }).first();
  if (!c) throw new HttpError(404, 'Convite não encontrado');
  return c as { id: number; email: string; papel: Papel };
}

export async function reenviarConvite(
  espacoId: number,
  id: number,
  actor: Actor & { id: number },
  envio: EnvioConvite,
) {
  const c = await conviteOu404(espacoId, id);
  const esp = await p()('espacos').where({ id: espacoId }).first('nome');
  // link novo (o antigo deixa de valer) e prazo renovado
  const token = newToken();
  await p()('convites')
    .where({ id })
    .update({ token: hashToken(token), expira_em: expiraEm() });
  await enviarEmailConvite(envio, { email: c.email, papel: c.papel, token, espaco: esp.nome, quem: actor.nome });
  await logEspaco(espacoId, 'convite reenviado', c.email, actor);
}

export async function cancelarConvite(espacoId: number, id: number, actor: Actor) {
  const c = await conviteOu404(espacoId, id);
  await p()('convites').where({ id }).update({ cancelado_em: nowLocal() });
  await logEspaco(espacoId, 'convite cancelado', c.email, actor);
}

/** Convite válido pelo token do link (pendente e no prazo); senão 400 */
async function conviteDoToken(token: string) {
  const c = await p()('convites as c')
    .join('espacos as e', 'e.id', 'c.espaco_id')
    .leftJoin('usuarios as u', 'u.id', 'c.convidado_por')
    .where('c.token', hashToken(String(token)))
    .whereNull('c.aceito_em')
    .whereNull('c.cancelado_em')
    .where('c.expira_em', '>', nowLocal())
    .whereIn('e.ativo', ativoSim)
    .first(
      'c.id',
      'c.espaco_id',
      'c.email',
      'c.papel',
      'c.expira_em',
      'e.nome as espaco',
      'e.tipo',
      'u.nome as convidado_por',
    );
  if (!c) throw new HttpError(400, 'Convite inválido, expirado ou já usado. Peça um novo a quem convidou você.');
  return c as {
    id: number;
    espaco_id: number;
    email: string;
    papel: Papel;
    expira_em: string;
    espaco: string;
    tipo: string;
    convidado_por: string | null;
  };
}

export async function verConvite(token: string): Promise<ConvitePublico> {
  const c = await conviteDoToken(token);
  const conta = await p()('usuarios').whereRaw('lower(email) = ?', [c.email]).first('id');
  return {
    espaco: c.espaco,
    tipo: c.tipo,
    email: c.email,
    papel: c.papel,
    convidado_por: c.convidado_por,
    expira_em: c.expira_em,
    tem_conta: !!conta,
  };
}

/** Perfil de quem entra por convite: o primeiro com "acesso completo aos dados" (cria o "Membro" se faltar) */
async function perfilDeConvidado(): Promise<number> {
  const perfil = await p()('perfis').whereIn('completo', ativoSim).whereNot('admin', 1).orderBy('id').first('id');
  if (perfil) return Number(perfil.id);
  const [id] = await p()('perfis').insert({
    nome: `Membro ${Date.now()}`.slice(0, 60),
    descricao: 'Dados dos espaços em que participa, conforme o papel',
    admin: toDbValue(p(), false),
    completo: toDbValue(p(), true),
    permissoes: '{}',
    criado_em: nowLocal(),
  });
  return Number(id);
}

export const novaContaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome').max(120),
});

/**
 * Aceita o convite. Com `usuario` (logado): só se o e-mail for o do convite. Sem: cria a conta (nome + senha já
 * validados) — se já existir conta com o e-mail, é preciso entrar antes (401 CONVITE_LOGIN).
 * Devolve o usuário e o espaço em que ele entrou.
 */
export async function aceitarConvite(
  token: string,
  quem: { usuario: { id: number; nome: string; email: string } } | { nova: { nome: string; senha: string } },
  ip?: string,
): Promise<{ usuarioId: number; espacoId: number }> {
  const c = await conviteDoToken(token);
  let usuarioId: number;
  let nome: string;
  if ('usuario' in quem) {
    if (quem.usuario.email.toLowerCase() !== c.email.toLowerCase())
      throw new HttpError(403, `Este convite é para ${c.email}. Entre com essa conta para aceitar.`);
    usuarioId = quem.usuario.id;
    nome = quem.usuario.nome;
  } else {
    const existe = await p()('usuarios').whereRaw('lower(email) = ?', [c.email]).first('id');
    if (existe)
      throw new HttpError(401, 'Já existe uma conta com este e-mail: entre para aceitar.', undefined, 'CONVITE_LOGIN');
    const [id] = await p()('usuarios').insert({
      nome: quem.nova.nome,
      email: c.email,
      perfil_id: await perfilDeConvidado(),
      senha: await hashPassword(quem.nova.senha),
      ativo: toDbValue(p(), true),
      trocar_senha: toDbValue(p(), false),
      termos_aceitos_em: nowLocal(),
      termos_versao: TERMOS_VERSAO,
      criado_em: nowLocal(),
    });
    usuarioId = Number(id);
    nome = quem.nova.nome;
    await addLog(
      p(),
      { entidade: 'usuarios', registro_id: usuarioId, acao: 'conta criada por convite', detalhe: c.email },
      { id: usuarioId, nome, ip },
    );
  }
  // marca o convite antes (uma vez só, mesmo com dois cliques ao mesmo tempo)
  const marcados = await p()('convites')
    .where({ id: c.id })
    .whereNull('aceito_em')
    .update({ aceito_em: nowLocal(), aceito_por: usuarioId });
  if (!marcados) throw new HttpError(400, 'Este convite já foi usado.');

  const atual = await p()('membros').where({ espaco_id: c.espaco_id, usuario_id: usuarioId }).first('ativo');
  if (atual?.ativo) {
    // já participa: o convite não muda o papel (nem rebaixa um dono)
  } else await adicionarMembro(c.espaco_id, usuarioId, c.papel);
  await ressincronizar(c.espaco_id);
  await logEspaco(
    c.espaco_id,
    'convite aceito',
    `${nome} (${c.email}) entrou como ${PAPEL_LABELS[c.papel].toLowerCase()}`,
    { id: usuarioId, nome, ip },
    usuarioId,
  );
  return { usuarioId, espacoId: c.espaco_id };
}

// ---------------------------------------------------------------- espaços

/** Pode criar espaços: administrador ou quem já é dono de algum (o assinante) */
export async function podeCriarEspaco(user: { id: number; admin: boolean }) {
  if (user.admin) return true;
  return (await espacosDoUsuario(user.id)).some((e) => e.papel === 'dono');
}

export async function criarEspacoDoUsuario(
  user: { id: number; nome: string; admin: boolean },
  dados: { nome: string; tipo: string },
  ip?: string,
): Promise<number> {
  if (!(await podeCriarEspaco(user))) throw new HttpError(403, 'Você não pode criar espaços.');
  const meus = await p()('espacos').where({ dono_id: user.id }).count({ n: '*' }).first();
  if (Number(meus?.n ?? 0) >= MAX_ESPACOS_POR_DONO)
    throw conflict(`Limite de ${MAX_ESPACOS_POR_DONO} espaços por pessoa.`);
  const id = await criarEspaco({ nome: dados.nome, tipo: dados.tipo, donoId: user.id });
  await logEspaco(id, 'espaço criado', `${dados.nome} (${dados.tipo})`, { id: user.id, nome: user.nome, ip });
  return id;
}

export async function alterarEspaco(espacoId: number, dados: { nome: string; tipo: string }, actor: Actor) {
  const antes = await p()('espacos').where({ id: espacoId }).first('nome', 'tipo');
  if (!antes) throw new HttpError(404, 'Espaço não encontrado');
  await p()('espacos').where({ id: espacoId }).update({ nome: dados.nome, tipo: dados.tipo });
  if (antes.nome !== dados.nome || antes.tipo !== dados.tipo)
    await logEspaco(espacoId, 'espaço alterado', `${antes.nome} → ${dados.nome} (${dados.tipo})`, actor);
}

export const lerOuFalhar = <T extends z.ZodType>(schema: T, body: unknown): z.infer<T> => {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw badRequest(r.error.issues[0]?.message ?? 'Verifique os campos', toFieldErrors(r.error));
  return r.data;
};
