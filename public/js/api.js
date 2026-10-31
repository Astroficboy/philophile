const cache = new Map();

export async function getJSON(url, { fresh = false } = {}) {
  if (!fresh && cache.has(url)) return cache.get(url);
  const p = fetch(url).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  });
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  return p;
}

export function clearCache(prefix = '') {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}

export async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// POST and read a streamed plain-text response, calling onToken as text arrives.
export async function postStream(url, body, onToken, { signal } = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    full += text;
    onToken?.(text, full);
  }
  return full;
}

export const api = {
  meta: () => getJSON('/api/meta'),
  philosophers: (params = {}) => getJSON(`/api/philosophers?${new URLSearchParams(params)}`),
  philosopher: (id) => getJSON(`/api/philosophers/${encodeURIComponent(id)}`),
  eraMap: (id) => getJSON(`/api/philosophers/${encodeURIComponent(id)}/era-map`),
  personalTimeline: (id) => getJSON(`/api/philosophers/${encodeURIComponent(id)}/timeline`),
  graph: (id) => getJSON(`/api/philosophers/${encodeURIComponent(id)}/graph`),
  topics: () => getJSON('/api/topics'),
  topic: (id, withId) => getJSON(`/api/topics/${encodeURIComponent(id)}${withId ? `?with=${encodeURIComponent(withId)}` : ''}`),
  timeline: () => getJSON('/api/timeline'),
  sepEntry: (slug) => getJSON(`/api/sep/entry/${slug}`),
  aiStatus: (refresh) => getJSON(`/api/ai/status${refresh ? '?refresh=1' : ''}`, { fresh: true }),
  syncStatus: () => getJSON('/api/sep/sync', { fresh: true }),
  startSync: (body) => postJSON('/api/sep/sync', body),
  quiz: (body) => postJSON('/api/ai/quiz', body),
  enrich: (id) => postJSON(`/api/ai/enrich/${encodeURIComponent(id)}`),
  ask: (body, onToken, opts) => postStream('/api/ai/ask', body, onToken, opts),
  connection: (body, onToken, opts) => postStream('/api/ai/connection', body, onToken, opts),
};
