// =============================================================================
// Importa os dados do piloto (Radar LinkedIn, coleta de 19/11/2026): 47 empresas, 50 pessoas-chave, ~500
// publicações, 88 sinais e 3 alertas de cadastro. Idempotente: rodar de novo não duplica (empresas por página do
// LinkedIn ou ID do Pipedrive, pessoas pelo perfil, publicações pelo id do post, sinais por publicação + tipo).
// Usado pelo seed (desenvolvimento) e pelo script scripts/importar-piloto.ts (produção).
// =============================================================================
import type { Db } from '../../db/knex';
import { inserir } from '../../db/knex';
import { classificarAssuntos } from '@frame/shared';
import { nowLocal } from '../../utils/time';
import dados from '../dados/piloto.json';

interface Resultado {
  empresas: number;
  pessoas: number;
  publicacoes: number;
  sinais: number;
  alertas: number;
}

type Linha = Record<string, unknown>;

export async function importarPiloto(db: Db): Promise<Resultado> {
  const agora = nowLocal();
  const r: Resultado = { empresas: 0, pessoas: 0, publicacoes: 0, sinais: 0, alertas: 0 };
  const empresaPorChave = new Map<string, number>();
  const pessoaPorChave = new Map<string, number>();
  const publicacaoPorChave = new Map<string, number>();

  for (const e of dados.empresas as Linha[]) {
    const { chave, ...campos } = e;
    const existente = (await db('empresas')
      .modify((q) => {
        if (campos.linkedin_url) q.where('linkedin_url', campos.linkedin_url as string);
        else if (campos.pipedrive_org_id) q.where('pipedrive_org_id', campos.pipedrive_org_id as number);
        else q.where('nome', campos.nome as string);
      })
      .first('id')) as { id: number } | undefined;
    if (existente) {
      empresaPorChave.set(chave as string, existente.id);
      continue;
    }
    const id = await inserir(db('empresas'), { ...campos, monitorar: true, criado_em: agora });
    empresaPorChave.set(chave as string, id);
    r.empresas++;
  }

  for (const p of dados.pessoas as Linha[]) {
    const { chave, empresa, ...campos } = p;
    const existente = (await db('pessoas')
      .where('linkedin_url', campos.linkedin_url as string)
      .first('id')) as { id: number } | undefined;
    if (existente) {
      pessoaPorChave.set(chave as string, existente.id);
      continue;
    }
    const id = await inserir(db('pessoas'), {
      ...campos,
      empresa_id: empresaPorChave.get(empresa as string) ?? null,
      monitorar: true,
      criado_em: agora,
    });
    pessoaPorChave.set(chave as string, id);
    r.pessoas++;
  }

  for (const p of dados.publicacoes as Linha[]) {
    const { chave, empresa, pessoa, data, ...campos } = p;
    const existente = (await db('publicacoes')
      .where('id_externo', chave as string)
      .first('id')) as { id: number } | undefined;
    if (existente) {
      publicacaoPorChave.set(chave as string, existente.id);
      continue;
    }
    const id = await inserir(db('publicacoes'), {
      ...campos,
      tipo: 'Post',
      assuntos: classificarAssuntos(campos.texto as string).join('; '),
      data_publicacao: data,
      id_externo: chave,
      empresa_id: empresa ? (empresaPorChave.get(empresa as string) ?? null) : null,
      pessoa_id: pessoa ? (pessoaPorChave.get(pessoa as string) ?? null) : null,
      fonte_tipo: pessoa && pessoaPorChave.get(pessoa as string) ? 'pessoa' : 'empresa',
      criado_em: agora,
    });
    publicacaoPorChave.set(chave as string, id);
    r.publicacoes++;
  }

  for (const s of dados.sinais as Linha[]) {
    const { publicacao, empresa, pessoa, ...campos } = s;
    const publicacaoId = publicacaoPorChave.get(publicacao as string) ?? null;
    if (publicacaoId && (await db('sinais').where({ publicacao_id: publicacaoId, tipo: campos.tipo }).first('id')))
      continue;
    await inserir(db('sinais'), {
      ...campos,
      publicacao_id: publicacaoId,
      empresa_id: empresa ? (empresaPorChave.get(empresa as string) ?? null) : null,
      pessoa_id: pessoa ? (pessoaPorChave.get(pessoa as string) ?? null) : null,
      situacao: 'Novo',
      modelo: 'piloto',
      criado_em: agora,
    });
    r.sinais++;
  }

  for (const a of dados.alertas as Linha[]) {
    const { pessoa, ...campos } = a;
    const pessoaId = pessoaPorChave.get(pessoa as string) ?? null;
    const chave = `piloto:${campos.tipo}:${pessoa}`;
    if (await db('alertas_cadastro').where('chave', chave).first('id')) continue;
    const empresa = pessoaId ? ((await db('pessoas').where('id', pessoaId).first('empresa_id')) as Linha) : null;
    await inserir(db('alertas_cadastro'), {
      ...campos,
      chave,
      pessoa_id: pessoaId,
      empresa_id: empresa?.empresa_id ?? null,
      situacao: 'Aberto',
      criado_em: agora,
    });
    r.alertas++;
  }
  return r;
}
