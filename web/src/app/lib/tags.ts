// Tags de empresas (0.4.7): lista carregada uma vez e compartilhada entre os componentes; `recarregarTags()` depois
// de criar/alterar. Filtro da visão geral: ?tags=1,3 na URL, lembrado no navegador.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { lerTags, type Tag } from '@frame/shared';
import { api } from '../../lib/api';

let cache: Tag[] | null = null;
let pedido: Promise<void> | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

export function recarregarTags() {
  pedido = api
    .get<Tag[]>('/radar/tags')
    .then((l) => {
      cache = l;
      avisar();
    })
    .catch(() => {
      cache = cache ?? [];
      avisar();
    })
    .finally(() => {
      pedido = null;
    });
  return pedido;
}

/** Todas as tags (null enquanto carrega) e um mapa por id */
export function useTags() {
  const tags = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => cache,
  );
  // mostra o que já tem e atualiza ao montar: tags criadas/alteradas no cadastro genérico (menu Tags) não passam
  // por aqui (0.4.8: antes a lista ficava a da primeira carga até recarregar a página)
  useEffect(() => {
    if (!pedido) void recarregarTags();
  }, []);
  const porId = new Map((tags ?? []).map((t) => [t.id, t]));
  return { tags, porId };
}

/** Texto legível sobre a cor da tag (preto ou branco, pela luminância) */
export function corDoTexto(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#fff';
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return l > 0.45 ? '#1f2328' : '#fff';
}

const CHAVE = 'radar.tags';
/** Tags escolhidas no filtro da visão geral (URL ?tags=1,3; sem ela, a última escolha guardada) */
export function useFiltroTags(): [number[], (ids: number[]) => void] {
  const [params, setParams] = useSearchParams();
  const daUrl = params.get('tags');
  const [guardadas] = useState(() => {
    try {
      return lerTags((localStorage.getItem(CHAVE) ?? '').split(','));
    } catch {
      return [];
    }
  });
  const ids = daUrl != null ? lerTags(daUrl.split(',')) : guardadas;
  const mudar = useCallback(
    (novos: number[]) => {
      try {
        localStorage.setItem(CHAVE, novos.join(','));
      } catch {
        /* só a URL */
      }
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.set('tags', novos.join(','));
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [ids, mudar];
}
