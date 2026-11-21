// =============================================================================
// Troca de emprego (0.4.10): post da própria pessoa monitorada classificado como "Carreira e movimentação" vira
//   • alerta de cadastro "Troca de empresa" (conferir e atualizar o cadastro e o Pipedrive);
//   • sinal — conta-alvo: Alta, "Saída de contato-chave"; concorrente: Média, "Saída de pessoa-chave". Empresa
//     "Nós" só ganha o alerta.
// Idempotente: a chave do alerta e o publicacao_id do sinal não deixam repetir. Só posts dos últimos 90 dias
// (reclassificar o histórico não deve levantar alerta de troca antiga).
// =============================================================================
import { ASSUNTO_CARREIRA, assuntosDoTexto } from '@frame/shared';
import type { Db } from '../../db/knex';
import { inserir } from '../../db/knex';
import { nowLocal } from '../../utils/time';

const DIAS = 90;

export async function registrarTrocaDeEmprego(db: Db, publicacaoId: number) {
  const pub = (await db('publicacoes').where('id', publicacaoId).first()) as
    | {
        id: number;
        pessoa_id: number | null;
        empresa_id: number | null;
        post_proprio: unknown;
        assuntos: string | null;
        data_publicacao: string | null;
        titulo: string | null;
        id_externo: string | null;
      }
    | undefined;
  if (!pub?.pessoa_id || !pub.post_proprio || !assuntosDoTexto(pub.assuntos).includes(ASSUNTO_CARREIRA)) return false;
  const limite = new Date(Date.now() - DIAS * 86_400_000).toISOString().slice(0, 10);
  if (!pub.data_publicacao || pub.data_publicacao < limite) return false;
  const pessoa = (await db('pessoas').where('id', pub.pessoa_id).first('id', 'nome', 'empresa_id')) as
    { id: number; nome: string; empresa_id: number | null } | undefined;
  if (!pessoa) return false;
  const empresaId = pessoa.empresa_id ?? pub.empresa_id;
  const empresa = empresaId
    ? ((await db('empresas').where('id', empresaId).first('id', 'nome', 'nome_curto', 'universo')) as
        { id: number; nome: string; nome_curto: string | null; universo: string } | undefined)
    : undefined;
  const nomeEmpresa = empresa ? empresa.nome_curto || empresa.nome : 'a empresa';
  const agora = nowLocal();

  const chave = `carreira:${pessoa.id}:${pub.id_externo ?? pub.id}`.slice(0, 250);
  if (!(await db('alertas_cadastro').where('chave', chave).first('id')))
    await inserir(db('alertas_cadastro'), {
      tipo: 'Troca de empresa',
      pessoa_id: pessoa.id,
      empresa_id: empresaId,
      detalhe: `${pessoa.nome} publicou que está mudando de emprego (${pub.data_publicacao.split('-').reverse().join('/')}): "${(pub.titulo ?? '').slice(0, 120)}".`,
      sugestao: `Conferir se saiu de ${nomeEmpresa}, atualizar o cadastro e o Pipedrive e achar quem assume o lugar dela.`,
      situacao: 'Aberto',
      chave,
      criado_em: agora,
    });

  if (empresa && (empresa.universo === 'Conta-alvo' || empresa.universo === 'Concorrente')) {
    if (!(await db('sinais').where('publicacao_id', pub.id).first('id'))) {
      const conta = empresa.universo === 'Conta-alvo';
      await inserir(db('sinais'), {
        data: pub.data_publicacao,
        universo: empresa.universo,
        severidade: conta ? 'Alta' : 'Média',
        confianca: 60,
        tipo: conta ? 'Saída de contato-chave' : 'Saída de pessoa-chave',
        empresa_id: empresa.id,
        pessoa_id: pessoa.id,
        publicacao_id: pub.id,
        titulo: `${pessoa.nome} anunciou mudança de emprego`,
        gancho: conta
          ? `Contato-chave saindo de ${nomeEmpresa}: achar o novo responsável na conta — e, se a empresa nova dela tiver o perfil, abordar lá.`
          : `Pessoa-chave saindo de ${nomeEmpresa}: ver para onde foi (pode virar cliente ou parceira) e se a saída abre espaço na conta.`,
        situacao: 'Novo',
        modelo: 'regra:carreira',
        criado_em: agora,
      });
    }
  }
  return true;
}
