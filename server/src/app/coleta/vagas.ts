// =============================================================================
// Vagas publicadas no LinkedIn pelas empresas monitoradas (0.4.3), pelo ator
// `piotrv1001/linkedin-company-jobs-scraper` (sem login; o mesmo do piloto). Uma vez por semana, junto com os dados
// das páginas. Regras:
//   • vagas publicadas nos últimos 30 dias (`postedWithin: r2592000`), sem abrir o detalhe de cada uma (mais barato);
//   • cada vaga vira uma publicação do tipo "Vaga" (`id_externo` = "vaga:<id>"), com assuntos pelo título;
//   • `metricas_empresas.vagas` do dia = quantas vagas a empresa tinha nessa busca (0 se nenhuma).
// =============================================================================
import { classificarAssuntos, normalizarLinkedin } from '@frame/shared';
import type { Db } from '../../db/knex';
import { inserir } from '../../db/knex';
import { nowLocal } from '../../utils/time';
import { atualizarUniversoDasPublicacoes } from '../services/visao';
import { rodarAtor } from './apify';

export const ATOR_VAGAS = 'piotrv1001~linkedin-company-jobs-scraper';

export interface ItemVaga {
  jobId?: string | number | null;
  jobUrl?: string | null;
  title?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  postedDate?: string | null;
  companyUrl?: string | null;
  companySlug?: string | null;
}

export interface ResultadoVagas {
  coleta_id: number;
  fontes: number;
  vagas: number;
  novas: number;
  custo_usd: number | null;
}

const slug = (url: string) => url.split('/company/')[1]?.split('/')[0] ?? '';

export async function coletarVagas(
  db: Db,
  opcoes: { coletaId?: number; runId?: string } = {},
): Promise<ResultadoVagas> {
  const empresas = (await db('empresas')
    .whereIn('monitorar', [1, true])
    .whereNull('excluido_em')
    .where('linkedin_url', 'like', '%/company/%')
    .select('id', 'linkedin_url')) as { id: number; linkedin_url: string }[];
  const coletaId =
    opcoes.coletaId ??
    (await inserir(db('coletas'), {
      inicio: nowLocal(),
      situacao: 'Rodando',
      descricao: 'Vagas publicadas (30 dias)',
      ator: ATOR_VAGAS.replace('~', '/'),
      criado_em: nowLocal(),
    }));
  const r: ResultadoVagas = { coleta_id: coletaId, fontes: empresas.length, vagas: 0, novas: 0, custo_usd: null };
  try {
    if (!empresas.length) throw new Error('Nenhuma empresa monitorada com página do LinkedIn.');
    const { itens, custoUsd } = await rodarAtor<ItemVaga>(
      ATOR_VAGAS,
      {
        companies: empresas.map((e) => e.linkedin_url),
        postedWithin: 'r2592000',
        scrapeJobDetails: false,
        maxItems: 3000,
      },
      {
        runId: opcoes.runId,
        aoIniciar: async (runId) => {
          await db('coletas').where('id', coletaId).update({ run_apify: runId });
        },
      },
    );
    r.custo_usd = custoUsd;
    const porSlug = new Map(empresas.map((e) => [slug(e.linkedin_url), e.id]));
    const contagem = new Map<number, number>(empresas.map((e) => [e.id, 0]));
    const agora = nowLocal();
    for (const v of itens) {
      const url = normalizarLinkedin(v.companyUrl);
      const empresaId = porSlug.get((v.companySlug ?? (url ? slug(url) : '')).toLowerCase());
      if (!empresaId || !v.jobId) continue;
      contagem.set(empresaId, (contagem.get(empresaId) ?? 0) + 1);
      r.vagas++;
      const idExterno = `vaga:${v.jobId}`;
      if (await db('publicacoes').where('id_externo', idExterno).first('id')) continue;
      const titulo = (v.title ?? v.jobTitle ?? 'Vaga').trim();
      await inserir(db('publicacoes'), {
        data_publicacao: v.postedDate?.slice(0, 10) ?? agora.slice(0, 10),
        tipo: 'Vaga',
        empresa_id: empresaId,
        titulo,
        texto: [titulo, v.location].filter(Boolean).join(' · '),
        url: v.jobUrl ?? null,
        post_proprio: true,
        triagem: 'Pendente',
        assuntos: classificarAssuntos(titulo).join('; '),
        fonte_tipo: 'empresa',
        id_externo: idExterno,
        criado_em: agora,
      });
      r.novas++;
    }
    await atualizarUniversoDasPublicacoes(db);
    const hoje = agora.slice(0, 10);
    for (const [empresaId, n] of contagem) {
      const existe = await db('metricas_empresas').where({ empresa_id: empresaId, data: hoje }).first('id');
      if (existe) await db('metricas_empresas').where('id', existe.id).update({ vagas: n, atualizado_em: agora });
      else await inserir(db('metricas_empresas'), { empresa_id: empresaId, data: hoje, vagas: n, criado_em: agora });
    }
    await db('coletas').where('id', coletaId).update({
      fim: nowLocal(),
      situacao: 'Ok',
      fontes: r.fontes,
      itens_encontrados: itens.length,
      itens_novos: r.novas,
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
        erro: e instanceof Error ? e.message : String(e),
      });
    throw e;
  }
}
