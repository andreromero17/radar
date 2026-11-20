// =============================================================================
// Apollo (0.4.6): enriquecer empresas e sugerir pessoas relevantes. Regras (docs/app/CLAUDE.md):
//   • enriquecer = `organizations/enrich` pelo domínio do site (1 crédito por empresa); grava os campos apollo_* e
//     só completa site/LinkedIn quando vazios no Radar;
//   • buscar pessoas = `mixed_people/api_search` pelo domínio (0 crédito; sobrenome abreviado, sem LinkedIn); entra
//     como SUGESTÃO só quem tem área relevante (`areaDoCargo`: Executivo, TI, Marketing, Comercial, RH); quem já foi
//     sugerido (mesmo apollo_id) não volta, nem o descartado;
//   • aprovar = `people/bulk_match` só das aprovadas (créditos por pessoa; NUNCA e-mail nem telefone) → vira pessoa
//     monitorada do Radar com o LinkedIn (se o LinkedIn já existe no Radar, só liga a sugestão a ela). Nada vai para
//     o Pipedrive (decisão do André, 20/11/2026).
// =============================================================================
import { areaDoCargo, normalizarLinkedin } from '@frame/shared';
import type { Db } from '../../db/knex';
import { inserir } from '../../db/knex';
import { nowLocal } from '../../utils/time';
import { siteLimpo } from '../coleta/paginas';
import { nivelDoCargo } from '../pipedrive/sincronizar';
import { clienteApollo, ErroApollo } from './cliente';

export { apolloConfigurado, definirContextoApollo, ErroApollo } from './cliente';

/** Senioridades pedidas ao Apollo (o filtro por área é feito aqui, pelo cargo) */
export const SENIORIDADES_APOLLO = ['owner', 'founder', 'c_suite', 'partner', 'vp', 'head', 'director', 'manager'];
const PAGINAS_BUSCA = 3; // até 300 pessoas por empresa
const LOTE_ENRIQUECER_PESSOAS = 10; // limite do bulk_match

/** Domínio para o Apollo: site sem protocolo, www e caminho */
export const dominioDo = (site: string | null | undefined) => siteLimpo(site)?.split('/')[0]?.toLowerCase() || null;

interface Empresa {
  id: number;
  nome: string;
  site: string | null;
  linkedin_url: string | null;
  universo: string;
}

interface OrgApollo {
  id?: string;
  name?: string;
  website_url?: string | null;
  linkedin_url?: string | null;
  estimated_num_employees?: number | null;
  industry?: string | null;
  annual_revenue_printed?: string | null;
  organization_revenue_printed?: string | null;
  founded_year?: number | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  total_funding_printed?: string | null;
  technology_names?: string[] | null;
  current_technologies?: { name?: string }[] | null;
  short_description?: string | null;
}

async function empresa(db: Db, id: number): Promise<Empresa> {
  const e = (await db('empresas')
    .where('id', id)
    .whereNull('excluido_em')
    .first('id', 'nome', 'site', 'linkedin_url', 'universo')) as Empresa | undefined;
  if (!e) throw new ErroApollo('Empresa não encontrada.');
  return e;
}

// ---------------------------------------------------------------- empresas

export async function enriquecerEmpresa(db: Db, id: number) {
  const e = await empresa(db, id);
  const dominio = dominioDo(e.site);
  if (!dominio) throw new ErroApollo(`${e.nome}: sem site cadastrado (o Apollo procura a empresa pelo domínio).`);
  const r = await clienteApollo().get<{ organization?: OrgApollo | null }>('/organizations/enrich', {
    domain: dominio,
  });
  const o = r.organization;
  if (!o || !o.id) throw new ErroApollo(`${e.nome}: o Apollo não encontrou empresa com o domínio ${dominio}.`);
  const tecnologias = (
    o.technology_names?.length ? o.technology_names : (o.current_technologies ?? []).map((t) => t.name)
  )
    .filter(Boolean)
    .slice(0, 60)
    .join(', ');
  const dados: Record<string, unknown> = {
    apollo_org_id: o.id,
    apollo_funcionarios: o.estimated_num_employees ?? null,
    apollo_setor: o.industry ?? null,
    apollo_faturamento: o.annual_revenue_printed ?? o.organization_revenue_printed ?? null,
    apollo_fundacao: o.founded_year ?? null,
    apollo_local: [o.city, o.state, o.country].filter(Boolean).join(', ') || null,
    apollo_investimento: o.total_funding_printed ?? null,
    apollo_tecnologias: tecnologias || null,
    apollo_descricao: o.short_description ?? null,
    apollo_enriquecido_em: nowLocal(),
    atualizado_em: nowLocal(),
  };
  // completa só o que está vazio no Radar
  if (!e.linkedin_url && o.linkedin_url) {
    const li = normalizarLinkedin(o.linkedin_url);
    if (li && !(await db('empresas').where('linkedin_url', li).first('id'))) dados.linkedin_url = li;
  }
  await db('empresas').where('id', id).update(dados);
  return { id, nome: e.nome, funcionarios: o.estimated_num_employees ?? null };
}

