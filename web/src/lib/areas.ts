import { entities } from '@frame/shared';

/** Áreas que aparecem nos logs: cadastros + acessos + sistema */
export function areas() {
  return [
    ...Object.entries(entities).map(([k, e]) => ({ value: k, label: e.label })),
    { value: 'auth', label: 'Acessos (login/senha)' },
    { value: 'sistema', label: 'Sistema' },
  ];
}

export const areaLabel = (key: string | null | undefined) => areas().find((a) => a.value === key)?.label ?? key ?? '—';
