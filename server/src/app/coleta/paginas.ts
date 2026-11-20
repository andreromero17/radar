// =============================================================================
// Dados das páginas das empresas (0.4.0): seguidores, funcionários e logo, pelo ator
// `harvestapi/linkedin-company` (sem login). Uma vez por semana (ou pelo botão). Regras:
//   • todas as empresas monitoradas (contas-alvo, concorrentes e "Nós"), fora da lixeira, com página do LinkedIn;
//   • `empresas.seguidores` = valor mais recente; histórico em `metricas_empresas` (um por empresa e dia);
//   • o logo é BAIXADO e guardado em `logo_linkedin` (data URL) porque os links do LinkedIn expiram;
//     o logo enviado pelo usuário (`logo`) continua tendo prioridade nas telas.
// =============================================================================
import { normalizarLinkedin } from '@frame/shared';
import type { Db } from '../../db/knex';
import { inserir } from '../../db/knex';
import { nowLocal } from '../../utils/time';
import { baixarImagem, rodarAtor } from './apify';

export const ATOR_PAGINAS = 'harvestapi~linkedin-company';

export interface ItemPagina {
  universalName?: string | null;
  linkedinUrl?: string | null;
  name?: string | null;
  followerCount?: number | null;
  employeeCount?: number | null;
  logo?: string | null;
  query?: string | { companies?: string } | null;
}

export interface ResultadoPaginas {
  coleta_id: number;
  fontes: number;
  atualizadas: number;
  logos: number;
  custo_usd: number | null;
}

export async function coletarPaginas(
  db: Db,
  opcoes: { coletaId?: number; runId?: string } = {},
): Promise<ResultadoPaginas> {
  const empresas = (await db('empresas')
    .whereIn('monitorar', [1, true])
    .whereNull('excluido_em')
    .whereNotNull('linkedin_url')
    .where('linkedin_url', 'like', '%/company/%')
    .select('id', 'linkedin_url')) as { id: number; linkedin_url: string }[];
  const coletaId =
    opcoes.coletaId ??
    (await inserir(db('coletas'), {
      inicio: nowLocal(),
      situacao: 'Rodando',
      descricao: 'Dados das páginas (seguidores e logos)',
      ator: ATOR_PAGINAS.replace('~', '/'),
      criado_em: nowLocal(),
    }));
  const r: ResultadoPaginas = {
    coleta_id: coletaId,
    fontes: empresas.length,
    atualizadas: 0,
    logos: 0,
    custo_usd: null,
  };
  try {
    if (!empresas.length) throw new Error('Nenhuma empresa monitorada com página do LinkedIn.');
    const { itens, custoUsd } = await rodarAtor<ItemPagina>(
      ATOR_PAGINAS,
      { companies: empresas.map((e) => e.linkedin_url) },
      {
        runId: opcoes.runId,
        aoIniciar: async (runId) => {
          await db('coletas').where('id', coletaId).update({ run_apify: runId });
        },
      },
    );
    r.custo_usd = custoUsd;
    const porUrl = new Map(empresas.map((e) => [e.linkedin_url, e.id]));
    const porSlug = new Map(empresas.map((e) => [e.linkedin_url.split('/company/')[1]?.split('/')[0], e.id]));
    const hoje = nowLocal().slice(0, 10);
    for (const item of itens) {
      const url = normalizarLinkedin(item.linkedinUrl);
      const empresaId =
        (url && porUrl.get(url)) ?? (item.universalName ? porSlug.get(item.universalName.toLowerCase()) : undefined);
      if (!empresaId) continue;
      const dados: Record<string, unknown> = { atualizado_em: nowLocal() };
      if (typeof item.followerCount === 'number') dados.seguidores = item.followerCount;
      if (item.logo) {
        const logo = await baixarImagem(item.logo);
        if (logo) {
          dados.logo_linkedin = logo;
          r.logos++;
        }
      }
      await db('empresas').where('id', empresaId).update(dados);
      if (typeof item.followerCount === 'number' || typeof item.employeeCount === 'number') {
        const linha = { seguidores: item.followerCount ?? null, funcionarios: item.employeeCount ?? null };
        const existe = await db('metricas_empresas').where({ empresa_id: empresaId, data: hoje }).first('id');
        if (existe)
          await db('metricas_empresas')
            .where('id', existe.id)
            .update({ ...linha, atualizado_em: nowLocal() });
        else
          await inserir(db('metricas_empresas'), {
            empresa_id: empresaId,
            data: hoje,
            ...linha,
            criado_em: nowLocal(),
          });
      }
      r.atualizadas++;
    }
    await db('coletas').where('id', coletaId).update({
      fim: nowLocal(),
      situacao: 'Ok',
      fontes: r.fontes,
      itens_encontrados: itens.length,
      itens_novos: r.atualizadas,
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
