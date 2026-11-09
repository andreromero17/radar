import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { useIsDesktop } from '../lib/media';
import type { Volta } from '../lib/voltar';

interface Props {
  title: string;
  icon?: string;
  subtitle?: ReactNode;
  /** Seta de voltar: caminho ou { to, state } (ver lib/voltar.ts) */
  back?: string | Volta;
  children?: ReactNode;
}

/**
 * Título da página com ações. No tema Minimalista (desktop) o título e as ações
 * sobem para a barra do topo; o subtítulo fica no conteúdo.
 */
export default function PageHeader({ title, icon, subtitle, back, children }: Props) {
  const { settings } = useSettings();
  const isDesktop = useIsDesktop();
  const [slots, setSlots] = useState<{ title: HTMLElement; actions: HTMLElement } | null>(null);
  const noTopo = settings.tema === 'minimalista' && isDesktop;

  useEffect(() => {
    const t = document.getElementById('topbar-title');
    const a = document.getElementById('topbar-actions');
    setSlots(noTopo && t && a ? { title: t, actions: a } : null);
  }, [noTopo]);

  const voltar = back && (
    <Link
      to={typeof back === 'string' ? back : back.to}
      state={typeof back === 'string' ? undefined : back.state}
      className="btn btn-light btn-sm me-1"
      aria-label="Voltar"
    >
      <i className="bi bi-arrow-left" />
    </Link>
  );

  if (slots)
    return (
      <>
        {createPortal(
          <>
            {voltar}
            <h1 className="page-title">{title}</h1>
          </>,
          slots.title,
        )}
        {children && createPortal(children, slots.actions)}
        {subtitle && <div className="text-muted small mb-3">{subtitle}</div>}
      </>
    );

  return (
    <div className="page-header">
      <div className="d-flex align-items-center gap-2">
        {voltar}
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
