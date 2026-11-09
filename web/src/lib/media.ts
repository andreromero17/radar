import { useEffect, useState } from 'react';

/** true enquanto a media query casa (ex.: desktop = '(min-width: 992px)') */
export function useMedia(query: string) {
  const [ok, setOk] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = (e: MediaQueryListEvent) => setOk(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return ok;
}

export const useIsDesktop = () => useMedia('(min-width: 992px)');
