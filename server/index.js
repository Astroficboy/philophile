import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import { api } from './routes/api.js';
import { stats } from './lib/knowledge.js';
import { status as ollamaStatus } from './lib/ollama.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', api);

app.use(express.static(path.join(config.root, 'public')));
app.use('/vendor/d3', express.static(path.join(config.root, 'node_modules', 'd3', 'dist')));
app.get('*', (_req, res) => res.sendFile(path.join(config.root, 'public', 'index.html')));

app.listen(config.port, async () => {
  const s = stats();
  console.log(`Philophile running at http://localhost:${config.port}`);
  console.log(`  ${s.philosophers} philosophers (${s.curated} curated, ${s.fromSep} indexed from the Stanford Encyclopedia)`);
  if (!s.sepIndexDate) console.log('  Tip: run "npm run sync" (or use Settings in the app) to import every SEP philosopher.');
  const o = await ollamaStatus();
  console.log(o.model ? `  AI tutor: Ollama model ${o.model}` : `  AI tutor offline: ${o.error}`);
});
