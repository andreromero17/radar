import type { ReactNode } from 'react';
import { useSettings } from '../context/SettingsContext';
import BrandMark from '../components/BrandMark';

/** Moldura das telas de acesso (login, senha): fundo com as cores do sistema e cartão central */
export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const { settings } = useSettings();
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <BrandMark settings={settings} />
          <span>{settings.nome_sistema}</span>
        </div>
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
      </div>
      {settings.organizacao && (
        <div className="auth-footer">
          © {new Date().getFullYear()} {settings.organizacao}
        </div>
      )}
    </div>
  );
}
