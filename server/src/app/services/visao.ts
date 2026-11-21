// =============================================================================
// Visão geral do Radar (0.4.0), por universo. Cálculos em JS sobre consultas Knex simples (vale para SQLite e
// Postgres). Período = últimos `dias` até hoje; "anterior" = os `dias` antes dele.
//   Concorrentes: comparativo por empresa (com a linha "Nós"), fatia de posts, tipos de movimento e o que engaja.
//   Contas-alvo: indicadores, "Agir esta semana", sinais por semana, contas em destaque (Score Radar).
// =============================================================================
import {
  lerTags,
  assuntosDoTexto,
  classificarAssuntos,
  scoreRadar,
  type DetalheEmpresa,
  type DetalhePessoa,
  type PostDetalhe,
  type EmpresaResumo,
  type LinhaComparativo,
  type PostExemplo,
  type SinalResumo,
  type VisaoConcorrentes,
  type VisaoContas,
} from '@frame/shared';
import type { Db } from '../../db/knex';
import { nowLocal } from '../../utils/time';

type Empresa = {
  id: number;
  nome: string;
  nome_curto: string | null;
  logo: string | null;
  logo_linkedin: string | null;
  universo: string;
  seguidores: number | null;
  dono: string | null;
  tags?: string | null;
};
type Pub = {
  id: number;
  empresa_id: number | null;
  pessoa_id: number | null;
  data_publicacao: string | null;
  post_proprio: unknown;
  curtidas: number | null;
  comentarios: number | null;
  compartilhamentos: number | null;
  titulo: string | null;
  url: string | null;
  assuntos?: string | null;
  autor?: string | null;
  id_externo?: string | null;
  original_id?: string | null;
  autor_linkedin?: string | null;
};
type Sinal = {
  id: number;
  empresa_id: number | null;
  pessoa_id: number | null;
  publicacao_id: number | null;
  data: string | null;
  severidade: string;
  tipo: string;
  titulo: string;
  gancho: string | null;
  situacao: string | null;
};

const dia = (d: Date) => d.toISOString().slice(0, 10);
export function periodoDe(dias: number, hoje = new Date(`${nowLocal().slice(0, 10)}T12:00:00Z`)) {
  const ate = dia(hoje);
  const de = dia(new Date(hoje.getTime() - (dias - 1) * 86_400_000));
  const deAnterior = dia(new Date(hoje.getTime() - (2 * dias - 1) * 86_400_000));
  return { de, ate, deAnterior, dias };
}
const resumo = (e: Empresa): EmpresaResumo => ({
  id: e.id,
  nome: e.nome_curto || e.nome,
  logo: e.logo || e.logo_linkedin || null,
  tags: lerTags(e.tags),
});
const interacoes = (p: Pub) => (p.curtidas ?? 0) + (p.comentarios ?? 0) + (p.compartilhamentos ?? 0);
const media = (soma: number, n: number) => (n ? Math.round((soma / n) * 10) / 10 : null);

/**
 * Campos derivados das publicações: assunto (posts coletados antes da 0.4.1) e universo da empresa (0.4.4; o
 * filtro "concorrentes" da lista de publicações usa ele). Barato quando não há nada a fazer.
 */
export async function garantirAssuntos(db: Db) {
  const sem = (await db('publicacoes').whereNull('assuntos').select('id', 'texto', 'titulo').limit(5000)) as {
    id: number;
    texto: string | null;
    titulo: string | null;
  }[];
  for (const p of sem)
    await db('publicacoes')
      .where('id', p.id)
      .update({ assuntos: classificarAssuntos(p.texto || p.titulo).join('; ') });
  await atualizarUniversoDasPublicacoes(db);
  return sem.length;
}

/** Copia o universo da empresa para as publicações dela (todas, ou só as de uma empresa) */
export async function atualizarUniversoDasPublicacoes(db: Db, empresaId?: number) {
  const q = db('publicacoes').whereNotNull('empresa_id');
  if (empresaId) q.where('empresa_id', empresaId);
  else q.whereNull('universo');
  await q.update({
    universo: db('empresas').select('universo').whereRaw('empresas.id = publicacoes.empresa_id'),
  });
}

