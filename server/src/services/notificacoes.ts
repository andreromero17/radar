// =============================================================================
// Notificações (Fase 4C): tipos de alerta registrados pelo sistema, geração idempotente
// por usuário (uma notificação por chave), preferências e resumo por e-mail.
// O sistema registra os seus em server/src/app/paineis.ts (junto dos painéis) ou onde
// preferir, com registerAlerta; exemplo no módulo de demonstração.
// =============================================================================
import {
  can,
  type Action,
  type AuthUser,
  type NivelNotificacao,
  type Notificacao,
  type PrefNotificacoes,
  type TipoAlertaInfo,
} from '@frame/shared';
import type { Db } from '../db/knex';
import { loadAuthUser } from '../auth/sessions';
import { espacoAtivoOuNulo, espacoDoBanco, membrosAtivos, plataformaDb } from '../espacos';
import { nowLocal } from '../utils/time';
import type { Mailer } from './mailer';

/** Um aviso que o alerta encontrou agora */
export interface AlertaGerado {
  /** Identidade do aviso: a mesma chave nunca gera duas notificações para o mesmo usuário */
  chave: string;
  titulo: string;
  mensagem?: string | null;
  link?: string | null;
  /** Sobrepõe o nível/ícone do tipo para este aviso */
  nivel?: NivelNotificacao;
  icone?: string | null;
}

export interface AlertaDef {
  rotulo: string;
  descricao: string;
  /** Só usuários com a permissão recebem (e veem o tipo nas preferências) */
  perm?: [string, Action];
  nivel?: NivelNotificacao;
  icone?: string;
  /** O que merece aviso agora. `hoje` = 'AAAA-MM-DD' local */
  gerar(db: Db, ctx: { hoje: string }): Promise<AlertaGerado[]>;
}

const alertas = new Map<string, AlertaDef>();

export function registerAlerta(tipo: string, def: AlertaDef) {
  alertas.set(tipo, def);
}

const PREF_CHAVE = 'notificacoes';
const PREF_PADRAO: PrefNotificacoes = { desligados: [], email: false };

export async function lerPrefNotificacoes(db: Db, usuarioId: number): Promise<PrefNotificacoes> {
  const row = await db('preferencias').where({ usuario_id: usuarioId, chave: PREF_CHAVE }).first('valor');
  if (!row?.valor) return { ...PREF_PADRAO };
  const v = JSON.parse(row.valor) as Partial<PrefNotificacoes>;
  return {
    desligados: Array.isArray(v.desligados) ? v.desligados.map(String) : [],
    email: v.email === true,
  };
}

export async function gravarPrefNotificacoes(db: Db, usuarioId: number, pref: PrefNotificacoes) {
  await db('preferencias')
    .insert({ usuario_id: usuarioId, chave: PREF_CHAVE, valor: JSON.stringify(pref), atualizado_em: nowLocal() })
    .onConflict(['usuario_id', 'chave'])
    .merge(['valor', 'atualizado_em']);
}

const pode = (user: AuthUser, def: AlertaDef) => !def.perm || can(user, def.perm[0], def.perm[1]);

export function tiposAlerta(user: AuthUser): TipoAlertaInfo[] {
  return [...alertas.entries()]
    .filter(([, d]) => pode(user, d))
    .map(([tipo, d]) => ({ tipo, rotulo: d.rotulo, descricao: d.descricao, icone: d.icone ?? null }));
}

export interface ResultadoVerificacao {
  /** Notificações criadas agora, por usuário */
  novas: Map<number, Notificacao[]>;
  total: number;
}

/**
 * Roda os alertas no banco do ESPAÇO `db` e grava o que for novo. Sem `usuarioId`: todos os membros ativos do
 * espaço (manutenção diária). Os alertas rodam uma vez (os dados são do espaço); cada membro recebe só os tipos
 * que pode ver e não desligou. Usuários e permissões vêm da plataforma.
 */
