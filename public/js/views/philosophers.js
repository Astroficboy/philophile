import { api } from '../api.js';
import { esc, fmtLife, getMeta, avatar, eraChip, topicName } from '../util.js';

const PAGE = 60;

export async function render(root, _params, query) {
  const meta = getMeta();
  const all = await api.philosophers();
  const state = { q: query.q || '', era: query.era || '', tradition: query.tradition || '', topic: query.topic || '', source: query.source || '', sort: query.sort || 'chron', shown: PAGE };

  root.innerHTML = `
    <h1>Philosophers</h1>
    <p class="muted">${all.length.toLocaleString()} thinkers — ${all.filter((p) => p.source === 'curated').length} with curated influence data,
    ${all.filter((p) => p.source === 'sep').length} more indexed from the Stanford Encyclopedia.</p>
    <div class="filters">
      <input type="search" name="q" placeholder="Filter by name or idea…" value="${esc(state.q)}">
      <select name="era"><option value="">All eras</option>${meta.eras.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select>
      <select name="tradition"><option value="">All traditions</option>${meta.traditions.map((t) => `<option>${esc(t)}</option>`).join('')}</select>
      <select name="topic"><option value="">All topics</option>${meta.topics.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
      <select name="source"><option value="">All sources</option><option value="curated">Curated</option><option value="sep">Encyclopedia only</option></select>
      <select name="sort"><option value="chron">Chronological</option><option value="alpha">A–Z</option><option value="influence">Most influential</option></select>
    </div>
    <div class="muted small" id="count"></div>
    <div class="grid" id="list" style="margin-top:.75rem"></div>
    <div style="text-align:center;margin-top:1.25rem"><button class="btn" id="more" hidden>Show more</button></div>`;

  for (const name of ['era', 'tradition', 'topic', 'source', 'sort']) root.querySelector(`[name=${name}]`).value = state[name];

  const list = root.querySelector('#list');
  const more = root.querySelector('#more');

  function filtered() {
    const q = state.q.toLowerCase();
    let rows = all.filter((p) =>
      (!state.era || p.era === state.era) &&
      (!state.tradition || p.tradition === state.tradition) &&
      (!state.topic || p.topics.includes(state.topic)) &&
      (!state.source || p.source === state.source) &&
      (!q || p.name.toLowerCase().includes(q) || (p.summary || '').toLowerCase().includes(q)));
    if (state.sort === 'alpha') rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (state.sort === 'influence') rows = [...rows].sort((a, b) => b.influenceCount - a.influenceCount);
    return rows;
  }

  function draw() {
    const rows = filtered();
    root.querySelector('#count').textContent = `${rows.length.toLocaleString()} shown`;
    list.innerHTML = rows.slice(0, state.shown).map(card).join('') || '<p class="muted">No philosophers match these filters.</p>';
    more.hidden = rows.length <= state.shown;
    const qs = new URLSearchParams(Object.entries(state).filter(([k, v]) => v && k !== 'shown' && !(k === 'sort' && v === 'chron')));
    history.replaceState(null, '', `#/philosophers${qs.toString() ? `?${qs}` : ''}`);
  }

  root.querySelector('.filters').addEventListener('input', (e) => {
    state[e.target.name] = e.target.value;
    state.shown = PAGE;
    draw();
  });
  more.addEventListener('click', () => { state.shown += PAGE; draw(); });
  draw();
}

function card(p) {
  return `<a class="card ph-card" href="#/philosopher/${encodeURIComponent(p.id)}">
    <div class="row" style="flex-wrap:nowrap">${avatar(p)}<div><h3>${esc(p.name)}</h3><div class="dates">${esc(fmtLife(p))}</div></div></div>
    <div class="row" style="gap:.3rem">${p.era ? eraChip(p.era).replace(/<a /, '<span ').replace(/<\/a>/, '</span>') : ''}
      ${p.topics.slice(0, 2).map((t) => `<span class="chip">${esc(topicName(t))}</span>`).join('')}
      ${p.source === 'sep' ? '<span class="badge">SEP</span>' : ''}</div>
    <p>${esc(p.summary || '')}</p></a>`;
}
