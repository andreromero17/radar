/** Badge colorido para campos select com `colors` definidos em entities.js */
export default function ValueBadge({ value, colors = {} }) {
  if (value == null) return <span className="text-muted">—</span>;
  return (
    <span className="badge-pill" style={{ background: colors[value] || '#6c757d' }}>
      {value}
    </span>
  );
}
