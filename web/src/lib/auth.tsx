import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import type { AuthStatus, User } from '../../../shared/types';
import AuthScreen from '../components/AuthScreen';
import { api, UNAUTHORIZED_EVENT } from './api';

interface AuthState {
  user: User;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Só renderiza o app depois do login; sem sessão, mostra a tela de entrar/criar conta. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);

  const load = useCallback(() => api.auth.status().then(setStatus).catch(() => setStatus({ user: null, canRegister: false, hasUsers: true, needsCode: false })), []);

  useEffect(() => {
    load();
    const onUnauthorized = () => load();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [load]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    window.location.hash = '';
    await load();
  }, [load]);

  if (!status) {
    return (
      <div className="grid h-full place-items-center text-slate-500">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!status.user) return <AuthScreen status={status} onAuthenticated={(user) => setStatus({ ...status, user })} />;
  // A key força o app (e todo o estado carregado) a reiniciar ao trocar de usuário.
  return (
    <AuthContext.Provider value={{ user: status.user, logout }} key={status.user.id}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthGate');
  return ctx;
}
