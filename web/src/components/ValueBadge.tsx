/** Badge colorido para campos select com `colors` definidos nas entidades */
export default function ValueBadge({ value, colors = {} }: { value: unknown; colors?: Record<string, string> }) {
  if (value == null || value === '') return <span className="text-muted">—</span>;
  const text = String(value);
  return (
    <span className="badge-pill" style={{ background: colors[text] || '#6c757d' }}>
      {text}
    </span>
  );
}
