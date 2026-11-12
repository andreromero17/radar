import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { can as canDo, type Action, type AuthUser } from '@frame/shared';
import { api, AUTH_EXPIRED, AUTH_MUST_CHANGE_PASSWORD, AUTH_MUST_SETUP_2FA } from '../lib/api';
import { applyAparencia, applyTamanho, cachedAparencia, cachedTamanho } from '../lib/theme';
import { useToast } from './ToastContext';
import { limparPeriodo } from '../lib/periodoGlobal';

interface AuthApi {
  user: AuthUser | null;
  /** Ainda verificando se há sessão */
  loading: boolean;
  /** Entra com e-mail e senha. Com verificação em duas etapas, devolve o desafio (e não entra ainda) */
  login(email: string, senha: string, lembrar: boolean): Promise<AuthUser | { segundo_fator: true; desafio: string }>;
  /** Segunda etapa: código do aplicativo (ou de recuperação) */
  entrarComCodigo(desafio: string, codigo: string): Promise<AuthUser>;
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

  // aparência (claro/escuro): a do usuário logado ou a última usada neste navegador
  useEffect(() => {
    applyAparencia(user?.aparencia ?? cachedAparencia());
  }, [user?.aparencia]);
  useEffect(() => {
    applyTamanho(user?.tamanho_texto ?? cachedTamanho());
  }, [user?.tamanho_texto]);

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
    const must2fa = () => setUser((u) => (u ? { ...u, exige_2fa: true } : u));
    window.addEventListener(AUTH_EXPIRED, expired);
    window.addEventListener(AUTH_MUST_CHANGE_PASSWORD, mustChange);
    window.addEventListener(AUTH_MUST_SETUP_2FA, must2fa);
    return () => {
      window.removeEventListener(AUTH_EXPIRED, expired);
      window.removeEventListener(AUTH_MUST_CHANGE_PASSWORD, mustChange);
      window.removeEventListener(AUTH_MUST_SETUP_2FA, must2fa);
    };
  }, [toast]);

  const login = useCallback(async (email: string, senha: string, lembrar: boolean) => {
    const r = await api.post<AuthUser | { segundo_fator: true; desafio: string }>('/auth/login', {
      email,
      senha,
      lembrar,
    });
    if ('segundo_fator' in r) return r;
    limparPeriodo(); // novo login começa no mês atual
    setUser(r);
    return r;
  }, []);
  const entrarComCodigo = useCallback(async (desafio: string, codigo: string) => {
    const u = await api.post<AuthUser>('/auth/2fa/entrar', { desafio, codigo });
    limparPeriodo();
    setUser(u);
    return u;
  }, []);

  // Saída explícita vai para o login "limpo" (sem voltar à última tela de quem saiu)
  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    limparPeriodo();
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo<AuthApi>(
    () => ({ user, loading, login, entrarComCodigo, logout, setUser, can: (r, a) => canDo(user, r, a) }),
    [user, loading, login, entrarComCodigo, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
