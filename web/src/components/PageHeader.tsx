import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  title: string;
  icon?: string;
  subtitle?: ReactNode;
  back?: string;
  children?: ReactNode;
}

export default function PageHeader({ title, icon, subtitle, back, children }: Props) {
  return (
    <div className="page-header">
      <div className="d-flex align-items-center gap-2">
        {back && (
          <Link to={back} className="btn btn-light btn-sm me-1" aria-label="Voltar">
            <i className="bi bi-arrow-left" />
          </Link>
        )}
        {icon && <i className={`bi bi-${icon} fs-4 text-primary`} />}
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <div className="text-muted small">{subtitle}</div>}
        </div>
      </div>
      <div className="d-flex gap-2 flex-wrap">{children}</div>
    </div>
  );
}
