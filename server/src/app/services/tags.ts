// Tags de empresas (0.4.7), como as etiquetas do Pipedrive: cadastro `tags` (nome único, cor) e `empresas.tags`
// = JSON com os ids. Uma empresa pode ter várias; a visão geral filtra por "qualquer uma de".
import { lerTags, type Tag } from '@frame/shared';
import type { EntityHooks } from '../../hooks/types';
import type { Db } from '../../db/knex';
import { inserir } from '../../db/knex';
import { badRequest, conflict } from '../../utils/http';
import { nowLocal } from '../../utils/time';

const mesmoNome = async (db: Db, nome: string, outroQue?: number) =>
  (await db('tags')
    .select('id', 'nome')
    .then((l: { id: number; nome: string }[]) =>
      l.find((t) => t.id !== outroQue && t.nome.trim().toLowerCase() === nome.trim().toLowerCase()),
    )) as { id: number; nome: string } | undefined;

export const tagsHooks: EntityHooks = {
  async beforeSave(data, { db, current }) {
    if (!('nome' in data)) return;
    const nome = String(data.nome ?? '').trim();
    if (!nome) throw badRequest('Informe o nome da tag.', { nome: 'Informe o nome da tag.' });
    data.nome = nome;
    const outra = await mesmoNome(db, nome, current?.id as number | undefined);
    if (outra) throw conflict(`Já existe a tag "${outra.nome}".`);
  },
  /** Tira a tag das empresas antes de excluir */
  async beforeDelete(current, { db }) {
    await removerTagDasEmpresas(db, Number(current.id));
  },
};

export async function removerTagDasEmpresas(db: Db, tagId: number) {
  const linhas = (await db('empresas').whereNotNull('tags').select('id', 'tags')) as { id: number; tags: string }[];
  for (const e of linhas) {
    const ids = lerTags(e.tags);
    if (ids.includes(tagId))
      await db('empresas')
        .where('id', e.id)
        .update({ tags: gravar(ids.filter((t) => t !== tagId)) });
  }
}

const gravar = (ids: number[]) => (ids.length ? JSON.stringify([...new Set(ids)].sort((a, b) => a - b)) : null);

/** Todas as tags, com quantas empresas (fora da lixeira) usam cada uma */
export async function listarTags(db: Db): Promise<Tag[]> {
  const tags = (await db('tags').orderBy('nome').select('id', 'nome', 'cor')) as Tag[];
  const empresas = (await db('empresas').whereNull('excluido_em').whereNotNull('tags').select('tags')) as {
    tags: string;
  }[];
  const uso = new Map<number, number>();
  for (const e of empresas) for (const t of lerTags(e.tags)) uso.set(t, (uso.get(t) ?? 0) + 1);
  return tags.map((t) => ({ ...t, empresas: uso.get(t.id) ?? 0 }));
}

/** Cria a tag (ou devolve a que já tem o mesmo nome) — usado pelo seletor ("+ Criar tag") */
export async function criarTag(db: Db, nome: string, cor: string): Promise<Tag> {
  const n = nome.trim();
  if (!n) throw badRequest('Informe o nome da tag.');
  if (n.length > 60) throw badRequest('Nome da tag: máximo de 60 caracteres.');
  if (!/^#[0-9a-f]{6}$/i.test(cor)) throw badRequest('Cor inválida (use #RRGGBB).');
  const existente = await mesmoNome(db, n);
  if (existente) return (await db('tags').where('id', existente.id).first('id', 'nome', 'cor')) as Tag;
  const agora = nowLocal();
  const id = await inserir(db('tags'), { nome: n, cor, criado_em: agora, atualizado_em: agora });
  return { id, nome: n, cor, empresas: 0 };
}

/** Define as tags da empresa (substitui a lista); ids que não existem são recusados */
export async function definirTagsDaEmpresa(db: Db, empresaId: number, ids: number[]) {
  const unicos = [...new Set(ids)];
  if (unicos.length) {
    const existem = (await db('tags').whereIn('id', unicos).select('id')) as { id: number }[];
    if (existem.length !== unicos.length) throw badRequest('Tag inexistente.');
  }
  const n = await db('empresas')
    .where('id', empresaId)
    .update({ tags: gravar(unicos), atualizado_em: nowLocal() });
  return Number(n) > 0;
}
