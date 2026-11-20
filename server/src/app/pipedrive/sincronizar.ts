// =============================================================================
// Sincronização Pipedrive → Radar (0.2.0). Para cada filtro configurado (contas-alvo e concorrentes):
//   • organizações → empresas (pela `pipedrive_org_id`; se não houver, pela página do LinkedIn): nome, página do
//     LinkedIn, site, segmento, tier, UF e dono. Nunca mexe no que é do Radar: nome curto, logo, monitorar, observações.
//   • pessoas das organizações COM perfil do LinkedIn → pessoas (pela `pipedrive_person_id`; senão, pelo perfil):
//     nome, cargo (job_title), empresa e perfil. Prioridade e "monitorar" ficam com o Radar.
//   • o mesmo perfil em dois contatos do Pipedrive vira alerta "Cadastro duplicado" (um só por perfil).
//   • empresa ou pessoa que o usuário mandou para a LIXEIRA do Radar não volta nem é atualizada (fica "ignorada");
//     restaurar da lixeira volta a sincronizar.
// Campos personalizados (Segmento, Tier, LinkedIn da pessoa) são achados pelo NOME no Pipedrive.
// Mão dupla (0.4.3, configuração `pipedrive_completar`): o que o Radar tem e o Pipedrive deixou VAZIO vai para o
// Pipedrive (organização: site, LinkedIn, segmento, tier; pessoa: cargo e LinkedIn). Campo preenchido nos dois
// lados: vale o do Pipedrive (ele é a fonte do CRM), que desce para o Radar como antes.
// Rodar de novo não duplica nada.
// =============================================================================
import { normalizarLinkedin, type Universo } from '@frame/shared';
import type { Db } from '../../db/knex';
import { inserir } from '../../db/knex';
import { getAppSetting } from '../../services/settings';
import { nowLocal } from '../../utils/time';
import { clientePipedrive } from './cliente';

interface Campo {
  key: string;
  name: string;
  options?: { id: number; label: string }[];
}
interface Org {
  id: number;
  name: string;
  owner_id: number | { id: number } | null;
  website?: string | null;
  linkedin?: string | null;
  address?: { value?: string | null; admin_area_level_1?: string | null } | null;
  custom_fields?: Record<string, unknown>;
}
interface Pessoa {
  id: number;
  name: string;
  org_id: number | null;
  job_title?: string | null;
  custom_fields?: Record<string, unknown>;
}

