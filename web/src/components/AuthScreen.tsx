import { useState, type FormEvent } from 'react';
import { Briefcase, Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';
import type { AuthStatus, User } from '../../../shared/types';
import { api } from '../lib/api';
import { Button, Field, Input } from './ui';

export default function AuthScreen({ status, onAuthenticated }: { status: AuthStatus; onAuthenticated: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>(status.hasUsers ? 'login' : 'register');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { theme, toggle } = useTheme();
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const out = mode === 'login' ? await api.auth.login(email, password) : await api.auth.register(email, name, password, code);
      onAuthenticated(out.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid min-h-full place-items-center p-4">
      <button onClick={toggle} type="button" className="absolute top-3 right-3 grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-200" aria-label="Alternar tema">
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="grid size-9 place-items-center rounded-lg bg-indigo-600 text-white">
            <Briefcase size={18} />
          </span>
          Vagas CRM
        </div>
        <h1 className="mb-1 text-base font-semibold text-slate-800">{mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
        {mode === 'register' && !status.hasUsers && <p className="mb-3 text-xs text-slate-500">Primeiro acesso: crie sua conta. Cada usuário tem os próprios dados.</p>}
        <div className="space-y-3">
          {mode === 'register' && (
            <Field label="Seu nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
          )}
          <Field label="E-mail">
            <Input
              type={mode === 'register' ? 'email' : 'text'}
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              autoCapitalize="none"
              autoComplete={mode === 'register' ? 'email' : 'username'}
              placeholder="voce@email.com"
            />
          </Field>
          <Field label="Senha" hint={mode === 'register' ? 'Mínimo de 6 caracteres' : undefined}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Field>
          {mode === 'register' && status.needsCode && (
            <Field label="Código de convite">
              <Input value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" autoComplete="off" />
            </Field>
          )}
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" variant="primary" loading={loading} className="mt-4 w-full">
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
        </Button>
        {status.canRegister && status.hasUsers && (
          <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="mt-3 w-full text-center text-sm text-indigo-600 hover:underline">
            {mode === 'login' ? 'Criar outra conta' : 'Já tenho conta'}
          </button>
        )}
      </form>
    </div>
  );
}
