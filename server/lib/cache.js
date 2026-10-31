import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

// Tiny file cache: one file per key under data/cache/<bucket>/.
function fileFor(bucket, key) {
  const safe = String(key).replace(/[^a-z0-9._-]/gi, '_');
  return path.join(config.cacheDir, bucket, safe);
}

export async function readCache(bucket, key, maxAgeMs = Infinity) {
  const file = fileFor(bucket, key);
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > maxAgeMs) return null;
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

export async function writeCache(bucket, key, value) {
  const file = fileFor(bucket, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, value, 'utf8');
}

export async function readJsonCache(bucket, key, maxAgeMs) {
  const raw = await readCache(bucket, `${key}.json`, maxAgeMs);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJsonCache(bucket, key, value) {
  return writeCache(bucket, `${key}.json`, JSON.stringify(value, null, 2));
}
