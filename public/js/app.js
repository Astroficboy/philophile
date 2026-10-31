import { api } from './api.js';
import { esc, fmtLife, setMeta, errorBox, loading, hideTip } from './util.js';

// Routes: pattern -> lazily loaded view module exporting render(root, params, query).
const routes = [
  [/^\/?$/, 'home'],
  [/^\/philosophers\/?$/, 'philosophers'],
  [/^\/philosopher\/([^/]+)(?:\/([a-z-]+))?\/?$/, 'profile', ['id', 'tab']],
  [/^\/timeline\/?$/, 'timeline'],
  [/^\/topics\/?$/, 'topics'],
  [/^\/topic\/([^/]+)\/?$/, 'topic', ['id']],
  [/^\/sep\/([^/]+)\/?$/, 'sep', ['slug']],
  [/^\/learn\/?$/, 'learn'],
  [/^\/settings\/?$/, 'settings'],
];

const root = document.getElementById('app');
let renderToken = 0;

async function route() {
  const token = ++renderToken;
  hideTip();
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = hash.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  for (const [re, name, keys = []] of routes) {
    const m = path.match(re);
    if (!m) continue;
    const params = Object.fromEntries(keys.map((k, i) => [k, m[i + 1] ? decodeURIComponent(m[i + 1]) : undefined]));
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', path.startsWith(`/${a.dataset.nav}`) || (a.dataset.nav === 'philosophers' && path.startsWith('/philosopher/')) || (a.dataset.nav === 'topics' && path.startsWith('/topic/'))));
    root.innerHTML = loading();
    try {
      const view = await import(`./views/${name}.js`);
      if (token !== renderToken) return;
      await view.render(root, params, query, () => token !== renderToken);
    } catch (err) {
      if (token === renderToken) root.innerHTML = errorBox(err);
      console.error(err);
    }
    if (!query.section) window.scrollTo(0, 0);
    return;
  }
  root.innerHTML = `<div class="card"><h2>Not found</h2><p>No page at <code>${esc(path)}</code>.</p><a href="#/">Go home</a></div>`;
}

// Global search ---------------------------------------------------------------
function setupSearch() {
  const form = document.getElementById('global-search');
  const input = form.querySelector('input');
  const list = form.querySelector('.search-results');
  let sel = -1;
  let timer;
  const close = () => { list.hidden = true; sel = -1; };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return close();
    timer = setTimeout(async () => {
      const results = (await api.philosophers({ q })).slice(0, 12);
      list.innerHTML = results.length
        ? results.map((p) => `<li><a href="#/philosopher/${encodeURIComponent(p.id)}">${esc(p.name)} <small>${esc(fmtLife(p))}</small></a></li>`).join('')
        : '<li class="muted small" style="padding:.5rem">No philosophers found</li>';
      list.hidden = false;
      sel = -1;
    }, 150);
  });
  input.addEventListener('keydown', (e) => {
    const links = [...list.querySelectorAll('a')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links.forEach((a, i) => a.classList.toggle('sel', i === sel));
    } else if (e.key === 'Escape') close();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const links = [...list.querySelectorAll('a')];
    const target = links[Math.max(0, sel)];
    if (target) location.hash = target.getAttribute('href');
    else location.hash = `#/philosophers?q=${encodeURIComponent(input.value.trim())}`;
    input.value = '';
    close();
  });
  list.addEventListener('click', () => { input.value = ''; close(); });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) close(); });
}

function setupTheme() {
  const saved = (() => { try { return localStorage.getItem('philophile.theme'); } catch { return null; } })();
  if (saved) document.documentElement.dataset.theme = saved;
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('philophile.theme', next); } catch { /* ignore */ }
    window.dispatchEvent(new Event('themechange'));
  });
}

async function start() {
  setupTheme();
  setupSearch();
  try {
    setMeta(await api.meta());
  } catch (err) {
    root.innerHTML = errorBox(`Could not reach the Philophile server: ${err.message}`);
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

start();
