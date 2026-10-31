import { api, clearCache } from '../api.js';
import { esc, setMeta } from '../util.js';
import { aiStatus } from '../components/ai.js';

export async function render(root, _params, _query, isStale) {
  root.innerHTML = `
    <h1>Settings</h1>
    <div class="stack" style="max-width:820px">
      <section class="card" id="ai"></section>
      <section class="card" id="sep"></section>
    </div>`;
  await drawAi(root.querySelector('#ai'));
  await drawSep(root.querySelector('#sep'), isStale);
}

async function drawAi(el, refresh = false) {
  const s = await aiStatus(refresh);
  el.innerHTML = `
    <h2>Local AI tutor (Ollama)</h2>
    ${s.model
      ? `<p>✅ Connected to <code>${esc(s.host)}</code> using <strong>${esc(s.model)}</strong>${s.model !== s.configured ? ` (configured: <code>${esc(s.configured)}</code>, closest installed match used)` : ''}.</p>`
      : `<p class="error">${esc(s.error)}</p>`}
    ${s.models?.length ? `<p class="small muted">Installed models: ${s.models.map((m) => `<code>${esc(m)}</code>`).join(', ')}</p>` : ''}
    <details ${s.model ? '' : 'open'}><summary>Setup</summary>
      <ol class="small">
        <li>Install Ollama from <a href="https://ollama.com" target="_blank" rel="noopener">ollama.com</a>.</li>
        <li>Pull the model: <code>ollama pull ${esc(s.configured || 'gemma4:12b')}</code></li>
        <li>Make sure the server is running: <code>ollama serve</code></li>
        <li>To use a different model or host, start Philophile with <code>OLLAMA_MODEL=…</code> / <code>OLLAMA_HOST=…</code>.</li>
      </ol>
    </details>
    <button class="btn" type="button" data-recheck>Check again</button>`;
  el.querySelector('[data-recheck]').addEventListener('click', () => drawAi(el, true));
}

async function drawSep(el, isStale) {
  const s = await api.syncStatus();
  const st = s.stats;
  el.innerHTML = `
    <h2>Stanford Encyclopedia of Philosophy</h2>
    <p>${st.philosophers.toLocaleString()} philosophers loaded: ${st.curated} curated with hand-checked influences,
      ${st.fromSep.toLocaleString()} matched to or imported from the encyclopedia.
      ${st.sepIndexDate ? `Last sync ${new Date(st.sepIndexDate).toLocaleString()} · ${st.sepTopics.toLocaleString()} topic articles indexed.` : '<strong>Not synced yet.</strong>'}</p>
    <p class="small muted">Syncing reads the encyclopedia’s table of contents, then each person entry (about 600 pages, paced politely; roughly 5–10 minutes).
      Pages are cached locally, so later syncs are fast. Life dates are parsed from each entry, and influences for non-curated philosophers are inferred from who their entry discusses most.
      You can also run <code>npm run sync</code> in a terminal.</p>
    <div class="sync-status small"></div>
    <div class="row">
      <button class="btn primary" type="button" data-sync>${s.running ? 'Syncing…' : st.sepIndexDate ? 'Sync again' : 'Import every SEP philosopher'}</button>
      <button class="btn" type="button" data-force>Full refresh (ignore cache)</button>
    </div>`;

  const statusEl = el.querySelector('.sync-status');
  const show = (x) => {
    const pct = x.total ? Math.round((x.done / x.total) * 100) : 0;
    statusEl.innerHTML = x.phase === 'idle' ? '' : `
      <p>${esc(x.message)} ${x.total ? `(${x.done}/${x.total}, ${x.found} philosophers${x.errors ? `, ${x.errors} errors` : ''})` : ''}</p>
      ${x.running ? `<div class="progress-bar" style="margin-bottom:.75rem"><i style="width:${pct}%"></i></div>` : ''}`;
  };
  show(s);

  const poll = async () => {
    if (isStale()) return;
    const x = await api.syncStatus();
    show(x);
    if (x.running) setTimeout(poll, 1500);
    else {
      clearCache('/api/');
      setMeta(await api.meta());
      if (!isStale()) drawSep(el, isStale);
    }
  };
  if (s.running) setTimeout(poll, 1500);

  const start = async (force) => {
    el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await api.startSync({ force });
      poll();
    } catch (err) {
      statusEl.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  };
  el.querySelector('[data-sync]').addEventListener('click', () => start(false));
  el.querySelector('[data-force]').addEventListener('click', () => start(true));
  if (s.running) el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
}