/** Enriquecer todas as empresas do universo ainda não enriquecidas (ou há mais de `dias`) e com site */
export async function enriquecerUniverso(db: Db, universo: string, dias = 90) {
  const corte = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
  const lista = (await db('empresas')
    .where('universo', universo)
    .whereNull('excluido_em')
    .whereIn('monitorar', [1, true])
    .where((q) => q.whereNull('apollo_enriquecido_em').orWhere('apollo_enriquecido_em', '<', corte))
    .orderBy('nome')
    .select('id', 'nome', 'site')) as { id: number; nome: string; site: string | null }[];
  const r = { enriquecidas: 0, sem_site: [] as string[], erros: [] as string[] };
  for (const e of lista) {
    if (!dominioDo(e.site)) {
      r.sem_site.push(e.nome);
      continue;
    }
    try {
      await enriquecerEmpresa(db, e.id);
      r.enriquecidas++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // chave ou créditos: não adianta seguir
      if (/chave|créditos|MESTRA|Limite/.test(msg)) throw err;
      r.erros.push(msg);
    }
  }
  return r;
}

/** Quantas empresas do universo seriam enriquecidas (= créditos) */
export async function aEnriquecer(db: Db, universo: string, dias = 90) {
  const corte = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
  const lista = (await db('empresas')
    .where('universo', universo)
    .whereNull('excluido_em')
    .whereIn('monitorar', [1, true])
    .where((q) => q.whereNull('apollo_enriquecido_em').orWhere('apollo_enriquecido_em', '<', corte))
    .select('site')) as { site: string | null }[];
  return lista.filter((e) => dominioDo(e.site)).length;
}

// ---------------------------------------------------------------- pessoas

interface PessoaBusca {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  last_name_obfuscated?: string | null;
  name?: string | null;
  title?: string | null;
}

/** Busca no Apollo as pessoas relevantes da empresa e grava as novas como sugestões (sem custo) */
export async function buscarPessoas(db: Db, id: number) {
  const e = await empresa(db, id);
  const dominio = dominioDo(e.site);
  if (!dominio) throw new ErroApollo(`${e.nome}: sem site cadastrado (o Apollo procura a empresa pelo domínio).`);
  const api = clienteApollo();
  const encontradas: PessoaBusca[] = [];
  for (let page = 1; page <= PAGINAS_BUSCA; page++) {
    const r = await api.post<{ people?: PessoaBusca[]; total_entries?: number }>('/mixed_people/api_search', {
      q_organization_domains_list: [dominio],
      person_seniorities: SENIORIDADES_APOLLO,
      per_page: 100,
      page,
    });
    const pessoas = r.people ?? [];
    encontradas.push(...pessoas);
    if (pessoas.length < 100 || (r.total_entries != null && page * 100 >= r.total_entries)) break;
  }
  const res = { encontradas: encontradas.length, novas: 0, ja_sugeridas: 0, fora_do_perfil: 0 };
  const agora = nowLocal();
  for (const p of encontradas) {
    if (!p.id) continue;
    const area = areaDoCargo(p.title);
    if (!area) {
      res.fora_do_perfil++;
      continue;
    }
    if (await db('sugestoes_pessoas').where('apollo_id', p.id).first('id')) {
      res.ja_sugeridas++;
      continue;
    }
    const nome =
      [p.first_name, p.last_name ?? p.last_name_obfuscated].filter(Boolean).join(' ').trim() || p.name || '(sem nome)';
    await inserir(db('sugestoes_pessoas'), {
      empresa_id: id,
      nome,
      cargo: p.title ?? null,
      area,
      situacao: 'Sugerida',
      apollo_id: p.id,
      criado_em: agora,
      atualizado_em: agora,
    });
    res.novas++;
  }
  return res;
}

