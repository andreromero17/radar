// =============================================================================
// Conta da pessoa (Fase 5D): cadastro (aberto ou por convite da plataforma), confirmação de e-mail, baixar meus
// dados (LGPD, portabilidade) e excluir a conta (LGPD, eliminação). Tudo na plataforma; os espaços de que a pessoa
// é a ÚNICA dona saem junto — o banco fica guardado 30 dias (arrependimento/erro) e depois é apagado de vez,
// com os anexos.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { passwordSchema, TERMOS_VERSAO } from '@frame/shared';
import { z } from 'zod';
import { hashPassword } from '../auth/password';
import { hashToken, newToken } from '../auth/tokens';
import { createDb, createPgDb, inserir, listarTabelas, nomeSchema, toDbValue, type Db } from '../db/knex';
import {
  arquivoEspaco,
  comEspaco,
  criarEspaco,
  espacosDoUsuario,
  fecharEspaco,
  plataformaDb,
  schemaEspaco,
  sincronizarUsuarios,
  abrirEspaco,
} from '../espacos';
import { conflict, HttpError } from '../utils/http';
import { nowLocal } from '../utils/time';
import { anexoDir } from './anexos';
import { addLog, type Actor } from './logs';
import type { Mailer } from './mailer';
import { getSettings } from './settings';

export const CONFIRMACAO_HORAS = 24;
export const CONVITE_PLATAFORMA_DIAS = 14;
/** Espaço excluído fica guardado este tempo antes de ser apagado de vez */
export const DIAS_GUARDA_EXCLUIDOS = 30;
/** Cadastro que nunca confirmou o e-mail é apagado depois disto */
const DIAS_CADASTRO_PENDENTE = 7;

const p = () => plataformaDb();
const ativoSim = [1, true];
const email = z.string().trim().toLowerCase().email('E-mail inválido').max(200);

export const cadastroSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome').max(120),
  email,
  senha: passwordSchema,
  espaco: z.string().trim().max(80).optional(),
  aceite: z.literal(true, { message: 'É preciso aceitar os termos de uso e a política de privacidade' }),
  convite: z.string().optional(),
});

interface Envio {
  mailer: Mailer;
  appUrl: string;
}
const link = (envio: Envio, caminho: string) => `${envio.appUrl.replace(/\/$/, '')}${caminho}`;
const nomeSistema = async () => (await getSettings(p())).nome_sistema;

// ---------------------------------------------------------------- convites para testar (beta)

const convitePendente = () =>
  p()('convites_plataforma').whereNull('usado_em').whereNull('cancelado_em').where('expira_em', '>', nowLocal());

export async function listarConvitesPlataforma() {
  return p()('convites_plataforma as c')
    .leftJoin('usuarios as u', 'u.id', 'c.convidado_por')
    .leftJoin('usuarios as n', 'n.id', 'c.usado_por')
    .orderBy('c.id', 'desc')
    .limit(100)
    .select(
      'c.id',
      'c.email',
      'c.criado_em',
      'c.expira_em',
      'c.usado_em',
      'c.cancelado_em',
      'u.nome as convidado_por',
      'n.nome as usado_por',
    );
}

export async function convidarParaTestar(destino: string, actor: Actor & { id: number }, envio: Envio) {
  const e = email.parse(destino);
  if (await p()('usuarios').whereRaw('lower(email) = ?', [e]).first('id'))
    throw conflict('Já existe conta com este e-mail.');
  await convitePendente().clone().where({ email: e }).update({ cancelado_em: nowLocal() });
  const token = newToken();
  await p()('convites_plataforma').insert({
    email: e,
    token: hashToken(token),
    convidado_por: actor.id,
    criado_em: nowLocal(),
    expira_em: nowLocal(new Date(Date.now() + CONVITE_PLATAFORMA_DIAS * 86_400_000)),
  });
  const sistema = await nomeSistema();
  await envio.mailer.send({
    to: e,
    subject: `Convite para testar o ${sistema}`,
    text:
      `Olá!\n\n${actor.nome} convidou você para testar o ${sistema}. ` +
      `Crie sua conta pelo link abaixo (válido por ${CONVITE_PLATAFORMA_DIAS} dias):\n\n` +
      `${link(envio, `/cadastro?convite=${token}`)}\n\nSe não esperava este convite, é só ignorar.`,
  });
  await addLog(p(), { entidade: 'convites', acao: 'convite para testar', detalhe: e }, actor);
}