export async function verificarAlertas(
  db: Db,
  opts: { usuarioId?: number; hoje?: string; espacoId?: number } = {},
): Promise<ResultadoVerificacao> {
  const hoje = opts.hoje ?? nowLocal().slice(0, 10);
  const espacoId = opts.espacoId ?? espacoAtivoOuNulo()?.espacoId ?? espacoDoBanco(db);
  if (espacoId == null) throw new Error('verificarAlertas: espaço desconhecido');
  const membros = await membrosAtivos(espacoId);
  const ids = opts.usuarioId ? membros.filter((id) => id === opts.usuarioId) : membros;
  const usuarios = (await Promise.all(ids.map((id) => loadAuthUser(plataformaDb(), id)))).filter(
    (u): u is AuthUser => !!u,
  );
  const novas = new Map<number, Notificacao[]>();
  let total = 0;
  if (!usuarios.length || !alertas.size) return { novas, total };

  const prefs = new Map(
    await Promise.all(usuarios.map(async (u) => [u.id, await lerPrefNotificacoes(db, u.id)] as const)),
  );
  for (const [tipo, def] of alertas) {
    const destino = usuarios.filter((u) => pode(u, def) && !prefs.get(u.id)!.desligados.includes(tipo));
    if (!destino.length) continue;
    let avisos: AlertaGerado[];
    try {
      avisos = await def.gerar(db, { hoje });
    } catch {
      continue; // um alerta com problema não derruba os outros
    }
    if (!avisos.length) continue;
    const chaves = avisos.map((a) => `${tipo}|${a.chave}`.slice(0, 250));
    for (const u of destino) {
      const ja = new Set(
        (await db('notificacoes').where({ usuario_id: u.id }).whereIn('chave', chaves).select('chave')).map(
          (r) => r.chave as string,
        ),
      );
      for (let i = 0; i < avisos.length; i++) {
        if (ja.has(chaves[i])) continue;
        const a = avisos[i];
        const linha = {
          usuario_id: u.id,
          tipo,
          chave: chaves[i],
          nivel: a.nivel ?? def.nivel ?? 'info',
          titulo: a.titulo.slice(0, 200),
          mensagem: a.mensagem ?? null,
          link: a.link ?? null,
          icone: a.icone ?? def.icone ?? null,
          criada_em: nowLocal(),
          lida_em: null,
        };
        const [id] = await db('notificacoes').insert(linha).onConflict(['usuario_id', 'chave']).ignore();
        if (!id) continue;
        novas.set(u.id, [...(novas.get(u.id) ?? []), { id: Number(id), ...linha } as Notificacao]);
        total++;
      }
    }
  }
  return { novas, total };
}

/** Um e-mail por usuário (que pediu) com as notificações novas */
export async function enviarResumos(
  db: Db,
  mailer: Mailer,
  novas: Map<number, Notificacao[]>,
  appUrl: string,
  sistema: string,
): Promise<number> {
  let enviados = 0;
  for (const [usuarioId, lista] of novas) {
    if (!lista.length || !(await lerPrefNotificacoes(db, usuarioId)).email) continue;
    const u = await db('usuarios').where({ id: usuarioId }).first('email', 'nome');
    if (!u?.email) continue;
    const base = appUrl.replace(/\/$/, '');
    const linhas = lista.map(
      (n) => `• ${n.titulo}${n.mensagem ? ` — ${n.mensagem}` : ''}${n.link ? `\n  ${base}${n.link}` : ''}`,
    );
    await mailer.send({
      to: u.email,
      subject: `${sistema}: ${lista.length === 1 ? lista[0].titulo : `${lista.length} novos avisos`}`,
      text: `Olá, ${String(u.nome).split(' ')[0]}!\n\n${linhas.join('\n\n')}\n\nVer todas: ${base}/notificacoes\nPara parar de receber por e-mail, desligue em Notificações → Preferências.`,
    });
    enviados++;
  }
  return enviados;
}

/** Apaga notificações lidas há mais de `dias` (e não lidas há mais de 3× isso) */
export async function purgeNotificacoes(db: Db, dias = 90): Promise<number> {
  const corte = nowLocal(new Date(Date.now() - dias * 86_400_000));
  const corteNaoLidas = nowLocal(new Date(Date.now() - dias * 3 * 86_400_000));
  return db('notificacoes')
    .where((w) => w.where('lida_em', '<', corte).orWhere('criada_em', '<', corteNaoLidas))
    .del();
}
