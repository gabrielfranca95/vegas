import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Company, Contact, EV, Job, PublicSettings, Resume } from '../../../shared/types';
import { api } from './api';

interface DataState {
  settings: PublicSettings | null;
  jobs: Job[];
  contacts: Contact[];
  resumes: Resume[];
  companies: Company[];
  evs: EV[];
  loading: boolean;
  refresh: (what?: ('settings' | 'jobs' | 'contacts' | 'resumes' | 'companies' | 'evs')[]) => Promise<void>;
  setSettings: (s: PublicSettings) => void;
  upsertContact: (c: Contact) => void;
  upsertEV: (e: EV) => void;
  setJobs: (jobs: Job[]) => void;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [evs, setEVs] = useState<EV[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback<DataState['refresh']>(async (what) => {
    const all = !what;
    const tasks: Promise<unknown>[] = [];
    if (all || what.includes('settings')) tasks.push(api.settings.get().then(setSettings));
    if (all || what.includes('jobs')) tasks.push(api.jobs.list().then(setJobs));
    if (all || what.includes('contacts')) tasks.push(api.contacts.list().then(setContacts));
    if (all || what.includes('resumes')) tasks.push(api.resumes.list().then(setResumes));
    if (all || what.includes('companies')) tasks.push(api.jobs.companies().then(setCompanies));
    if (all || what.includes('evs')) tasks.push(api.evs.list().then(setEVs));
    await Promise.all(tasks);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // Recalcula lembretes de follow-up periodicamente (o tempo passa mesmo sem ações).
    const t = setInterval(() => refresh(['contacts', 'jobs']).catch(() => {}), 5 * 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  // Enquanto houver currículo sendo adaptado em segundo plano, atualiza vagas e currículos.
  const tailoringActive = jobs.some((j) => j.tailoring && j.tailoring.status !== 'error');
  useEffect(() => {
    if (!tailoringActive) return;
    const t = setInterval(() => refresh(['jobs', 'resumes']).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [tailoringActive, refresh]);

  const upsertContact = useCallback((c: Contact) => {
    setContacts((list) => {
      const idx = list.findIndex((x) => x.id === c.id);
      if (idx === -1) return [c, ...list];
      const copy = [...list];
      copy[idx] = c;
      return copy;
    });
  }, []);

  const upsertEV = useCallback((e: EV) => {
    setEVs((list) => {
      const idx = list.findIndex((x) => x.id === e.id);
      if (idx === -1) return [e, ...list];
      const copy = [...list];
      copy[idx] = e;
      return copy;
    });
  }, []);

  const value = useMemo(
    () => ({ settings, jobs, contacts, resumes, companies, evs, loading, refresh, setSettings, upsertContact, upsertEV, setJobs }),
    [settings, jobs, contacts, resumes, companies, evs, loading, refresh, upsertContact, upsertEV],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData fora do DataProvider');
  return ctx;
}