export async function cancelarConvitePlataforma(id: number, actor: Actor) {
  const c = await convitePendente().clone().where({ id }).first('email');
  if (!c) throw new HttpError(404, 'Convite não encontrado');
  await p()('convites_plataforma').where({ id }).update({ cancelado_em: nowLocal() });
  await addLog(p(), { entidade: 'convites', acao: 'convite para testar cancelado', detalhe: c.email }, actor);
}

async function conviteDoToken(token: string) {
  return (await convitePendente()
    .clone()
    .where({ token: hashToken(String(token)) })
    .first('id', 'email')) as { id: number; email: string } | undefined;
}

export async function verConvitePlataforma(token: string) {
  const c = await conviteDoToken(token);
  if (!c) throw new HttpError(400, 'Convite inválido, expirado ou já usado.');
  return { email: c.email };
}

// ---------------------------------------------------------------- cadastro

/** Perfil de quem se cadastra: o "completo" (Membro) — dono só dos próprios espaços, nada na plataforma */
async function perfilCompleto(): Promise<number> {
  const perfil = await p()('perfis').whereIn('completo', ativoSim).whereNot('admin', 1).orderBy('id').first('id');
  if (!perfil) throw new Error('Perfil "Membro" não encontrado (migrações da plataforma)');
  return Number(perfil.id);
}

const nomeEspaco = (nome?: string) => (nome?.trim() ? nome.trim() : 'Pessoal');

/**
 * Cadastro. Com convite válido (o e-mail é o do convite): conta pronta, primeiro espaço criado, já entra.
 * Sem convite (só com cadastro aberto): conta pendente + e-mail de confirmação. A resposta não revela se o e-mail
 * já tinha conta (quem já tem recebe um aviso por e-mail).
 */
export async function cadastrar(
  dados: z.infer<typeof cadastroSchema>,
  envio: Envio,
  ip?: string,
): Promise<{ entrou: true; usuarioId: number; espacoId: number } | { entrou: false }> {
  const convite = dados.convite ? await conviteDoToken(dados.convite) : undefined;
  if (dados.convite && !convite) throw new HttpError(400, 'Convite inválido, expirado ou já usado.');
  if (convite && convite.email !== dados.email)
    throw new HttpError(422, 'Use o e-mail que recebeu o convite', { email: `O convite é para ${convite.email}` });
  if (!convite && !(await getSettings(p())).cadastro_aberto)
    throw new HttpError(403, 'O cadastro está fechado. Peça um convite.', undefined, 'CADASTRO_FECHADO');

  const sistema = await nomeSistema();
  const existente = await p()('usuarios').whereRaw('lower(email) = ?', [dados.email]).first('id', 'confirmar_email');
  if (existente && !existente.confirmar_email) {
    if (convite) throw conflict('Já existe conta com este e-mail: entre com ela.');
    await envio.mailer.send({
      to: dados.email,
      subject: `Sua conta no ${sistema}`,
      text:
        `Olá!\n\nAlguém (talvez você) tentou criar uma conta com este e-mail, mas ela já existe. ` +
        `Para entrar, use ${link(envio, '/login')}. Esqueceu a senha? ${link(envio, '/esqueci-senha')}`,
    });
    return { entrou: false };
  }

  const agora = nowLocal();
  const linha = {
    nome: dados.nome,
    perfil_id: await perfilCompleto(),
    senha: await hashPassword(dados.senha),
    ativo: toDbValue(p(), true),
    trocar_senha: toDbValue(p(), false),
    confirmar_email: toDbValue(p(), !convite),
    termos_aceitos_em: agora,
    termos_versao: TERMOS_VERSAO,
  };
  let usuarioId: number;
  if (existente) {
    // cadastro pendente refeito: atualiza (nome/senha novos) e manda outro link
    usuarioId = Number(existente.id);
    await p()('usuarios')
      .where({ id: usuarioId })
      .update({ ...linha, atualizado_em: agora });
  } else {
    const id = await inserir(p()('usuarios'), { ...linha, email: dados.email, criado_em: agora });
    usuarioId = Number(id);
  }
  await addLog(
    p(),
    {
      entidade: 'usuarios',
      registro_id: usuarioId,
      acao: convite ? 'cadastro por convite' : 'cadastro',
      detalhe: dados.email,
    },
    { id: usuarioId, nome: dados.nome, ip },
  );

  if (convite) {
    await p()('convites_plataforma').where({ id: convite.id }).update({ usado_em: agora, usado_por: usuarioId });
    const espacoId = await criarEspaco({ nome: nomeEspaco(dados.espaco), tipo: 'pessoal', donoId: usuarioId });
    return { entrou: true, usuarioId, espacoId };
  }

  await p()('tokens_email').where({ usuario_id: usuarioId }).whereNull('usado_em').del();
  const token = newToken();
  await p()('tokens_email').insert({
    id: hashToken(token),
    usuario_id: usuarioId,
    espaco_nome: nomeEspaco(dados.espaco),
    criado_em: agora,
    expira_em: nowLocal(new Date(Date.now() + CONFIRMACAO_HORAS * 3_600_000)),
  });
  await envio.mailer.send({
    to: dados.email,
    subject: `Confirme seu e-mail no ${sistema}`,
    text:
      `Olá, ${dados.nome}!\n\nPara ativar sua conta, confirme o e-mail pelo link abaixo ` +
      `(válido por ${CONFIRMACAO_HORAS} horas):\n\n${link(envio, `/confirmar-email?token=${token}`)}\n\n` +
      'Se não foi você, ignore este e-mail: a conta não é ativada sem a confirmação.',
  });
  return { entrou: false };
}

