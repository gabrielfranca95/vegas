import { useEffect, useState } from 'react';
import { BarChart3, Briefcase, FileText, Gift, Loader2, LogOut, MessagesSquare, Moon, Settings as SettingsIcon, Sun } from 'lucide-react';
import { useTheme } from './lib/theme';
import { Dropdown, MenuItem } from './components/ui';
import { useAuth } from './lib/auth';
import { useData } from './lib/store';
import EVPage from './pages/EVPage';
import IndicatorsPage from './pages/IndicatorsPage';
import KanbanPage from './pages/KanbanPage';
import MessagesPage from './pages/MessagesPage';
import ResumePage from './pages/ResumePage';
import SettingsPage from './pages/SettingsPage';

export type Tab = 'vagas' | 'mensagens' | 'ev' | 'curriculo' | 'indicadores' | 'config';

const TABS: Tab[] = ['vagas', 'mensagens', 'ev', 'curriculo', 'indicadores', 'config'];

export interface Route {
  tab: Tab;
  params: URLSearchParams;
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const tab = (TABS.includes(path as Tab) ? path : 'vagas') as Tab;
  return { tab, params: new URLSearchParams(query ?? '') };
}

export function navigate(tab: Tab, params: Record<string, string | number> = {}) {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  window.location.hash = `/${tab}${q ? `?${q}` : ''}`;
}

export default function App() {
  const { loading, contacts, settings } = useData();
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const pending = contacts.filter((c) => c.nextAction.urgent).length;
  const aiReady = settings ? settings.hasKey[settings.ai.provider] : false;

  const tabs: { key: Tab; label: string; short: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'vagas', label: 'Vagas', short: 'Vagas', icon: <Briefcase size={18} /> },
    { key: 'mensagens', label: 'Mensagens', short: 'Msgs', icon: <MessagesSquare size={18} />, badge: pending },
    { key: 'ev', label: 'Entrega de Valor', short: 'EV', icon: <Gift size={18} /> },
    { key: 'curriculo', label: 'Currículo', short: 'CV', icon: <FileText size={18} /> },
    { key: 'indicadores', label: 'Indicadores', short: 'Dados', icon: <BarChart3 size={18} /> },
    { key: 'config', label: 'Configurações', short: 'Config', icon: <SettingsIcon size={18} /> },
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-3 md:px-5">
        <div className="flex items-center gap-2 py-2.5 font-bold text-slate-900 md:py-3">
          <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white">
            <Briefcase size={17} />
          </span>
          <span className="hidden sm:inline">Vagas CRM</span>
        </div>
        <nav className="hidden gap-1 md:flex">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => navigate(t.key)}
              className={`relative flex items-center gap-2 border-b-2 px-2.5 py-4 text-sm font-medium whitespace-nowrap transition-colors lg:px-3 ${
                route.tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.icon}
              <span className="hidden lg:inline">{t.label}</span>
              <span className="lg:hidden">{t.short}</span>
              {!!t.badge && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">{t.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {settings && (
            <button
              onClick={() => navigate('config')}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${aiReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
              title={aiReady ? `${settings.ai.provider} · ${settings.ai.models[settings.ai.provider]}` : 'Configure uma chave de IA'}
            >
              <span className={`size-2 rounded-full ${aiReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="hidden xl:inline">{aiReady ? `IA: ${settings.ai.provider} · ${settings.ai.models[settings.ai.provider]}` : 'IA não configurada'}</span>
              <span className="xl:hidden">{aiReady ? 'IA' : 'Sem IA'}</span>
            </button>
          )}
          <button
            onClick={toggleTheme}
            className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            title={theme === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
            aria-label="Alternar tema"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Dropdown
            align="right"
            trigger={(toggle) => (
              <button onClick={toggle} className="grid size-8 place-items-center rounded-full bg-slate-800 text-sm font-semibold text-white" title={user.name}>
                {user.name[0]?.toUpperCase()}
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="border-b border-slate-100 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                  <p className="text-xs break-all text-slate-500">{user.username}</p>
                </div>
                <MenuItem icon={<SettingsIcon size={15} />} onClick={() => (close(), navigate('config'))}>
                  Configurações
                </MenuItem>
                <MenuItem icon={<LogOut size={15} />} onClick={() => (close(), logout())}>
                  Sair
                </MenuItem>
              </>
            )}
          </Dropdown>
        </div>
      </header>

      <main className="min-h-0 flex-1 pb-16 md:pb-0">
        {loading ? (
          <div className="grid h-full place-items-center text-slate-500">
            <Loader2 className="animate-spin" />
          </div>
        ) : route.tab === 'vagas' ? (
          <KanbanPage route={route} />
        ) : route.tab === 'mensagens' ? (
          <MessagesPage route={route} />
        ) : route.tab === 'ev' ? (
          <EVPage route={route} />
        ) : route.tab === 'curriculo' ? (
          <ResumePage route={route} />
        ) : route.tab === 'indicadores' ? (
          <IndicatorsPage />
        ) : (
          <SettingsPage />
        )}
      </main>

      {/* Navegação inferior no celular */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => navigate(t.key)}
            className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${route.tab === t.key ? 'text-indigo-700' : 'text-slate-500'}`}
          >
            {t.icon}
            {t.short}
            {!!t.badge && <span className="absolute top-1 right-[calc(50%-18px)] rounded-full bg-red-500 px-1 text-[9px] leading-tight font-bold text-white">{t.badge}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
