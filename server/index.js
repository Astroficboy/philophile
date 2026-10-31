import express from 'express';
import path from 'node:path';
import { config } from './config.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use(express.static(path.join(config.root, 'public')));
app.use('/vendor/d3', express.static(path.join(config.root, 'node_modules', 'd3', 'dist')));
app.get('*', (_req, res) => res.sendFile(path.join(config.root, 'public', 'index.html')));

app.listen(config.port, () => {
  console.log(`Philophile running at http://localhost:${config.port}`);
});