/** Link de confirmação: ativa a conta e cria o primeiro espaço. Devolve quem entrou */
export async function confirmarEmail(token: string, ip?: string) {
  const t = await p()('tokens_email as t')
    .join('usuarios as u', 'u.id', 't.usuario_id')
    .where('t.id', hashToken(String(token)))
    .whereNull('t.usado_em')
    .where('t.expira_em', '>', nowLocal())
    .first('t.id', 't.espaco_nome', 'u.id as usuario_id', 'u.nome', 'u.email', 'u.confirmar_email');
  if (!t) throw new HttpError(400, 'Link inválido ou expirado. Faça o cadastro de novo para receber outro.');
  const marcado = await p()('tokens_email').where({ id: t.id }).whereNull('usado_em').update({ usado_em: nowLocal() });
  if (!marcado) throw new HttpError(400, 'Este link já foi usado.');
  await p()('usuarios')
    .where({ id: t.usuario_id })
    .update({ confirmar_email: toDbValue(p(), false) });
  let espacoId = (await espacosDoUsuario(t.usuario_id))[0]?.id;
  if (!espacoId)
    espacoId = await criarEspaco({ nome: t.espaco_nome || 'Pessoal', tipo: 'pessoal', donoId: t.usuario_id });
  await addLog(
    p(),
    { entidade: 'usuarios', registro_id: t.usuario_id, acao: 'e-mail confirmado', detalhe: t.email },
    { id: t.usuario_id, nome: t.nome, ip },
  );
  return { usuarioId: Number(t.usuario_id), espacoId };
}

/** Manutenção diária: cadastros que nunca confirmaram o e-mail */
export async function limparCadastrosPendentes() {
  const limite = nowLocal(new Date(Date.now() - DIAS_CADASTRO_PENDENTE * 86_400_000));
  const ids = (
    await p()('usuarios')
      .whereIn('confirmar_email', ativoSim)
      .where('criado_em', '<', limite)
      .whereNotExists(p()('membros').whereRaw('membros.usuario_id = usuarios.id'))
      .select('id')
  ).map((r) => Number(r.id));
  if (ids.length) await p()('usuarios').whereIn('id', ids).del();
  return ids.length;
}

// ---------------------------------------------------------------- baixar meus dados

const SEM_EXPORTAR = new Set(['knex_migrations', 'knex_migrations_lock', 'sessoes', 'tokens_senha', 'sqlite_sequence']);
const limpar = (r: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('segredo_') && k !== 'senha'));

/**
 * Tudo o que é da pessoa: conta, sessões, acessos registrados, espaços e papéis. Dos espaços em que ela é DONA, os
 * dados completos (cada tabela); nos outros, só o que é dela (preferências e avisos) — os dados são do dono.
 * Os arquivos anexos não vão no arquivo (só a lista).
 */
