// =============================================================================
// Visão geral do Radar (0.4.0), por universo. Cálculos em JS sobre consultas Knex simples (vale para SQLite e
// Postgres). Período = últimos `dias` até hoje; "anterior" = os `dias` antes dele.
//   Concorrentes: comparativo por empresa (com a linha "Nós"), fatia de posts, tipos de movimento e o que engaja.
//   Contas-alvo: indicadores, "Agir esta semana", sinais por semana, contas em destaque (Score Radar).
// =============================================================================
import {
  scoreRadar,
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
});
const interacoes = (p: Pub) => (p.curtidas ?? 0) + (p.comentarios ?? 0) + (p.compartilhamentos ?? 0);
const media = (soma: number, n: number) => (n ? Math.round((soma / n) * 10) / 10 : null);

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

async function empresasDe(db: Db, universos: string[]) {
  return (await db('empresas')
    .whereIn('universo', universos)
    .whereNull('excluido_em')
    .whereIn('monitorar', [1, true])
    .select('id', 'nome', 'nome_curto', 'logo', 'logo_linkedin', 'universo', 'seguidores', 'dono')) as Empresa[];
}

export async function visaoConcorrentes(db: Db, dias = 30): Promise<VisaoConcorrentes> {
  const p = periodoDe(dias);
  const empresas = await empresasDe(db, ['Concorrente', 'Nós']);
  const ids = empresas.map((e) => e.id);
  const pubs = (await db('publicacoes')
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
    .select('empresa_id', 'data', 'seguidores')) as { empresa_id: number; data: string; seguidores: number | null }[];

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

  // tipos de movimento por concorrente
  const tiposOrdem = [...new Set(sinaisConc.map((s) => s.tipo))].sort(
    (a, b) => sinaisConc.filter((s) => s.tipo === b).length - sinaisConc.filter((s) => s.tipo === a).length,
  );
  const tipos = {
    tipos: tiposOrdem,
    empresas: conc
      .filter((l) => l.movimentos)
      .map((l) => ({
        nome: l.nome,
        valores: tiposOrdem.map((t) => sinaisConc.filter((s) => s.empresa_id === l.id && s.tipo === t).length),
      })),
  };

  // o que mais engaja: média de interações dos posts que geraram cada tipo de movimento
  const pubPorId = new Map(pubs.map((x) => [x.id, x]));
  const nomePorId = new Map(linhas.map((l) => [l.id, l.nome]));
  const engaja = tiposOrdem
    .map((tipo) => {
      const posts = [
        ...new Map(
          sinaisConc
            .filter((s) => s.tipo === tipo && s.publicacao_id && pubPorId.has(s.publicacao_id))
            .map((s) => [s.publicacao_id!, pubPorId.get(s.publicacao_id!)!]),
        ).values(),
      ];
      const exemplos: PostExemplo[] = posts
        .map((x) => ({
          id: x.id,
          titulo: x.titulo ?? '',
          url: x.url,
          empresa: nomePorId.get(x.empresa_id!) ?? '',
          interacoes: interacoes(x),
        }))
        .sort((a, b) => b.interacoes - a.interacoes)
        .slice(0, 3);
      return {
        tipo,
        posts: posts.length,
        media:
          media(
            posts.reduce((s, x) => s + interacoes(x), 0),
            posts.length,
          ) ?? 0,
        exemplos,
      };
    })
    .filter((t) => t.posts)
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
    tipos,
    engaja,
    semanas: porSemana(
      sinaisConc.map((s) => s.data),
      p.de,
      p.ate,
    ),
  };
}

export async function visaoContas(db: Db, dias = 30): Promise<VisaoContas> {
  const p = periodoDe(dias);
  const empresas = await empresasDe(db, ['Conta-alvo']);
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
