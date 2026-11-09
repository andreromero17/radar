import type { CSSProperties } from 'react';

/** Badge colorido (a cor vai em --badge; o tema decide se é bloco cheio ou tom suave) para campos select com `colors` definidos nas entidades */
export default function ValueBadge({ value, colors = {} }: { value: unknown; colors?: Record<string, string> }) {
  if (value == null || value === '') return <span className="text-muted">—</span>;
  const text = String(value);
  return (
    <span className="badge-pill" style={{ '--badge': colors[text] || '#6c757d' } as CSSProperties}>
      {text}
    </span>
  );
}
