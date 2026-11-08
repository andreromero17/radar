import { Fragment } from 'react';
import { Form, Table } from 'react-bootstrap';
import { ACTION_LABELS, ACTIONS, resources, type Action, type Permissions } from '@frame/shared';

interface Props {
  value: Permissions | null | undefined;
  onChange: (value: Permissions) => void;
  disabled?: boolean;
  /** Mostra todas marcadas (ex.: perfil com acesso total) */
  allGranted?: boolean;
}

/** Matriz recurso × ação para editar as permissões de um perfil */
export default function PermissionMatrix({ value, onChange, disabled, allGranted }: Props) {
  const perms = value ?? {};
  const list = resources();
  const groups = [...new Set(list.map((r) => r.group))];

  const has = (key: string, a: Action) => allGranted || (perms[key]?.includes(a) ?? false);
  const set = (key: string, acts: Action[]) => {
    const next = { ...perms, [key]: ACTIONS.filter((a) => acts.includes(a)) };
    if (!next[key].length) delete next[key];
    onChange(next);
  };
  const toggle = (key: string, a: Action) => {
    const cur = perms[key] ?? [];
    // Marcar qualquer ação implica poder "ver"; desmarcar "ver" tira tudo
    if (cur.includes(a)) set(key, a === 'ver' ? [] : cur.filter((x) => x !== a));
    else {
      const implicaVer = a !== 'ver' && list.find((r) => r.key === key)?.actions.includes('ver');
      set(key, [...cur, a, ...(implicaVer ? (['ver'] as Action[]) : [])]);
    }
  };

  return (
    <div className={`permission-matrix ${disabled ? 'is-disabled' : ''}`}>
      {allGranted && (
        <div className="small text-muted mb-2">
          <i className="bi bi-shield-check text-success me-1" />
          Perfil com acesso total: todas as permissões estão liberadas.
        </div>
      )}
      <Table responsive size="sm" className="mb-0 align-middle">
        <thead>
          <tr>
            <th>Recurso</th>
            <th className="text-center">Tudo</th>
            {ACTIONS.map((a) => (
              <th key={a} className="text-center">
                {ACTION_LABELS[a]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g}>{renderGroup(g)}</Fragment>
          ))}
        </tbody>
      </Table>
    </div>
  );

  // função (não componente) para não remontar as linhas a cada clique
  function renderGroup(group: string) {
    return (
      <>
        <tr className="group-row">
          <td colSpan={ACTIONS.length + 2}>{group}</td>
        </tr>
        {list
          .filter((r) => r.group === group)
          .map((r) => {
            const all = r.actions.every((a) => has(r.key, a));
            return (
              <tr key={r.key}>
                <td className="text-nowrap">
                  <i className={`bi bi-${r.icon} me-2 text-muted`} />
                  {r.label}
                </td>
                <td className="text-center">
                  <Form.Check
                    aria-label={`Todas as permissões de ${r.label}`}
                    checked={all}
                    disabled={disabled}
                    onChange={() => set(r.key, all ? [] : [...r.actions])}
                    className="d-inline-block"
                  />
                </td>
                {ACTIONS.map((a) => (
                  <td key={a} className="text-center">
                    {r.actions.includes(a) ? (
                      <Form.Check
                        aria-label={`${ACTION_LABELS[a]} ${r.label}`}
                        checked={has(r.key, a)}
                        disabled={disabled}
                        onChange={() => toggle(r.key, a)}
                        className="d-inline-block"
                      />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
      </>
    );
  }
}
