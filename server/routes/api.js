import express from 'express';
import * as kb from '../lib/knowledge.js';
import { getEntry } from '../lib/sep.js';
import { runSepSync, syncState } from '../lib/sep-sync.js';
import { status as ollamaStatus } from '../lib/ollama.js';
import * as tutor from '../lib/tutor.js';
import { offlineQuiz } from '../lib/quiz.js';

export const api = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const notFound = (what) => Object.assign(new Error(`${what} not found`), { status: 404 });

api.get('/meta', (_req, res) => res.json(kb.meta()));

// Philosophers -------------------------------------------------------------
api.get('/philosophers', (req, res) => {
  const { q, era, tradition, topic, source } = req.query;
  res.json(kb.listPhilosophers({ q, era, tradition, topic, source }));
});

api.get('/philosophers/:id', (req, res) => {
  const p = kb.getPhilosopher(req.params.id);
  if (!p) throw notFound('Philosopher');
  res.json(p);
});

api.get('/philosophers/:id/era-map', (req, res) => {
  const m = kb.eraMap(req.params.id);
  if (!m) throw notFound('Philosopher');
  res.json(m);
});

api.get('/philosophers/:id/timeline', (req, res) => {
  const t = kb.personalTimeline(req.params.id);
  if (!t) throw notFound('Philosopher');
  res.json(t);
});

api.get('/philosophers/:id/graph', (req, res) => {
  const g = kb.influenceGraph(req.params.id, Math.min(3, Number(req.query.depth) || 2));
  if (!g) throw notFound('Philosopher');
  res.json(g);
});

// Topics, timeline ---------------------------------------------------------
api.get('/topics', (_req, res) => res.json({ topics: kb.getTopics(), sepTopics: kb.sepTopics() }));

api.get('/topics/:id', (req, res) => {
  const t = kb.getTopic(req.params.id, req.query.with);
  if (!t) throw notFound('Topic');
  res.json(t);
});

api.get('/timeline', (req, res) => res.json(kb.globalTimeline({ era: req.query.era, topic: req.query.topic })));

// Stanford Encyclopedia ----------------------------------------------------
api.get('/sep/entry/:slug', wrap(async (req, res) => {
  res.json(await getEntry(req.params.slug, { force: req.query.refresh === '1' }));
}));

api.get('/sep/sync', (_req, res) => res.json({ ...syncState, stats: kb.stats() }));

api.post('/sep/sync', (req, res) => {
  if (syncState.running) return res.status(409).json(syncState);
  runSepSync({
    force: Boolean(req.body?.force),
    limit: Number(req.body?.limit) || Infinity,
    log: (m) => console.log('[sep-sync]', m),
    onDone: () => kb.reload(),
  }).catch((err) => console.error('[sep-sync] failed:', err.message));
  res.status(202).json(syncState);
});

// AI tutor (local Ollama) --------------------------------------------------
api.get('/ai/status', wrap(async (req, res) => {
  res.json(await ollamaStatus({ refresh: req.query.refresh === '1' }));
}));

// Streams plain text so the browser can render the answer as it is generated.
async function stream(res, run) {
  const s = await ollamaStatus();
  if (!s.model) return res.status(503).json({ error: s.error });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Model', s.model);
  try {
    await run((token) => res.write(token));
  } catch (err) {
    res.write(`\n\n[Tutor error: ${err.message}]`);
  }
  res.end();
}

api.post('/ai/ask', wrap(async (req, res) => {
  const { question, philosopherId, topicId, sepSlug, history, level } = req.body || {};
  if (!question || typeof question !== 'string') return res.status(400).json({ error: 'question is required' });
  await stream(res, (onToken) => tutor.ask({ question: question.slice(0, 2000), philosopherId, topicId, sepSlug, history, level }, onToken));
}));

api.post('/ai/connection', wrap(async (req, res) => {
  const { philosopherId, targetType, targetId } = req.body || {};
  if (!philosopherId || !targetId) return res.status(400).json({ error: 'philosopherId and targetId are required' });
  await stream(res, (onToken) => tutor.explainConnection({ philosopherId, targetType, targetId }, onToken));
}));

api.post('/ai/quiz', wrap(async (req, res) => {
  const { philosopherId, topicId, difficulty } = req.body || {};
  const count = Math.min(10, Math.max(1, Number(req.body?.count) || 5));
  const s = await ollamaStatus();
  if (s.model && req.body?.mode !== 'offline') {
    try {
      const questions = await tutor.generateQuiz({ philosopherId, topicId, count, difficulty });
      if (questions.length) return res.json({ source: 'ai', model: s.model, questions });
    } catch (err) {
      console.warn('[quiz] AI generation failed, using offline quiz:', err.message);
    }
  }
  res.json({ source: 'offline', note: s.error || undefined, questions: offlineQuiz({ philosopherId, topicId, count }) });
}));

api.post('/ai/enrich/:id', wrap(async (req, res) => {
  res.json(await tutor.enrich(req.params.id));
}));

api.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message });
});
