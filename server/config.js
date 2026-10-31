import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT) || 3000,
  root,
  dataDir: path.join(root, 'data'),
  cacheDir: path.join(root, 'data', 'cache'),
  sepIndexFile: path.join(root, 'data', 'sep-index.json'),
  sep: {
    base: process.env.SEP_BASE || 'https://plato.stanford.edu',
    // Be polite to the encyclopedia: pause between requests during a full sync.
    delayMs: Number(process.env.SEP_DELAY_MS) || 400,
    cacheDays: Number(process.env.SEP_CACHE_DAYS) || 30,
  },
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
    model: process.env.OLLAMA_MODEL || 'gemma4:12b', // falls back to any installed gemma4 tag,
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS) || 180000,
  },
};