export async function exportarMeusDados(usuarioId: number) {
  const conta = await p()('usuarios').where({ id: usuarioId }).first();
  if (!conta) throw new HttpError(404, 'Conta não encontrada');
  const sessoes = await p()('sessoes')
    .where({ usuario_id: usuarioId })
    .select('criado_em', 'ultimo_uso', 'expira_em', 'ip', 'user_agent');
  const acessos = await p()('logs')
    .where({ usuario_id: usuarioId })
    .orWhere((q) => q.where({ entidade: 'auth', registro_id: usuarioId }))
    .orderBy('id')
    .select('criado_em', 'entidade', 'acao', 'detalhe', 'ip');
  const espacos = [];
  for (const e of await espacosDoUsuario(usuarioId)) {
    const dados = await comEspaco(e.id, async (db) => {
      if (e.papel !== 'dono')
        return {
          preferencias: await db('preferencias').where({ usuario_id: usuarioId }).select(),
          notificacoes: await db('notificacoes').where({ usuario_id: usuarioId }).select(),
        };
      const tabelas = (await listarTabelas(db)).filter((t) => !SEM_EXPORTAR.has(t));
      const out: Record<string, unknown[]> = {};
      for (const t of tabelas) out[t] = ((await db(t).select()) as Record<string, unknown>[]).map(limpar);
      return out;
    });
    espacos.push({ ...e, dados });
  }
  return {
    gerado_em: nowLocal(),
    sistema: await nomeSistema(),
    observacao:
      'Dados da sua conta e dos espaços de que você é dono. Arquivos anexos não estão incluídos (só a lista, na tabela "anexos").',
    conta: limpar(conta as Record<string, unknown>),
    sessoes,
    acessos,
    espacos,
  };
}

// ---------------------------------------------------------------- excluir a conta

/** Espaços em que a pessoa é a única dona ativa: saem junto com a conta */
export async function espacosQueSaemJunto(usuarioId: number) {
  const out: { id: number; nome: string; membros: number }[] = [];
  for (const e of await espacosDoUsuario(usuarioId)) {
    if (e.papel !== 'dono') continue;
    const donos = await p()('membros as m')
      .join('usuarios as u', 'u.id', 'm.usuario_id')
      .where({ 'm.espaco_id': e.id, 'm.papel': 'dono' })
      .whereIn('m.ativo', ativoSim)
      .whereIn('u.ativo', ativoSim)
      .whereNot('m.usuario_id', usuarioId)
      .count({ n: '*' })
      .first();
    if (Number(donos?.n ?? 0)) continue;
    const membros = await p()('membros')
      .where({ espaco_id: e.id })
      .whereNot({ usuario_id: usuarioId })
      .count({ n: '*' })
      .first();
    out.push({ id: e.id, nome: e.nome, membros: Number(membros?.n ?? 0) });
  }
  return out;
}

/** Tira o espaço do ar: fecha, guarda o banco em `excluidos/` (30 dias) e apaga o registro na plataforma */
export async function excluirEspaco(espacoId: number, motivo: string) {
  const esp = await p()('espacos').where({ id: espacoId }).first('nome');
  if (!esp) return;
  await fecharEspaco(espacoId);
  const arquivo = arquivoEspaco(espacoId);
  let guardado: string | null = null;
  if (arquivo && fs.existsSync(arquivo)) {
    const pasta = path.join(path.dirname(arquivo), '..', 'espacos-excluidos');
    fs.mkdirSync(pasta, { recursive: true });
    guardado = path.join(pasta, `${espacoId}-${Date.now()}.db`);
    fs.renameSync(arquivo, guardado);
    for (const ext of ['-wal', '-shm']) if (fs.existsSync(arquivo + ext)) fs.rmSync(arquivo + ext);
  }
  // Postgres: o schema é renomeado (fica fora de qualquer search_path de espaço) até ser apagado de vez
  const schema = schemaEspaco(espacoId);
  if (schema) {
    const novo = nomeSchema(`excluido_${espacoId}_${Date.now()}`);
    await p().raw('alter schema ?? rename to ??', [schema, novo]);
    guardado = `pg:${novo}`;
  }
  await p()('sessoes').where({ espaco_id: espacoId }).update({ espaco_id: null, suporte_id: null });
  await p()('espacos').where({ id: espacoId }).del(); // membros, convites e liberações de suporte vão junto
  await p()('espacos_excluidos').insert({
    espaco_id: espacoId,
    nome: esp.nome,
    arquivo: guardado,
    motivo,
    excluido_em: nowLocal(),
  });
}

