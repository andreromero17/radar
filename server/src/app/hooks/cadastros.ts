// Empresas e pessoas: a página/perfil do LinkedIn é a chave da coleta. Grava normalizada e não deixa repetir.
import { normalizarLinkedin } from '@frame/shared';
import type { EntityHooks } from '../../hooks/types';
import { badRequest, conflict } from '../../utils/http';

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
        .first('id', 'nome')) as { id: number; nome: string } | undefined;
      if (outro) throw conflict(`Esse endereço do LinkedIn já está cadastrado em "${outro.nome}".`);
    },
  };
}

export const empresasHooks = chaveLinkedin('empresas', 'Página no LinkedIn');
export const pessoasHooks = chaveLinkedin('pessoas', 'Perfil no LinkedIn');