/** Buscar pessoas de todas as empresas do universo com site (sem custo) */
export async function buscarPessoasUniverso(db: Db, universo: string) {
  const lista = (await db('empresas')
    .where('universo', universo)
    .whereNull('excluido_em')
    .whereIn('monitorar', [1, true])
    .orderBy('nome')
    .select('id', 'nome', 'site')) as { id: number; nome: string; site: string | null }[];
  const r = { empresas: 0, novas: 0, sem_site: [] as string[], erros: [] as string[] };
  for (const e of lista) {
    if (!dominioDo(e.site)) {
      r.sem_site.push(e.nome);
      continue;
    }
    try {
      r.novas += (await buscarPessoas(db, e.id)).novas;
      r.empresas++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/chave|créditos|MESTRA|Limite/.test(msg)) throw err;
      r.erros.push(msg);
    }
  }
  return r;
}

interface Match {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
}

/**
 * Aprova sugestões: enriquece no Apollo (nome completo e LinkedIn — sem e-mail nem telefone) e cadastra como pessoas
 * monitoradas do Radar. Se o LinkedIn já está cadastrado (inclusive na lixeira), só liga a sugestão à pessoa.
 */
export async function aprovarSugestoes(db: Db, ids: number[]) {
  const sugestoes = (await db('sugestoes_pessoas')
    .whereIn('id', ids)
    .where('situacao', 'Sugerida')
    .select('id', 'empresa_id', 'nome', 'cargo', 'apollo_id')) as {
    id: number;
    empresa_id: number | null;
    nome: string;
    cargo: string | null;
    apollo_id: string;
  }[];
  const r = { cadastradas: 0, ja_existiam: 0, sem_linkedin: 0 };
  const api = clienteApollo();
  for (let i = 0; i < sugestoes.length; i += LOTE_ENRIQUECER_PESSOAS) {
    const lote = sugestoes.slice(i, i + LOTE_ENRIQUECER_PESSOAS);
    const resp = await api.post<{ matches?: (Match | null)[] }>(
      '/people/bulk_match',
      {},
      {
        details: lote.map((s) => ({ id: s.apollo_id })),
        reveal_personal_emails: false,
        reveal_phone_number: false,
      },
    );
    const porId = new Map((resp.matches ?? []).filter((m): m is Match => !!m?.id).map((m) => [m.id!, m]));
    const agora = nowLocal();
    for (const s of lote) {
      const m = porId.get(s.apollo_id);
      const linkedin = normalizarLinkedin(m?.linkedin_url);
      const nome = (m?.name || [m?.first_name, m?.last_name].filter(Boolean).join(' ')).trim() || s.nome;
      const cargo = m?.title ?? s.cargo;
      let pessoaId: number | null = null;
      if (linkedin) {
        const existente = (await db('pessoas').where('linkedin_url', linkedin).first('id')) as
          { id: number } | undefined;
        if (existente) {
          pessoaId = existente.id;
          r.ja_existiam++;
        }
      } else r.sem_linkedin++;
      if (!pessoaId) {
        pessoaId = await inserir(db('pessoas'), {
          nome,
          empresa_id: s.empresa_id,
          cargo,
          nivel: nivelDoCargo(cargo),
          prioridade: 'Média',
          linkedin_url: linkedin,
          monitorar: true,
          criado_em: agora,
          atualizado_em: agora,
        });
        r.cadastradas++;
      }
      await db('sugestoes_pessoas')
        .where('id', s.id)
        .update({ situacao: 'Aprovada', pessoa_id: pessoaId, nome, cargo, atualizado_em: agora });
    }
  }
  return r;
}

export async function descartarSugestoes(db: Db, ids: number[]) {
  const n = await db('sugestoes_pessoas')
    .whereIn('id', ids)
    .where('situacao', 'Sugerida')
    .update({ situacao: 'Descartada', atualizado_em: nowLocal() });
  return { descartadas: Number(n) };
}

/** Sugestões pendentes (da empresa ou de todas), para a tela */
export async function listarSugestoes(db: Db, empresaId?: number) {
  const q = db('sugestoes_pessoas as s')
    .leftJoin('empresas as e', 'e.id', 's.empresa_id')
    .where('s.situacao', 'Sugerida')
    .orderBy([{ column: 'e.nome' }, { column: 's.area' }, { column: 's.nome' }])
    .select('s.id', 's.nome', 's.cargo', 's.area', 's.empresa_id', 'e.nome as empresa', 'e.nome_curto');
  if (empresaId) q.where('s.empresa_id', empresaId);
  return (await q) as {
    id: number;
    nome: string;
    cargo: string | null;
    area: string;
    empresa_id: number;
    empresa: string;
    nome_curto: string | null;
  }[];
}
