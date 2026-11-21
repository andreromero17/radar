// Tag colorida (0.4.7). Com `onRemover`, mostra o × (filtro da visão geral).
import type { Tag } from '@frame/shared';
import { corDoTexto } from '../lib/tags';

export default function TagPill({
  tag,
  pequena,
  onRemover,
}: {
  tag: Pick<Tag, 'nome' | 'cor'>;
  pequena?: boolean;
  onRemover?: () => void;
}) {
  return (
    <span
      className={`radar-tag${pequena ? ' radar-tag-sm' : ''}`}
      style={{ background: tag.cor, color: corDoTexto(tag.cor) }}
      title={tag.nome}
    >
      {tag.nome}
      {onRemover && (
        <button type="button" aria-label={`Tirar ${tag.nome}`} onClick={onRemover}>
          ×
        </button>
      )}
    </span>
  );
}

/** As tags de uma empresa, pelos ids (ignora id que não existe mais) */
export function TagsDaEmpresa({ ids, porId }: { ids: number[]; porId: Map<number, Tag> }) {
  const lista = ids.map((id) => porId.get(id)).filter((t): t is Tag => !!t);
  if (!lista.length) return null;
  return (
    <span className="d-inline-flex flex-wrap gap-1 ms-2 align-middle">
      {lista.map((t) => (
        <TagPill key={t.id} tag={t} pequena />
      ))}
    </span>
  );
}
