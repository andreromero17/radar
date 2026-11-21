// =============================================================================
// Coleta de posts do LinkedIn (0.3.0): páginas das empresas e perfis das pessoas monitoradas, num só run do ator
// `harvestapi/linkedin-company-posts` (sem login). Regras (docs/app/CLAUDE.md):
//   • só empresas/pessoas com "monitorar", fora da lixeira e com o endereço do LinkedIn;
//   • desde a última coleta de posts bem-sucedida menos 1 dia (primeira vez: 30 dias); até `coleta_max_posts` por
//     fonte. Fonte sem `historico_posts_em` ganha os 30 dias num run à parte e é marcada quando a coleta termina
//     bem (0.4.5; antes era pela data de cadastro, o que deixava sem histórico quem já tinha passado por uma coleta
//     curta). Fonte que já tem post com mais de 20 dias é marcada sem gastar run;
//   • repost = chave `repost:e<empresa>:<id>` / `repost:p<pessoa>:<id>` (0.4.9), com `original_id` e o
//     `autor_linkedin` do post original — assim dá para saber quais posts das pessoas a empresa repostou;
//   • conferência de autoria: post do próprio dono da fonte = post próprio; de outro autor COM cabeçalho de repost
//     = repost (post_proprio falso); de outro autor sem cabeçalho = descartado (contado em `coletas.descartados`);
//   • idempotente: publicação pelo `id_externo` (id do post); de novo = só atualiza curtidas/comentários;
//   • empresa ganha o logo do LinkedIn (`logo_linkedin`); pessoa ganha o título do perfil (`titulo_linkedin`) e,
//     se o título mudou desde a última coleta, um alerta "Troca de cargo".
// =============================================================================
import { ASSUNTO_CARREIRA, classificarAssuntos, normalizarLinkedin } from '@frame/shared';
import type { Db } from '../../db/knex';
import { inserir } from '../../db/knex';
import { getAppSetting } from '../../services/settings';
import { nowLocal } from '../../utils/time';
import { registrarTrocaDeEmprego } from '../services/carreira';
import { atualizarUniversoDasPublicacoes } from '../services/visao';
import { rodarAtor } from './apify';

export const ATOR_POSTS = 'harvestapi~linkedin-company-posts';

export interface ItemPost {
  id?: string;
  linkedinUrl?: string;
  content?: string | null;
  author?: {
    universalName?: string | null;
    publicIdentifier?: string | null;
    type?: string | null;
    name?: string | null;
    linkedinUrl?: string | null;
    info?: string | null;
    avatar?: { url?: string | null } | null;
  } | null;
  postedAt?: { date?: string | null; timestamp?: number | null } | string | null;
  engagement?: { likes?: number | null; comments?: number | null; shares?: number | null } | null;
  header?: { text?: string | null } | null;
  query?: { targetUrl?: string | null } | null;
}

interface Fonte {
  tipo: 'empresa' | 'pessoa';
  id: number;
  url: string;
  /** slug do endereço: /company/<slug> ou /in/<slug> */
  slug: string;
  empresa_id: number | null;
  titulo_linkedin?: string | null;
  nome: string;
  historico_posts_em?: string | null;
}

export interface ResultadoColeta {
  coleta_id: number;
  fontes: number;
  encontrados: number;
  novos: number;
  atualizados: number;
  descartados: number;
  alertas: number;
  custo_usd: number | null;
}