/** Manutenção diária: apaga de vez (banco + anexos) os espaços excluídos há mais de 30 dias */
export async function apagarEspacosExcluidos(dias = DIAS_GUARDA_EXCLUIDOS) {
  const limite = nowLocal(new Date(Date.now() - dias * 86_400_000));
  const lista = await p()('espacos_excluidos').whereNull('apagado_em').where('excluido_em', '<', limite).select();
  const apagarAnexos = async (db: Db) => {
    if (!(await db.schema.hasTable('anexos'))) return;
    for (const a of (await db('anexos').select('entidade', 'arquivo')) as { entidade: string; arquivo: string }[]) {
      const f = path.join(anexoDir(), a.entidade, a.arquivo);
      if (fs.existsSync(f)) fs.rmSync(f);
    }
  };
  for (const e of lista) {
    if (typeof e.arquivo === 'string' && e.arquivo.startsWith('pg:')) {
      const schema = nomeSchema(e.arquivo.slice(3));
      const url = (p().client.config.connection as string) ?? '';
      const db = createPgDb(url, schema, { max: 1 });
      try {
        await apagarAnexos(db);
      } finally {
        await db.destroy();
      }
      await p().raw('drop schema if exists ?? cascade', [schema]);
    } else if (e.arquivo && fs.existsSync(e.arquivo)) {
      const db = createDb(e.arquivo);
      try {
        await apagarAnexos(db);
      } finally {
        await db.destroy();
      }
      fs.rmSync(e.arquivo, { force: true });
    }
    await p()('espacos_excluidos').where({ id: e.id }).update({ apagado_em: nowLocal(), arquivo: null });
  }
  return lista.length;
}

const ANONIMO = '(conta excluída)';

/**
 * Exclui a conta: espaços de que é a única dona saem (guardados 30 dias); nos outros, sai da lista de membros e o
 * nome some dos registros; logs da plataforma ficam sem nome/e-mail; a conta é apagada.
 */
