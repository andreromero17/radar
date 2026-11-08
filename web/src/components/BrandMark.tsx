import type { Settings } from '@frame/shared';

/** Logo (se houver) ou ícone do sistema, conforme as configurações. */
export default function BrandMark({ settings }: { settings: Pick<Settings, 'logo' | 'icone'> }) {
  if (settings.logo) {
    return (
      <span className="brand-icon brand-logo">
        <img src={settings.logo} alt="" />
      </span>
    );
  }
  return (
    <span className="brand-icon">
      <i className={`bi bi-${settings.icone || 'box-seam'}`} />
    </span>
  );
}
