import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { AIProvider } from '../shared/types.ts';
import { AIError, complete } from './ai.ts';
import { authRouter, requireAuth, uid } from './auth.ts';
import { contactsRouter } from './routes/contacts.ts';
import { HttpError } from './routes/errors.ts';
import { evsRouter } from './routes/evs.ts';
import { indicatorsRouter } from './routes/indicators.ts';
import { jobsRouter } from './routes/jobs.ts';
import { resumesRouter } from './routes/resumes.ts';
import { getSettings, toPublic, updateSettings } from './settings.ts';

const app = express();
app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);

// Tudo abaixo exige login; cada usuário só enxerga os próprios dados.
app.use('/api', requireAuth);

app.get('/api/settings', (req, res) => {
  res.json(toPublic(getSettings(uid(req))));
});

app.put('/api/settings', (req, res) => {
  res.json(toPublic(updateSettings(uid(req), req.body ?? {})));
});

app.post('/api/settings/test-ai', async (req, res) => {
  const provider = req.body?.provider as AIProvider | undefined;
  const started = Date.now();
  const text = await complete({
    userId: uid(req),
    provider,
    system: 'Você é um assistente de teste de conexão.',
    prompt: 'Responda apenas: OK',
    maxTokens: 2000,
  });
  res.json({ ok: true, reply: text.trim().slice(0, 100), ms: Date.now() - started });
});

app.use('/api/jobs', jobsRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/resumes', resumesRouter);
app.use('/api/evs', evsRouter);
app.use('/api/indicators', indicatorsRouter);

// Em produção (npm start) o próprio servidor entrega o front buildado.
const dist = path.resolve(import.meta.dirname, '..', 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError || err instanceof AIError ? err.status : 500;
  if (status >= 500) console.error(err);
  const message = err.name === 'TimeoutError' ? 'A IA demorou demais para responder. Tente novamente.' : err.message;
  res.status(status).json({ error: message || 'Erro inesperado' });
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