export async function excluirConta(usuarioId: number, envio: Envio | null, ip?: string) {
  const u = await p()('usuarios as u')
    .join('perfis as pf', 'pf.id', 'u.perfil_id')
    .where('u.id', usuarioId)
    .first('u.id', 'u.nome', 'u.email', 'pf.admin');
  if (!u) throw new HttpError(404, 'Conta não encontrada');
  if (u.admin) {
    const outros = await p()('usuarios as u')
      .join('perfis as pf', 'pf.id', 'u.perfil_id')
      .whereIn('pf.admin', ativoSim)
      .whereIn('u.ativo', ativoSim)
      .whereNot('u.id', usuarioId)
      .count({ n: '*' })
      .first();
    if (!Number(outros?.n))
      throw conflict('Você é o único administrador: passe a administração para outra conta antes.');
  }

  const saem = await espacosQueSaemJunto(usuarioId);
  for (const e of saem) await excluirEspaco(e.id, `conta do dono excluída`);

  // espaços que continuam (de outras pessoas): sai da lista e o nome some da cópia e dos registros
  for (const e of await espacosDoUsuario(usuarioId).then((l) => l.map((x) => x.id))) {
    const esp = await p()('espacos').where({ id: e }).first('dono_id');
    if (esp?.dono_id === usuarioId) {
      const outro = await p()('membros')
        .where({ espaco_id: e, papel: 'dono' })
        .whereNot({ usuario_id: usuarioId })
        .first('usuario_id');
      await p()('espacos')
        .where({ id: e })
        .update({ dono_id: outro?.usuario_id ?? null });
    }
  }
  const restantes = (await p()('membros').where({ usuario_id: usuarioId }).select('espaco_id')).map((r) =>
    Number(r.espaco_id),
  );
  await p()('membros').where({ usuario_id: usuarioId }).del();
  for (const e of restantes) {
    const db = await abrirEspaco(e);
    await sincronizarUsuarios(e, db);
    await db('usuarios')
      .where({ id: usuarioId })
      .update({ nome: ANONIMO, email: `excluido-${usuarioId}@invalid` });
    await db('notificacoes').where({ usuario_id: usuarioId }).del();
    await db('preferencias').where({ usuario_id: usuarioId }).del();
    await db('logs').where({ usuario_id: usuarioId }).update({ usuario: ANONIMO });
  }

  // plataforma: logs sem nome/e-mail, convites e feedbacks sem dado pessoal, e a conta sai
  const logs = await p()('logs')
    .where({ usuario_id: usuarioId })
    .orWhere('detalhe', 'like', `%${u.email}%`)
    .select('id', 'detalhe');
  for (const l of logs)
    await p()('logs')
      .where({ id: l.id })
      .update({
        usuario: ANONIMO,
        detalhe: String(l.detalhe ?? '')
          .split(u.email)
          .join('(e-mail removido)'),
      });
  await p()('logs').where({ usuario_id: usuarioId }).update({ usuario_id: null });
  await p()('convites').whereRaw('lower(email) = ?', [u.email.toLowerCase()]).del();
  await p()('convites_plataforma').whereRaw('lower(email) = ?', [u.email.toLowerCase()]).del();
  await p()('feedbacks').where({ usuario_id: usuarioId }).update({ nome: null, email: null });
  await p()('espacos').where({ dono_id: usuarioId }).update({ dono_id: null });
  await p()('usuarios').where({ id: usuarioId }).del(); // sessões, tokens e desafios vão junto
  await addLog(
    p(),
    {
      entidade: 'usuarios',
      acao: 'conta excluída pelo titular',
      detalhe: `${saem.length} espaço(s) excluído(s) junto`,
    },
    { id: null, nome: ANONIMO, ip },
  );

  if (envio)
    await envio.mailer
      .send({
        to: u.email,
        subject: `Sua conta no ${await nomeSistema()} foi excluída`,
        text:
          `Olá, ${u.nome}.\n\nSua conta foi excluída, como você pediu.` +
          (saem.length
            ? ` Os espaços ${saem.map((e) => `"${e.nome}"`).join(', ')} também saíram e serão apagados de vez em ${DIAS_GUARDA_EXCLUIDOS} dias. ` +
              'Se foi um engano, responda este e-mail antes disso.'
            : '') +
          '\n\nObrigado por ter usado o sistema.',
      })
      .catch(() => {});
  return { espacos_excluidos: saem.map((e) => e.nome) };
}

// ---------------------------------------------------------------- feedback

export const feedbackSchema = z.object({
  tipo: z.enum(['sugestao', 'problema', 'elogio'], { message: 'Tipo inválido' }),
  mensagem: z.string().trim().min(3, 'Escreva sua mensagem').max(4000, 'Máximo de 4.000 caracteres'),
  pagina: z.string().max(300).optional(),
  versao: z.string().max(40).optional(),
});

export async function registrarFeedback(
  user: { id: number; nome: string; email: string },
  dados: z.infer<typeof feedbackSchema>,
  navegador: string | undefined,
  envio: Envio | null,
) {
  const id = await inserir(p()('feedbacks'), {
    usuario_id: user.id,
    nome: user.nome,
    email: user.email,
    tipo: dados.tipo,
    mensagem: dados.mensagem,
    pagina: dados.pagina ?? null,
    navegador: navegador?.slice(0, 300) ?? null,
    versao: dados.versao ?? null,
    criado_em: nowLocal(),
  });
  // avisa os administradores por e-mail (sem travar a resposta se o e-mail falhar)
  if (envio) {
    const admins = await p()('usuarios as u')
      .join('perfis as pf', 'pf.id', 'u.perfil_id')
      .whereIn('pf.admin', ativoSim)
      .whereIn('u.ativo', ativoSim)
      .pluck('u.email');
    const rotulo = { sugestao: 'Sugestão', problema: 'Problema', elogio: 'Elogio' }[dados.tipo];
    for (const to of admins as string[])
      void envio.mailer
        .send({
          to,
          subject: `${rotulo} de ${user.nome}`,
          text: `${user.nome} (${user.email}) enviou um feedback${dados.pagina ? ` na página ${dados.pagina}` : ''}:\n\n${dados.mensagem}\n\nVeja em ${link(envio, '/plataforma')}`,
        })
        .catch(() => {});
  }
  return Number(id);
}

export const listarFeedbacks = () => p()('feedbacks').orderBy('id', 'desc').limit(300).select();