export interface ResultadoSincronizacao {
  empresas: { novas: number; atualizadas: number; ignoradas: number };
  pessoas: { novas: number; atualizadas: number; sem_linkedin: number; ignoradas: number };
  alertas: number;
  /** Registros do Pipedrive que receberam dados do Radar */
  enviados: { organizacoes: number; pessoas: number };
  avisos: string[];
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const acharCampo = (campos: Campo[], ...nomes: string[]) =>
  campos.find((c) => nomes.some((n) => semAcento(c.name) === n)) ??
  campos.find((c) => nomes.some((n) => semAcento(c.name).includes(n)));

const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
function ufDe(org: Org): string | null {
  for (const v of [org.address?.admin_area_level_1, org.address?.value]) {
    const s = String(v ?? '')
      .trim()
      .toUpperCase();
    if (UFS.has(s)) return s;
  }
  return null;
}

/** Nível a partir do cargo (quando a pessoa ainda não tem) */
export function nivelDoCargo(cargo: string | null | undefined): string | null {
  const c = cargo ?? '';
  if (!c.trim()) return null;
  if (/\b(CIO|CTO|CDO|CEO|COO|CFO|CISO|CMO|CRO|CCO|CHRO|CPO|CSO)\b/.test(c)) return 'C-level';
  if (/diretor|director|superintend|head|vp\b|vice.?presid/i.test(c)) return 'Diretoria';
  if (/gerente|manager|gestor/i.test(c)) return 'Gerência';
  if (/coordenad|tech lead|l[ií]der/i.test(c)) return 'Coordenação';
  return 'Outro';
}

export async function sincronizarPipedrive(db: Db): Promise<ResultadoSincronizacao> {
  const r: ResultadoSincronizacao = {
    empresas: { novas: 0, atualizadas: 0, ignoradas: 0 },
    pessoas: { novas: 0, atualizadas: 0, sem_linkedin: 0, ignoradas: 0 },
    alertas: 0,
    enviados: { organizacoes: 0, pessoas: 0 },
    avisos: [],
  };
  const filtros: [Universo, number][] = [
    ['Conta-alvo', Number(await getAppSetting(db, 'pipedrive_filtro_contas')) || 0],
    ['Concorrente', Number(await getAppSetting(db, 'pipedrive_filtro_concorrentes')) || 0],
  ];
  if (!filtros.some(([, f]) => f)) {
    r.avisos.push('Nenhum filtro do Pipedrive configurado (Configurações › Radar).');
    return r;
  }

  const api = clientePipedrive();
  const completar = !!(await getAppSetting<boolean>(db, 'pipedrive_completar'));
  const camposOrg = (await api.get<{ data: Campo[] }>('/v1/organizationFields', { limit: 500 })).data ?? [];
  const camposPessoa = (await api.get<{ data: Campo[] }>('/v1/personFields', { limit: 500 })).data ?? [];
  const usuarios = (await api.get<{ data: { id: number; name: string }[] }>('/v1/users')).data ?? [];
  const nomeUsuario = new Map(usuarios.map((u) => [u.id, u.name]));
  const campoSegmento = acharCampo(camposOrg, 'segmento');
  const campoTier = acharCampo(camposOrg, 'tier');
  const campoLinkedinPessoa = acharCampo(camposPessoa, 'linkedin', 'perfil do linkedin');
  if (!campoLinkedinPessoa) r.avisos.push('Não achei o campo de LinkedIn nas pessoas do Pipedrive.');

  const agora = nowLocal();
  const empresaDaOrg = new Map<number, number>();

  for (const [universo, filtro] of filtros) {
    if (!filtro) continue;
    const orgs = await api.todosV2<Org>('/api/v2/organizations', { filter_id: filtro });
    for (const org of orgs) {
      const tierId = campoTier ? org.custom_fields?.[campoTier.key] : null;
      const tierRotulo = campoTier?.options?.find((o) => String(o.id) === String(tierId))?.label ?? '';
      const tier = /^[ABC]\b/i.test(tierRotulo) ? tierRotulo[0].toUpperCase() : null;
      const ownerId = typeof org.owner_id === 'object' ? org.owner_id?.id : org.owner_id;
      const linkedin = normalizarLinkedin(org.linkedin);
      const dados: Record<string, unknown> = {
        universo,
        nome: org.name,
        pipedrive_org_id: org.id,
        site: org.website || null,
        segmento: campoSegmento ? (org.custom_fields?.[campoSegmento.key] as string | null) || null : null,
        tier,
        uf: ufDe(org),
        dono: ownerId ? (nomeUsuario.get(ownerId) ?? null) : null,
      };
      type Atual = { id: number; linkedin_url: string | null; excluido_em: string | null };
      const colunas = ['id', 'linkedin_url', 'excluido_em'];
      let atual = (await db('empresas').where('pipedrive_org_id', org.id).first(colunas)) as Atual | undefined;
      if (!atual && linkedin)
        atual = (await db('empresas').where('linkedin_url', linkedin).first(colunas)) as Atual | undefined;
      if (atual?.excluido_em) {
        r.empresas.ignoradas++;
        continue;
      }
      if (linkedin && linkedin !== atual?.linkedin_url) {
        const dono = (await db('empresas').where('linkedin_url', linkedin).first('id')) as { id: number } | undefined;
        if (!dono || dono.id === atual?.id) dados.linkedin_url = linkedin;
        else r.avisos.push(`${org.name}: a página ${linkedin} já está em outra empresa do Radar.`);
      }
      // vazio no Pipedrive não apaga o que o Radar já tem
      for (const k of Object.keys(dados)) if (dados[k] === null && atual) delete dados[k];
      if (atual) {
        await db('empresas')
          .where('id', atual.id)
          .update({ ...dados, atualizado_em: agora });
        empresaDaOrg.set(org.id, atual.id);
        r.empresas.atualizadas++;
      } else {
        const id = await inserir(db('empresas'), {
          ...dados,
          nome_curto: org.name,
          monitorar: true,
          criado_em: agora,
        });
        empresaDaOrg.set(org.id, id);
        r.empresas.novas++;
      }
      if (completar) {
        const radar = (await db('empresas')
          .where('id', empresaDaOrg.get(org.id)!)
          .first('site', 'linkedin_url', 'segmento', 'tier')) as Record<string, string | null>;
        const envio: Record<string, unknown> = {};
        if (radar.site && !org.website) envio.website = radar.site;
        if (radar.linkedin_url && !org.linkedin) envio.linkedin = radar.linkedin_url;
        if (campoSegmento && radar.segmento && !org.custom_fields?.[campoSegmento.key])
          envio[campoSegmento.key] = radar.segmento;
        const opcaoTier = campoTier?.options?.find(
          (o) => radar.tier && o.label.toUpperCase().startsWith(`${radar.tier} `),
        );
        if (campoTier && opcaoTier && !org.custom_fields?.[campoTier.key]) envio[campoTier.key] = opcaoTier.id;
        if (Object.keys(envio).length) {
          await api.put(`/v1/organizations/${org.id}`, envio);
          r.enviados.organizacoes++;
        }
      }
    }
  }

  if (!campoLinkedinPessoa) return r;
  const vistos = new Map<string, Pessoa>();
  for (const [orgId, empresaId] of empresaDaOrg) {
    const pessoas = await api.todosV2<Pessoa>('/api/v2/persons', { org_id: orgId });
    for (const p of pessoas) {
      const linkedinPipe = normalizarLinkedin(p.custom_fields?.[campoLinkedinPessoa.key] as string | null);
      // pessoa que o Radar já conhece (pelo id do Pipedrive): completa no Pipedrive o que lá está vazio
      if (completar) {
        const radar = (await db('pessoas')
          .where('pipedrive_person_id', p.id)
          .whereNull('excluido_em')
          .first('cargo', 'linkedin_url')) as { cargo: string | null; linkedin_url: string | null } | undefined;
        const envio: Record<string, unknown> = {};
        if (radar?.linkedin_url && !linkedinPipe) envio[campoLinkedinPessoa.key] = radar.linkedin_url;
        if (radar?.cargo && !p.job_title?.trim()) envio.job_title = radar.cargo;
        if (Object.keys(envio).length) {
          await api.put(`/v1/persons/${p.id}`, envio);
          r.enviados.pessoas++;
        }
      }
      const linkedin = linkedinPipe;
      if (!linkedin) {
        r.pessoas.sem_linkedin++;
        continue;
      }
      const primeiro = vistos.get(linkedin);
      if (primeiro && primeiro.id !== p.id) {
        const chave = `pipedrive:duplicado:${linkedin}`;
        if (!(await db('alertas_cadastro').where('chave', chave).first('id'))) {
          const pessoaId = (await db('pessoas').where('linkedin_url', linkedin).first('id')) as { id: number };
          await inserir(db('alertas_cadastro'), {
            tipo: 'Cadastro duplicado',
            pessoa_id: pessoaId?.id ?? null,
            empresa_id: empresaId,
            detalhe: `O mesmo perfil do LinkedIn aparece em dois contatos do Pipedrive: "${primeiro.name}" (${primeiro.id}) e "${p.name}" (${p.id}).`,
            sugestao: 'Mesclar os contatos no Pipedrive.',
            situacao: 'Aberto',
            chave,
            criado_em: agora,
          });
          r.alertas++;
        }
        continue;
      }
      vistos.set(linkedin, p);
      const cargo = p.job_title?.trim() || null;
      type AtualP = { id: number; nivel: string | null; linkedin_url: string | null; excluido_em: string | null };
      const colunasP = ['id', 'nivel', 'linkedin_url', 'excluido_em'];
      let atual = (await db('pessoas').where('pipedrive_person_id', p.id).first(colunasP)) as AtualP | undefined;
      if (!atual) atual = (await db('pessoas').where('linkedin_url', linkedin).first(colunasP)) as AtualP | undefined;
      if (atual?.excluido_em) {
        r.pessoas.ignoradas++;
        continue;
      }
      const dados: Record<string, unknown> = {
        nome: p.name,
        empresa_id: empresaId,
        pipedrive_person_id: p.id,
      };
      if (cargo) dados.cargo = cargo;
      if (!atual?.nivel && nivelDoCargo(cargo)) dados.nivel = nivelDoCargo(cargo);
      if (atual) {
        if (linkedin !== atual.linkedin_url && !(await db('pessoas').where('linkedin_url', linkedin).first('id')))
          dados.linkedin_url = linkedin;
        await db('pessoas')
          .where('id', atual.id)
          .update({ ...dados, atualizado_em: agora });
        r.pessoas.atualizadas++;
      } else {
        await inserir(db('pessoas'), {
          ...dados,
          linkedin_url: linkedin,
          prioridade: 'Média',
          monitorar: true,
          criado_em: agora,
        });
        r.pessoas.novas++;
      }
    }
  }
  return r;
}
