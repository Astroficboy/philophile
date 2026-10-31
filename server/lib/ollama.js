// Minimal client for a local Ollama server (https://ollama.com).
import { config } from '../config.js';

let resolved = { model: null, checkedAt: 0, available: false, models: [], error: null };

// Find the configured model, or the closest installed match (e.g. "gemma4:12b" when
// the configured name is "gemma4:12"), so a slightly different tag still works.
export async function status({ refresh = false } = {}) {
  if (!refresh && Date.now() - resolved.checkedAt < 30000) return resolved;
  try {
    const res = await fetch(`${config.ollama.host}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
    const { models = [] } = await res.json();
    const names = models.map((m) => m.name);
    resolved = {
      available: true,
      models: names,
      model: pickModel(config.ollama.model, names),
      configured: config.ollama.model,
      host: config.ollama.host,
      checkedAt: Date.now(),
      error: null,
    };
    if (!resolved.model) resolved.error = `Model "${config.ollama.model}" is not installed. Run: ollama pull ${config.ollama.model}`;
  } catch (err) {
    resolved = {
      available: false, models: [], model: null, configured: config.ollama.model, host: config.ollama.host,
      checkedAt: Date.now(), error: `Cannot reach Ollama at ${config.ollama.host} (${err.message}). Start it with: ollama serve`,
    };
  }
  return resolved;
}

export function pickModel(wanted, names) {
  if (!names.length) return null;
  if (names.includes(wanted)) return wanted;
  const [family, tag = ''] = wanted.split(':');
  const sameFamily = names.filter((n) => n.split(':')[0] === family);
  const digits = tag.match(/\d+/)?.[0];
  return (
    (digits && sameFamily.find((n) => (n.split(':')[1] || '').startsWith(digits))) ||
    sameFamily.find((n) => n.endsWith(':latest')) ||
    sameFamily[0] ||
    null
  );
}

async function requireModel() {
  const s = await status();
  if (!s.model) {
    const err = new Error(s.error || 'Ollama model unavailable');
    err.status = 503;
    throw err;
  }
  return s.model;
}

// Stream a chat completion, calling onToken for each text fragment. Returns the full text.
export async function chatStream(messages, { onToken, signal, temperature = 0.4 } = {}) {
  const model = await requireModel();
  const res = await fetch(`${config.ollama.host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, options: { temperature } }),
    signal: signal || AbortSignal.timeout(config.ollama.timeoutMs),
  });
  if (!res.ok || !res.body) throw Object.assign(new Error(`Ollama error ${res.status}: ${await res.text()}`), { status: 502 });

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.error) throw Object.assign(new Error(msg.error), { status: 502 });
      const piece = msg.message?.content || '';
      if (piece) {
        full += piece;
        onToken?.(piece);
      }
    }
  }
  return full;
}

// Ask for a JSON answer matching `schema` (Ollama structured outputs).
export async function chatJson(messages, schema, { temperature = 0.2 } = {}) {
  const model = await requireModel();
  const res = await fetch(`${config.ollama.host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, format: schema || 'json', options: { temperature } }),
    signal: AbortSignal.timeout(config.ollama.timeoutMs),
  });
  if (!res.ok) throw Object.assign(new Error(`Ollama error ${res.status}: ${await res.text()}`), { status: 502 });
  const data = await res.json();
  const text = data.message?.content || '';
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw Object.assign(new Error('The model did not return valid JSON'), { status: 502 });
  }
}
