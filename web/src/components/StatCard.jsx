import { Link } from 'react-router-dom';

export default function StatCard({ label, value, icon, color = 'blue', to }) {
  const content = (
    <>
      <div className="d-flex align-items-center">
        <span className="stat-icon"><i className={`bi bi-${icon}`} /></span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value ?? '—'}</div>
      <i className={`bi bi-${icon} stat-bg-icon`} />
    </>
  );
  const cls = `stat-card bg-grad-${color}`;
  return to ? <Link to={to} className={cls}>{content}</Link> : <div className={cls}>{content}</div>;
}
