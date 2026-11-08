import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { can as canDo, type Action, type AuthUser } from '@frame/shared';
import { api, AUTH_EXPIRED, AUTH_MUST_CHANGE_PASSWORD } from '../lib/api';
import { useToast } from './ToastContext';

interface AuthApi {
  user: AuthUser | null;
  /** Ainda verificando se há sessão */
  loading: boolean;
  login(email: string, senha: string, lembrar: boolean): Promise<AuthUser>;
  logout(): Promise<void>;
  /** Atualiza o usuário (ex.: após trocar a senha) */
  setUser(user: AuthUser | null): void;
  can(resource: string, action: Action): boolean;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<AuthUser>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const expired = () =>
      setUser((u) => {
        if (u) toast.info('Sua sessão expirou. Entre novamente.');
        return null;
      });
    const mustChange = () => setUser((u) => (u ? { ...u, trocar_senha: true } : u));
    window.addEventListener(AUTH_EXPIRED, expired);
    window.addEventListener(AUTH_MUST_CHANGE_PASSWORD, mustChange);
    return () => {
      window.removeEventListener(AUTH_EXPIRED, expired);
      window.removeEventListener(AUTH_MUST_CHANGE_PASSWORD, mustChange);
    };
  }, [toast]);

  const login = useCallback(async (email: string, senha: string, lembrar: boolean) => {
    const u = await api.post<AuthUser>('/auth/login', { email, senha, lembrar });
    setUser(u);
    return u;
  }, []);

  // Saída explícita vai para o login "limpo" (sem voltar à última tela de quem saiu)
  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo<AuthApi>(
    () => ({ user, loading, login, logout, setUser, can: (r, a) => canDo(user, r, a) }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