const slugDe = (url: string) =>
  url.replace(/^https:\/\/www\.linkedin\.com\/(company|in|school|showcase)\//, '').split('/')[0];

/** Id do post: o `id` do ator ou o número da "activity" no endereço */
export function idDoPost(item: ItemPost): string | null {
  if (item.id) return String(item.id);
  const m = /activity[-:](\d+)/.exec(item.linkedinUrl ?? '');
  return m ? m[1] : null;
}

/** O autor do item é o dono da fonte? (página da empresa ou perfil da pessoa) */
export function autorEhDaFonte(item: ItemPost, fonte: Pick<Fonte, 'url' | 'slug'>): boolean {
  const a = item.author ?? {};
  const ids = [a.universalName, a.publicIdentifier].filter(Boolean).map((s) => String(s).toLowerCase());
  if (ids.includes(fonte.slug)) return true;
  const url = normalizarLinkedin(a.linkedinUrl);
  return !!url && url === fonte.url;
}

const dataDo = (item: ItemPost): string | null => {
  const p = item.postedAt;
  const s = typeof p === 'string' ? p : (p?.date ?? (p?.timestamp ? new Date(p.timestamp).toISOString() : null));
  return s ? s.slice(0, 10) : null;
};
const tituloDo = (texto: string) => {
  const linha =
    texto
      .split('\n')
      .find((l) => l.trim())
      ?.trim() ?? '';
  return linha.length > 140 ? `${linha.slice(0, 140)}…` : linha || '(sem texto)';
};

async function fontesDoEspaco(db: Db): Promise<Fonte[]> {
  const empresas = (await db('empresas')
    .whereIn('monitorar', [1, true])
    .whereNull('excluido_em')
    .whereNotNull('linkedin_url')
    .select('id', 'linkedin_url', 'nome', 'historico_posts_em')) as {
    id: number;
    linkedin_url: string;
    nome: string;
    historico_posts_em: string | null;
  }[];
  const pessoas = (await db('pessoas')
    .whereIn('monitorar', [1, true])
    .whereNull('excluido_em')
    .whereNotNull('linkedin_url')
    .select('id', 'linkedin_url', 'empresa_id', 'titulo_linkedin', 'nome', 'historico_posts_em')) as {
    id: number;
    linkedin_url: string;
    empresa_id: number | null;
    titulo_linkedin: string | null;
    nome: string;
    historico_posts_em: string | null;
  }[];
  return [
    ...empresas.map((e) => ({
      tipo: 'empresa' as const,
      id: e.id,
      url: e.linkedin_url,
      slug: slugDe(e.linkedin_url),
      empresa_id: e.id,
      nome: e.nome,
      historico_posts_em: e.historico_posts_em,
    })),
    ...pessoas.map((p) => ({
      tipo: 'pessoa' as const,
      id: p.id,
      url: p.linkedin_url,
      slug: slugDe(p.linkedin_url),
      empresa_id: p.empresa_id,
      titulo_linkedin: p.titulo_linkedin,
      nome: p.nome,
      historico_posts_em: p.historico_posts_em,
    })),
  ];
}

/** Data a partir da qual buscar: última coleta OK menos 1 dia; sem nenhuma, 30 dias atrás */
/** Início da última coleta de POSTS bem-sucedida (as de páginas e vagas não contam) */
async function ultimaColetaOk(db: Db): Promise<string | null> {
  const ultima = (await db('coletas')
    .where('situacao', 'Ok')
    .where('ator', ATOR_POSTS.replace('~', '/'))
    .orderBy('inicio', 'desc')
    .first('inicio')) as { inicio: string } | undefined;
  return ultima?.inicio ?? null;
}
/**
 * Fonte sem a marca de histórico que já tem post com data até `limite` (passou por coletas antes da 0.4.5 e o
 * histórico veio) é marcada sem novo run. As outras ficam sem marca e entram no grupo dos 30 dias.
 */
async function marcarQuemJaTemHistorico(db: Db, fontes: Fonte[], limite: string) {
  const agora = nowLocal();
  for (const tipo of ['empresa', 'pessoa'] as const) {
    const ids = fontes.filter((f) => f.tipo === tipo && !f.historico_posts_em).map((f) => f.id);
    if (!ids.length) continue;
    const q = db('publicacoes').where('tipo', 'Post').where('data_publicacao', '<=', limite);
    if (tipo === 'empresa') q.whereNull('pessoa_id').whereIn('empresa_id', ids).distinct('empresa_id as id');
    else q.whereIn('pessoa_id', ids).distinct('pessoa_id as id');
    const comHistorico = ((await q) as { id: number }[]).map((r) => Number(r.id));
    if (!comHistorico.length) continue;
    await db(tipo === 'empresa' ? 'empresas' : 'pessoas')
      .whereIn('id', comHistorico)
      .update({ historico_posts_em: agora });
    for (const f of fontes) if (f.tipo === tipo && comHistorico.includes(f.id)) f.historico_posts_em = agora;
  }
}
const diaMenos = (base: Date, dias: number) => new Date(base.getTime() - dias * 86_400_000).toISOString().slice(0, 10);

/**
 * Roda a coleta de posts do espaço do `db`. Grava a execução em `coletas` (Rodando → Ok/Erro) e devolve os números.
 * `coletaId` permite que a rota já tenha criado a linha "Rodando" e devolvido o id na hora.
 */
export async function coletarPosts(
  db: Db,
  opcoes: { coletaId?: number; hoje?: Date; runId?: string } = {},
): Promise<ResultadoColeta> {
  const hoje = opcoes.hoje ?? new Date();
  const fontes = await fontesDoEspaco(db);
  const coletaId =
    opcoes.coletaId ??
    (await inserir(db('coletas'), {
      inicio: nowLocal(),
      situacao: 'Rodando',
      descricao: 'Posts do LinkedIn',
      ator: ATOR_POSTS.replace('~', '/'),
      criado_em: nowLocal(),
    }));
  const r: ResultadoColeta = {
    coleta_id: coletaId,
    fontes: fontes.length,
    encontrados: 0,
    novos: 0,
    atualizados: 0,
    descartados: 0,
    alertas: 0,
    custo_usd: null,
  };
  try {
    if (!fontes.length) throw new Error('Nenhuma empresa ou pessoa monitorada com endereço do LinkedIn.');
    const maxPosts = Number(await getAppSetting(db, 'coleta_max_posts')) || 20;
    const ultima = await ultimaColetaOk(db);
    const trintaDias = diaMenos(hoje, 30);
    await marcarQuemJaTemHistorico(db, fontes, diaMenos(hoje, 20));
    // sem histórico: 30 dias; as outras, desde a última coleta (com 1 dia de folga)
    const novas = fontes.filter((f) => !ultima || !f.historico_posts_em);
    const antigas = fontes.filter((f) => !novas.includes(f));
    const grupos = opcoes.runId
      ? [{ fontes, desde: trintaDias }]
      : [
          { fontes: novas, desde: trintaDias },
          { fontes: antigas, desde: ultima ? diaMenos(new Date(`${ultima.slice(0, 10)}T00:00:00Z`), 1) : trintaDias },
        ].filter((g) => g.fontes.length);
    const semHistorico = opcoes.runId ? fontes.filter((f) => !f.historico_posts_em) : novas;
    const itens: ItemPost[] = [];
    for (const g of grupos) {
      const run = await rodarAtor<ItemPost>(
        ATOR_POSTS,
        {
          targetUrls: g.fontes.map((f) => f.url),
          maxPosts,
          postedLimitDate: g.desde,
          includeReposts: true,
          includeQuotePosts: true,
          scrapeReactions: false,
          scrapeComments: false,
        },
        {
          runId: opcoes.runId,
          aoIniciar: async (runId) => {
            await db('coletas').where('id', coletaId).update({ run_apify: runId });
          },
        },
      );
      itens.push(...run.itens);
      if (run.custoUsd != null) r.custo_usd = (r.custo_usd ?? 0) + run.custoUsd;
    }
    r.encontrados = itens.length;
    const porUrl = new Map(fontes.map((f) => [f.url, f]));
    const agora = nowLocal();
    const titulos = new Map<number, string>();
    const logos = new Map<number, string>();

    for (const item of itens) {
      const fonte = porUrl.get(normalizarLinkedin(item.query?.targetUrl) ?? '');
      const idExterno = idDoPost(item);
      if (!fonte || !idExterno) {
        r.descartados++;
        continue;
      }
      const proprio = autorEhDaFonte(item, fonte);
      if (!proprio && !item.header?.text) {
        r.descartados++;
        continue;
      }
      if (proprio && fonte.tipo === 'pessoa' && item.author?.info) titulos.set(fonte.id, item.author.info.trim());
      if (proprio && fonte.tipo === 'empresa' && item.author?.avatar?.url) logos.set(fonte.id, item.author.avatar.url);

      const engajamento = {
        curtidas: item.engagement?.likes ?? null,
        comentarios: item.engagement?.comments ?? null,
        compartilhamentos: item.engagement?.shares ?? null,
      };
      // repost tem chave própria por fonte: o post original (de uma pessoa monitorada, por exemplo) entra à parte
      const chave = proprio ? idExterno : `repost:${fonte.tipo === 'pessoa' ? 'p' : 'e'}${fonte.id}:${idExterno}`;
      const autorLinkedin = normalizarLinkedin(item.author?.linkedinUrl) ?? null;
      const existente = (await db('publicacoes').where('id_externo', chave).first('id')) as { id: number } | undefined;
      if (existente) {
        await db('publicacoes')
          .where('id', existente.id)
          .update({
            ...engajamento,
            ...(autorLinkedin ? { autor_linkedin: autorLinkedin } : {}),
            atualizado_em: agora,
          });
        r.atualizados++;
        continue;
      }
      const texto = (item.content ?? '').trim();
      const assuntos = classificarAssuntos(texto, 3, { daPessoa: fonte.tipo === 'pessoa' && proprio });
      const novoId = await inserir(db('publicacoes'), {
        data_publicacao: dataDo(item),
        tipo: 'Post',
        empresa_id: fonte.empresa_id,
        pessoa_id: fonte.tipo === 'pessoa' ? fonte.id : null,
        autor: item.author?.name ?? null,
        autor_linkedin: autorLinkedin,
        original_id: proprio ? null : idExterno,
        titulo: tituloDo(texto),
        texto,
        url: item.linkedinUrl ?? null,
        post_proprio: proprio,
        ...engajamento,
        triagem: 'Pendente',
        assuntos: assuntos.join('; '),
        fonte_tipo: fonte.tipo,
        id_externo: chave,
        criado_em: agora,
      });
      r.novos++;
      if (assuntos.includes(ASSUNTO_CARREIRA) && (await registrarTrocaDeEmprego(db, novoId))) r.alertas++;
    }

    await atualizarUniversoDasPublicacoes(db);
    for (const [empresaId, url] of logos) await db('empresas').where('id', empresaId).update({ logo_linkedin: url });
    for (const [pessoaId, titulo] of titulos) {
      const f = fontes.find((x) => x.tipo === 'pessoa' && x.id === pessoaId)!;
      if (f.titulo_linkedin && f.titulo_linkedin !== titulo) {
        const chave = `coleta:titulo:${pessoaId}:${titulo}`.slice(0, 250);
        if (!(await db('alertas_cadastro').where('chave', chave).first('id'))) {
          await inserir(db('alertas_cadastro'), {
            tipo: 'Troca de cargo',
            pessoa_id: pessoaId,
            empresa_id: f.empresa_id,
            detalhe: `O título no LinkedIn mudou de "${f.titulo_linkedin}" para "${titulo}".`,
            sugestao: 'Conferir se mudou de cargo ou de empresa e atualizar o Pipedrive.',
            situacao: 'Aberto',
            chave,
            criado_em: agora,
          });
          r.alertas++;
        }
      }
      await db('pessoas').where('id', pessoaId).update({ titulo_linkedin: titulo });
    }

    for (const tipo of ['empresa', 'pessoa'] as const) {
      const ids = semHistorico.filter((f) => f.tipo === tipo).map((f) => f.id);
      if (ids.length)
        await db(tipo === 'empresa' ? 'empresas' : 'pessoas')
          .whereIn('id', ids)
          .update({ historico_posts_em: agora });
    }

    await db('coletas').where('id', coletaId).update({
      fim: nowLocal(),
      situacao: 'Ok',
      fontes: r.fontes,
      itens_encontrados: r.encontrados,
      itens_novos: r.novos,
      descartados: r.descartados,
      custo_usd: r.custo_usd,
      erro: null,
      atualizado_em: nowLocal(),
    });
    return r;
  } catch (e) {
    await db('coletas')
      .where('id', coletaId)
      .update({
        fim: nowLocal(),
        situacao: 'Erro',
        fontes: r.fontes,
        custo_usd: r.custo_usd,
        erro: e instanceof Error ? e.message : String(e),
        atualizado_em: nowLocal(),
      });
    throw e;
  }
}
