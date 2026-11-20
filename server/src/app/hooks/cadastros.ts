// Empresas e pessoas: a página/perfil do LinkedIn é a chave da coleta. Grava normalizada e não deixa repetir.
import { normalizarLinkedin } from '@frame/shared';
import type { EntityHooks } from '../../hooks/types';
import { badRequest, conflict } from '../../utils/http';
import { atualizarUniversoDasPublicacoes } from '../services/visao';

function chaveLinkedin(tabela: 'empresas' | 'pessoas', rotulo: string): EntityHooks {
  return {
    async beforeSave(data, { db, current }) {
      if (!('linkedin_url' in data)) return;
      const bruto = data.linkedin_url as string | null | undefined;
      if (!bruto) {
        data.linkedin_url = null;
        return;
      }
      const url = normalizarLinkedin(bruto);
      if (!url)
        throw badRequest('Endereço do LinkedIn inválido.', {
          linkedin_url: `${rotulo}: informe um endereço do LinkedIn (linkedin.com/...).`,
        });
      data.linkedin_url = url;
      const outro = (await db(tabela)
        .where('linkedin_url', url)
        .modify((q) => {
          if (current?.id) q.whereNot('id', current.id);
        })
        .first('id', 'nome', 'excluido_em')) as { id: number; nome: string; excluido_em: string | null } | undefined;
      if (outro)
        throw conflict(
          outro.excluido_em
            ? `Esse endereço do LinkedIn é de "${outro.nome}", que está na lixeira: restaure de lá.`
            : `Esse endereço do LinkedIn já está cadastrado em "${outro.nome}".`,
        );
    },
  };
}

export const empresasHooks: EntityHooks = {
  ...chaveLinkedin('empresas', 'Página no LinkedIn'),
  // o universo é copiado para as publicações (filtro da lista de publicações)
  async afterSave(row, data, { db }) {
    if (!('universo' in data)) return;
    await atualizarUniversoDasPublicacoes(db, Number(row.id));
  },
};
export const pessoasHooks = chaveLinkedin('pessoas', 'Perfil no LinkedIn');