/** Conta posts e soma interações por assunto (um post conta em cada assunto dele) */
function porAssunto(posts: Pub[]) {
  const m = new Map<string, Pub[]>();
  for (const x of posts) for (const a of assuntosDoTexto(x.assuntos)) m.set(a, [...(m.get(a) ?? []), x]);
  return m;
}

/** Assuntos com contagem e média de interações, do mais frequente ao menos */
function assuntosComMedia(posts: Pub[]) {
  return [...porAssunto(posts).entries()]
    .map(([assunto, ps]) => ({
      assunto,
      posts: ps.length,
      media:
        media(
          ps.reduce((s, x) => s + interacoes(x), 0),
          ps.length,
        ) ?? 0,
    }))
    .sort((a, b) => b.posts - a.posts);
}

const normalizarNome = (t: string | null | undefined) =>
  (t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** De quem é o post original de um repost: pelo LinkedIn do autor ou, nos antigos (sem ele), pelo nome */
function autorDoRepost<T extends { nome: string; linkedin_url: string | null }>(x: Pub, candidatos: T[]) {
  if (x.autor_linkedin) {
    const porLink = candidatos.find((c) => c.linkedin_url && c.linkedin_url === x.autor_linkedin);
    if (porLink) return porLink;
  }
  const nome = normalizarNome(x.autor);
  return nome ? candidatos.find((c) => normalizarNome(c.nome) === nome) : undefined;
}

const COLUNAS_PUB = [
  'id',
  'empresa_id',
  'pessoa_id',
  'data_publicacao',
  'post_proprio',
  'curtidas',
  'comentarios',
  'compartilhamentos',
  'titulo',
  'url',
  'assuntos',
  'autor',
  'id_externo',
  'original_id',
  'autor_linkedin',
];

/** Semanas (segunda a domingo) que cobrem o período, com a contagem de datas em cada uma */
function porSemana(datas: (string | null)[], de: string, ate: string) {
  const inicio = new Date(`${de}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - ((inicio.getUTCDay() + 6) % 7));
  const semanas: { inicio: string; n: number }[] = [];
  for (let d = inicio; dia(d) <= ate; d = new Date(d.getTime() + 7 * 86_400_000))
    semanas.push({ inicio: dia(d), n: 0 });
  for (const data of datas) {
    if (!data || data < de || data > ate) continue;
    const s = semanas.findLast((x) => x.inicio <= data);
    if (s) s.n++;
  }
  return semanas;
}

/**
 * Empresas monitoradas do universo. Com `tags`, só as que têm ao menos uma delas (como o filtro "etiqueta é
 * qualquer uma de" do Pipedrive); "Nós" fica sempre, porque é a referência do comparativo.
 */
async function empresasDe(db: Db, universos: string[], tags: number[] = []) {
  const lista = (await db('empresas')
    .whereIn('universo', universos)
    .whereNull('excluido_em')
    .whereIn('monitorar', [1, true])
    .select(
      'id',
      'nome',
      'nome_curto',
      'logo',
      'logo_linkedin',
      'universo',
      'seguidores',
      'dono',
      'tags',
    )) as Empresa[];
  if (!tags.length) return lista;
  return lista.filter((e) => e.universo === 'Nós' || lerTags(e.tags).some((t) => tags.includes(t)));
}

export async function visaoConcorrentes(db: Db, dias = 30, tags: number[] = []): Promise<VisaoConcorrentes> {
  await garantirAssuntos(db);
  const p = periodoDe(dias);
  const empresas = await empresasDe(db, ['Concorrente', 'Nós'], tags);
  const ids = empresas.map((e) => e.id);
  const pubs = (await db('publicacoes')
    .where('tipo', 'Post')
    .whereIn('empresa_id', ids)
    .whereNull('pessoa_id')
    .where('data_publicacao', '>=', p.deAnterior)
    .where('data_publicacao', '<=', p.ate)
    .select(
      'id',
      'empresa_id',
      'pessoa_id',
      'data_publicacao',
      'post_proprio',
      'curtidas',
      'comentarios',
      'compartilhamentos',
      'titulo',
      'url',
      'assuntos',
    )) as Pub[];
  const sinais = (await db('sinais')
    .whereIn('empresa_id', ids)
    .where('data', '>=', p.de)
    .where('data', '<=', p.ate)
    .select(
      'id',
      'empresa_id',
      'pessoa_id',
      'publicacao_id',
      'data',
      'severidade',
      'tipo',
      'titulo',
      'gancho',
      'situacao',
    )) as Sinal[];
  const metricas = (await db('metricas_empresas')
    .whereIn('empresa_id', ids)
    .orderBy('data', 'asc')
    .select('empresa_id', 'data', 'seguidores', 'vagas', 'funcionarios')) as {
    empresa_id: number;
    data: string;
    seguidores: number | null;
    vagas: number | null;
    funcionarios: number | null;
  }[];

  const noPeriodo = (x: Pub) => !!x.data_publicacao && x.data_publicacao >= p.de;
  const linhas: LinhaComparativo[] = empresas.map((e) => {
    const todas = pubs.filter((x) => x.empresa_id === e.id);
    const atuais = todas.filter(noPeriodo);
    const proprios = atuais.filter((x) => !!x.post_proprio);
    const soma = (k: 'curtidas' | 'comentarios' | 'compartilhamentos') => proprios.reduce((s, x) => s + (x[k] ?? 0), 0);
    const porPost = proprios.length ? proprios.reduce((s, x) => s + interacoes(x), 0) / proprios.length : null;
    const sinaisE = sinais.filter((s) => s.empresa_id === e.id);
    const hist = metricas.filter((m) => m.empresa_id === e.id && m.seguidores != null);
    const ultima = hist.at(-1);
    const corte = ultima ? dia(new Date(new Date(`${ultima.data}T12:00:00Z`).getTime() - 7 * 86_400_000)) : null;
    const base = corte ? hist.filter((m) => m.data <= corte).at(-1) : undefined;
    return {
      ...resumo(e),
      nos: e.universo === 'Nós',
      seguidores: e.seguidores,
      seguidores_var: base && ultima ? (ultima.seguidores ?? 0) - (base.seguidores ?? 0) : null,
      posts: proprios.length,
      posts_anterior: todas.filter((x) => !noPeriodo(x) && !!x.post_proprio).length,
      reposts: atuais.length - proprios.length,
      curtidas_post: media(soma('curtidas'), proprios.length),
      comentarios_post: media(soma('comentarios'), proprios.length),
      compartilhamentos_post: media(soma('compartilhamentos'), proprios.length),
      engajamento: porPost != null && e.seguidores ? Math.round((porPost / e.seguidores) * 10000) / 100 : null,
      vagas: metricas.filter((m) => m.empresa_id === e.id && m.vagas != null).at(-1)?.vagas ?? null,
      ...(() => {
        const c = colaboradoresNoPeriodo(
          metricas.filter((m) => m.empresa_id === e.id),
          p.de,
        );
        return { colaboradores: c.atual, colaboradores_var: c.variacao };
      })(),
      movimentos: sinaisE.length,
      alta: sinaisE.filter((s) => s.severidade === 'Alta').length,
      ultimo_post:
        atuais
          .map((x) => x.data_publicacao!)
          .sort()
          .at(-1) ?? null,
    };
  });
  linhas.sort((a, b) => Number(b.nos) - Number(a.nos) || b.movimentos - a.movimentos || b.posts - a.posts);
  const conc = linhas.filter((l) => !l.nos);
  const sinaisConc = sinais.filter((s) => conc.some((l) => l.id === s.empresa_id));

  // assuntos: posts próprios dos concorrentes no período
  const idsConc = new Set(conc.map((l) => l.id));
  const nomePorId = new Map(linhas.map((l) => [l.id, l.nome]));
  const postsConc = pubs.filter((x) => noPeriodo(x) && !!x.post_proprio && idsConc.has(x.empresa_id!));
  const grupos = porAssunto(postsConc);
  const assuntos = [...grupos.entries()]
    .map(([assunto, ps]) => ({ assunto, posts: ps.length }))
    .sort((a, b) => b.posts - a.posts);
  const ordem = assuntos.map((a) => a.assunto);
  const assuntos_por_empresa = {
    assuntos: ordem,
    empresas: conc
      .filter((l) => l.posts)
      .map((l) => ({
        id: l.id,
        nome: l.nome,
        valores: ordem.map((a) => (grupos.get(a) ?? []).filter((x) => x.empresa_id === l.id).length),
      })),
  };
  const engaja = [...grupos.entries()]
    .filter(([assunto, ps]) => ps.length >= 2 && assunto !== 'Outros')
    .map(([assunto, ps]) => ({
      assunto,
      posts: ps.length,
      media:
        media(
          ps.reduce((s, x) => s + interacoes(x), 0),
          ps.length,
        ) ?? 0,
      exemplos: ps
        .map((x) => ({
          id: x.id,
          titulo: x.titulo ?? '',
          url: x.url,
          empresa: nomePorId.get(x.empresa_id!) ?? '',
          interacoes: interacoes(x),
        }))
        .sort((a, b) => b.interacoes - a.interacoes)
        .slice(0, 3) as PostExemplo[],
    }))
    .sort((a, b) => b.media - a.media);

  const maisAtivo = [...conc].sort((a, b) => b.movimentos - a.movimentos || b.posts - a.posts)[0];
  return {
    periodo: { de: p.de, ate: p.ate, dias },
    kpis: {
      movimentos: sinaisConc.length,
      alta: sinaisConc.filter((s) => s.severidade === 'Alta').length,
      posts: conc.reduce((s, l) => s + l.posts, 0),
      audiencia: conc.reduce((s, l) => s + (l.seguidores ?? 0), 0),
      mais_ativo: maisAtivo && (maisAtivo.movimentos || maisAtivo.posts) ? maisAtivo.nome : null,
    },
    linhas,
    assuntos,
    assuntos_por_empresa,
    engaja,
    semanas: porSemana(
      sinaisConc.map((s) => s.data),
      p.de,
      p.ate,
    ),
  };
}

export async function visaoContas(db: Db, dias = 30, tags: number[] = []): Promise<VisaoContas> {
  const p = periodoDe(dias);
  const empresas = await empresasDe(db, ['Conta-alvo'], tags);
  const ids = empresas.map((e) => e.id);
  const porId = new Map(empresas.map((e) => [e.id, e]));
  const sinais = (await db('sinais')
    .whereIn('empresa_id', ids)
    .where('data', '>=', p.de)
    .where('data', '<=', p.ate)
    .select(
      'id',
      'empresa_id',
      'pessoa_id',
      'publicacao_id',
      'data',
      'severidade',
      'tipo',
      'titulo',
      'gancho',
      'situacao',
    )) as Sinal[];
  const pessoas = (await db('pessoas')
    .whereIn('empresa_id', ids)
    .whereNull('excluido_em')
    .whereIn('monitorar', [1, true])
    .select('id', 'nome', 'empresa_id')) as { id: number; nome: string; empresa_id: number }[];
  const ativas = (await db('publicacoes')
    .where('tipo', 'Post')
    .whereIn(
      'pessoa_id',
      pessoas.map((x) => x.id),
    )
    .where('data_publicacao', '>=', p.de)
    .distinct('pessoa_id')) as { pessoa_id: number }[];
  const ativasSet = new Set(ativas.map((a) => a.pessoa_id));
  const nomePessoa = new Map(pessoas.map((x) => [x.id, x.nome]));

  const pesoSev: Record<string, number> = { Alta: 0, Média: 1, Baixa: 2 };
  const agir: SinalResumo[] = sinais
    .filter((s) => (s.situacao ?? 'Novo') === 'Novo' && s.severidade !== 'Baixa')
    .sort(
      (a, b) =>
        (pesoSev[a.severidade] ?? 3) - (pesoSev[b.severidade] ?? 3) || String(b.data).localeCompare(String(a.data)),
    )
    .slice(0, 8)
    .map((s) => ({
      id: s.id,
      data: s.data,
      severidade: s.severidade,
      tipo: s.tipo,
      titulo: s.titulo,
      gancho: s.gancho,
      empresa: s.empresa_id && porId.has(s.empresa_id) ? resumo(porId.get(s.empresa_id)!) : null,
      pessoa: s.pessoa_id ? (nomePessoa.get(s.pessoa_id) ?? null) : null,
    }));

  const destaque = empresas
    .map((e) => {
      const se = sinais.filter((s) => s.empresa_id === e.id);
      const alta = se.filter((s) => s.severidade === 'Alta').length;
      const mediaN = se.filter((s) => s.severidade === 'Média').length;
      const pessoasAtivas = pessoas.filter((x) => x.empresa_id === e.id && ativasSet.has(x.id)).length;
      return {
        ...resumo(e),
        dono: e.dono,
        sinais: se.length,
        alta,
        score: scoreRadar({ alta, media: mediaN, baixa: se.length - alta - mediaN, pessoasAtivas }),
      };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const tipos = [...new Set(sinais.map((s) => s.tipo))]
    .map((tipo) => ({ tipo, n: sinais.filter((s) => s.tipo === tipo).length }))
    .sort((a, b) => b.n - a.n);
  return {
    periodo: { de: p.de, ate: p.ate, dias },
    kpis: {
      sinais: sinais.length,
      alta: sinais.filter((s) => s.severidade === 'Alta').length,
      contas_com_sinal: new Set(sinais.map((s) => s.empresa_id)).size,
      contas: empresas.length,
      pessoas: pessoas.length,
      pessoas_ativas: ativasSet.size,
    },
    agir,
    semanas: porSemana(
      sinais.map((s) => s.data),
      p.de,
      p.ate,
    ),
    destaque,
    tipos,
  };
}

/**
 * Colaboradores no LinkedIn (aba Pessoas): a última medição e a variação no período — a base é a última medição
 * até o início do período ou, sem ela, a primeira que houver (a coleta semanal começou depois).
 */
export function colaboradoresNoPeriodo(
  metricas: { data: string; funcionarios: number | null }[],
  de: string,
): { atual: number | null; variacao: number | null; desde: string | null } {
  const hist = metricas.filter((m) => m.funcionarios != null).sort((a, b) => a.data.localeCompare(b.data));
  const ultima = hist.at(-1);
  if (!ultima) return { atual: null, variacao: null, desde: null };
  const base = hist.filter((m) => m.data <= de).at(-1) ?? hist[0];
  if (base === ultima) return { atual: ultima.funcionarios, variacao: null, desde: null };
  return { atual: ultima.funcionarios, variacao: ultima.funcionarios! - base.funcionarios!, desde: base.data };
}

/** Página da empresa: tudo do período (posts, assuntos, engajamento, seguidores, sinais e pessoas-chave) */
export async function detalheEmpresa(db: Db, id: number, dias = 90): Promise<DetalheEmpresa | null> {
  await garantirAssuntos(db);
  const e = (await db('empresas').where('id', id).first()) as
    | (Empresa & {
        site: string | null;
        linkedin_url: string | null;
        segmento: string | null;
        tier: string | null;
        uf: string | null;
      } & Record<string, unknown>)
    | undefined;
  if (!e) return null;
  const p = periodoDe(dias);
  const vagasRows = (await db('publicacoes')
    .where({ empresa_id: id, tipo: 'Vaga' })
    .where('data_publicacao', '>=', periodoDe(30).de)
    .orderBy('data_publicacao', 'desc')
    .select('id', 'titulo', 'url', 'data_publicacao', 'texto')) as {
    id: number;
    titulo: string | null;
    url: string | null;
    data_publicacao: string | null;
    texto: string | null;
  }[];
  const pubs = (await db('publicacoes')
    .where('empresa_id', id)
    .where('tipo', 'Post')
    .where('data_publicacao', '>=', p.deAnterior)
    .where('data_publicacao', '<=', p.ate)
    .orderBy('data_publicacao', 'desc')
    .select(COLUNAS_PUB)) as Pub[];
  const sinais = (await db('sinais')
    .where('empresa_id', id)
    .where('data', '>=', p.de)
    .orderBy('data', 'desc')
    .select(
      'id',
      'empresa_id',
      'pessoa_id',
      'publicacao_id',
      'data',
      'severidade',
      'tipo',
      'titulo',
      'gancho',
      'situacao',
    )) as Sinal[];
  const pessoas = (await db('pessoas')
    .where('empresa_id', id)
    .whereNull('excluido_em')
    .select('id', 'nome', 'cargo', 'prioridade', 'linkedin_url')) as {
    id: number;
    nome: string;
    cargo: string | null;
    prioridade: string | null;
    linkedin_url: string | null;
  }[];
  // posts das pessoas que a página repostou (qualquer data): pelo id do post original
  const repostadas = new Set(
    (
      (await db('publicacoes')
        .where({ empresa_id: id, tipo: 'Post' })
        .whereNull('pessoa_id')
        .whereNotNull('original_id')
        .select('original_id')) as { original_id: string }[]
    ).map((r) => r.original_id),
  );
  const hist = (await db('metricas_empresas')
    .where('empresa_id', id)
    .whereNotNull('seguidores')
    .orderBy('data', 'asc')
    .select('data', 'seguidores')) as { data: string; seguidores: number }[];

  const daPagina = pubs.filter((x) => !x.pessoa_id);
  const atuais = daPagina.filter((x) => !!x.data_publicacao && x.data_publicacao >= p.de);
  const proprios = atuais.filter((x) => !!x.post_proprio);
  const porPost = proprios.length ? proprios.reduce((s, x) => s + interacoes(x), 0) / proprios.length : null;
  const sinalPorPub = new Map(sinais.filter((s) => s.publicacao_id).map((s) => [s.publicacao_id!, s]));
  const nomePessoa = new Map(pessoas.map((x) => [x.id, x.nome]));
  const nome = e.nome_curto || e.nome;
  const detalhe = (x: Pub): PostDetalhe => {
    const s = sinalPorPub.get(x.id);
    return {
      id: x.id,
      titulo: x.titulo ?? '',
      url: x.url,
      empresa: nome,
      interacoes: interacoes(x),
      data: x.data_publicacao,
      autor: x.pessoa_id ? (nomePessoa.get(x.pessoa_id) ?? x.autor ?? null) : (x.autor ?? null),
      proprio: !!x.post_proprio,
      curtidas: x.curtidas,
      comentarios: x.comentarios,
      compartilhamentos: x.compartilhamentos,
      assuntos: assuntosDoTexto(x.assuntos),
      sinal: s ? { id: s.id, tipo: s.tipo, severidade: s.severidade } : null,
      pessoa_id: x.pessoa_id,
      repost_empresa: !!x.pessoa_id && !!x.post_proprio && !!x.id_externo && repostadas.has(x.id_externo),
    };
  };
  const colab = colaboradoresNoPeriodo(
    (await db('metricas_empresas').where('empresa_id', id).select('data', 'funcionarios')) as {
      data: string;
      funcionarios: number | null;
    }[],
    p.de,
  );
  const vagasMetrica = (await db('metricas_empresas')
    .where('empresa_id', id)
    .whereNotNull('vagas')
    .orderBy('data', 'desc')
    .first('vagas')) as { vagas: number } | undefined;
  const ultima = hist.at(-1);
  const corte = ultima ? dia(new Date(new Date(`${ultima.data}T12:00:00Z`).getTime() - 7 * 86_400_000)) : null;
  const base = corte ? hist.filter((m) => m.data <= corte).at(-1) : undefined;
  const postsPessoas = pubs.filter((x) => x.pessoa_id && !!x.data_publicacao && x.data_publicacao >= p.de);

  return {
    empresa: {
      ...resumo(e),
      nome_completo: e.nome,
      universo: e.universo,
      seguidores: e.seguidores,
      site: e.site,
      linkedin_url: e.linkedin_url,
      dono: e.dono,
      segmento: e.segmento,
      tier: e.tier,
      uf: e.uf,
      apollo: e.apollo_enriquecido_em
        ? {
            funcionarios: (e.apollo_funcionarios as number | null) ?? null,
            setor: (e.apollo_setor as string | null) ?? null,
            faturamento: (e.apollo_faturamento as string | null) ?? null,
            fundacao: (e.apollo_fundacao as number | null) ?? null,
            local: (e.apollo_local as string | null) ?? null,
            investimento: (e.apollo_investimento as string | null) ?? null,
            tecnologias: (e.apollo_tecnologias as string | null) ?? null,
            descricao: (e.apollo_descricao as string | null) ?? null,
            enriquecido_em: String(e.apollo_enriquecido_em),
          }
        : null,
    },
    periodo: { de: p.de, ate: p.ate, dias },
    kpis: {
      posts: proprios.length,
      posts_anterior: daPagina.filter((x) => !!x.post_proprio && !!x.data_publicacao && x.data_publicacao < p.de)
        .length,
      reposts: atuais.length - proprios.length,
      interacoes_post: porPost == null ? null : Math.round(porPost * 10) / 10,
      engajamento: porPost != null && e.seguidores ? Math.round((porPost / e.seguidores) * 10000) / 100 : null,
      sinais: sinais.length,
      alta: sinais.filter((s) => s.severidade === 'Alta').length,
      seguidores_var: base && ultima ? ultima.seguidores - base.seguidores : null,
      vagas: vagasMetrica?.vagas ?? null,
      colaboradores: colab.atual,
      colaboradores_var: colab.variacao,
      colaboradores_desde: colab.desde,
    },
    seguidores: hist,
    semanas: porSemana(
      proprios.map((x) => x.data_publicacao),
      p.de,
      p.ate,
    ),
    assuntos: assuntosComMedia(proprios),
    assuntos_pessoas: assuntosComMedia(postsPessoas.filter((x) => !!x.post_proprio)),
    reposts_pessoas: atuais
      .filter((x) => !x.post_proprio)
      .flatMap((x) => {
        const quem = autorDoRepost(x, pessoas);
        return quem ? [{ ...detalhe(x), autor: quem.nome, pessoa_id: quem.id }] : [];
      }),
    vagas: vagasRows.map((v) => ({
      id: v.id,
      titulo: v.titulo ?? 'Vaga',
      url: v.url,
      data: v.data_publicacao,
      local: v.texto?.split(' · ').slice(1).join(' · ') || null,
    })),
    melhores: [...proprios]
      .sort((a, b) => interacoes(b) - interacoes(a))
      .slice(0, 5)
      .map(detalhe),
    posts: [...atuais, ...postsPessoas]
      .sort((a, b) => String(b.data_publicacao).localeCompare(String(a.data_publicacao)))
      .slice(0, 60)
      .map(detalhe),
    sinais: sinais.map((s) => ({
      id: s.id,
      data: s.data,
      severidade: s.severidade,
      tipo: s.tipo,
      titulo: s.titulo,
      gancho: s.gancho,
      empresa: resumo(e),
      pessoa: s.pessoa_id ? (nomePessoa.get(s.pessoa_id) ?? null) : null,
    })),
    pessoas: pessoas
      .map((x) => {
        const ps = postsPessoas.filter((y) => y.pessoa_id === x.id);
        return {
          ...x,
          posts: ps.length,
          ultimo:
            ps
              .map((y) => y.data_publicacao!)
              .sort()
              .at(-1) ?? null,
        };
      })
      .sort((a, b) => b.posts - a.posts || a.nome.localeCompare(b.nome)),
  };
}

/** Página da pessoa-chave (0.4.9): posts do perfil, assuntos, engajamento, sinais e a relação com a página da empresa */
export async function detalhePessoa(db: Db, id: number, dias = 90): Promise<DetalhePessoa | null> {
  await garantirAssuntos(db);
  const x = (await db('pessoas').where('id', id).first()) as
    | {
        id: number;
        nome: string;
        cargo: string | null;
        titulo_linkedin: string | null;
        linkedin_url: string | null;
        nivel: string | null;
        prioridade: string | null;
        monitorar: unknown;
        empresa_id: number | null;
      }
    | undefined;
  if (!x) return null;
  const p = periodoDe(dias);
  const emp = x.empresa_id
    ? ((await db('empresas').where('id', x.empresa_id).first()) as
        (Empresa & { linkedin_url: string | null }) | undefined)
    : undefined;
  const pubs = (await db('publicacoes')
    .where({ pessoa_id: id, tipo: 'Post' })
    .where('data_publicacao', '>=', p.deAnterior)
    .where('data_publicacao', '<=', p.ate)
    .orderBy('data_publicacao', 'desc')
    .select(COLUNAS_PUB)) as Pub[];
  const repostadas = emp
    ? new Set(
        (
          (await db('publicacoes')
            .where({ empresa_id: emp.id, tipo: 'Post' })
            .whereNull('pessoa_id')
            .whereNotNull('original_id')
            .select('original_id')) as { original_id: string }[]
        ).map((r) => r.original_id),
      )
    : new Set<string>();
  const sinais = (await db('sinais')
    .where('pessoa_id', id)
    .where('data', '>=', p.de)
    .orderBy('data', 'desc')
    .select(
      'id',
      'empresa_id',
      'pessoa_id',
      'publicacao_id',
      'data',
      'severidade',
      'tipo',
      'titulo',
      'gancho',
      'situacao',
    )) as Sinal[];

  const atuais = pubs.filter((y) => !!y.data_publicacao && y.data_publicacao >= p.de);
  const proprios = atuais.filter((y) => !!y.post_proprio);
  const soma = (f: (y: Pub) => number) => proprios.reduce((s, y) => s + f(y), 0);
  const sinalPorPub = new Map(sinais.filter((s) => s.publicacao_id).map((s) => [s.publicacao_id!, s]));
  const nomeEmpresa = emp ? emp.nome_curto || emp.nome : '';
  const ehRepostada = (y: Pub) => !!y.post_proprio && !!y.id_externo && repostadas.has(y.id_externo);
  const daEmpresa = (y: Pub) =>
    !y.post_proprio &&
    !!emp &&
    !!autorDoRepost(y, [
      { nome: emp.nome, linkedin_url: emp.linkedin_url },
      { nome: nomeEmpresa, linkedin_url: null },
    ]);
  const detalhe = (y: Pub): PostDetalhe => {
    const s = sinalPorPub.get(y.id);
    return {
      id: y.id,
      titulo: y.titulo ?? '',
      url: y.url,
      empresa: nomeEmpresa,
      interacoes: interacoes(y),
      data: y.data_publicacao,
      // no perfil, o autor só interessa no repost (de quem é o post original)
      autor: y.post_proprio ? null : (y.autor ?? null),
      proprio: !!y.post_proprio,
      curtidas: y.curtidas,
      comentarios: y.comentarios,
      compartilhamentos: y.compartilhamentos,
      assuntos: assuntosDoTexto(y.assuntos),
      sinal: s ? { id: s.id, tipo: s.tipo, severidade: s.severidade } : null,
      pessoa_id: y.post_proprio ? id : null,
      repost_empresa: ehRepostada(y),
    };
  };
  return {
    pessoa: {
      id: x.id,
      nome: x.nome,
      cargo: x.cargo,
      titulo_linkedin: x.titulo_linkedin,
      linkedin_url: x.linkedin_url,
      nivel: x.nivel,
      prioridade: x.prioridade,
      monitorar: !!x.monitorar,
      empresa: emp ? { ...resumo(emp), universo: emp.universo } : null,
    },
    periodo: { de: p.de, ate: p.ate, dias },
    kpis: {
      posts: proprios.length,
      posts_anterior: pubs.filter((y) => !!y.post_proprio && !!y.data_publicacao && y.data_publicacao < p.de).length,
      reposts: atuais.length - proprios.length,
      interacoes_post: media(soma(interacoes), proprios.length),
      curtidas_post: media(
        soma((y) => y.curtidas ?? 0),
        proprios.length,
      ),
      sinais: sinais.length,
      alta: sinais.filter((s) => s.severidade === 'Alta').length,
      repostados_pela_empresa: proprios.filter(ehRepostada).length,
      reposts_da_empresa: atuais.filter(daEmpresa).length,
    },
    semanas: porSemana(
      proprios.map((y) => y.data_publicacao),
      p.de,
      p.ate,
    ),
    assuntos: assuntosComMedia(proprios),
    melhores: [...proprios]
      .sort((a, b) => interacoes(b) - interacoes(a))
      .slice(0, 5)
      .map(detalhe),
    posts: atuais.slice(0, 200).map(detalhe),
    sinais: sinais.map((s) => ({
      id: s.id,
      data: s.data,
      severidade: s.severidade,
      tipo: s.tipo,
      titulo: s.titulo,
      gancho: s.gancho,
      empresa: emp ? resumo(emp) : null,
      pessoa: x.nome,
    })),
  };
}
