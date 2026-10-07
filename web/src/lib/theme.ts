import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'vagas-theme';

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Tema atual (escolha salva ou o do sistema) e função para alternar. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? systemTheme());

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Sem escolha salva, acompanha mudanças do tema do sistema.
  useEffect(() => {
    if (stored()) return;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(mq.matches ? 'dark' : 'light');
    mq?.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* armazenamento indisponível: vale só nesta sessão */
    }
    setTheme(next);
  };

  return { theme, toggle };
}
