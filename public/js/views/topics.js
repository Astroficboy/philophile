import { api } from '../api.js';
import { esc, fmtYear } from '../util.js';

const KINDS = [['branch', 'Branches'], ['school', 'Schools & traditions'], ['movement', 'Movements'], ['problem', 'Problems']];

export async function render(root) {
  const { topics, sepTopics } = await api.topics();
  root.innerHTML = `
    <h1>Topics</h1>
    <p class="muted">Branches, schools, movements and problems of philosophy, each with its key figures and the Stanford Encyclopedia article.</p>
    ${KINDS.map(([kind, title]) => {
      const list = topics.filter((t) => t.kind === kind).sort((a, b) => a.start - b.start);
      return `<div class="section-title"><h2>${title}</h2></div>
        <div class="grid">${list.map((t) => `<a class="card ph-card" href="#/topic/${t.id}">
          <h3>${esc(t.name)}</h3>
          <div class="dates">${fmtYear(t.start)} – ${t.end > 2025 ? 'today' : fmtYear(t.end)} · ${t.philosopherCount} philosophers</div>
          <p>${esc(t.summary)}</p></a>`).join('')}</div>`;
    }).join('')}
    ${sepTopics.length ? `
      <div class="section-title"><h2>All encyclopedia articles</h2><span class="muted small">${sepTopics.length.toLocaleString()} topic entries</span></div>
      <input type="search" id="sep-filter" placeholder="Filter articles…" style="width:100%;max-width:420px;margin-bottom:.75rem">
      <div class="row" id="sep-list" style="gap:.35rem"></div>` : `
      <p class="notice small" style="margin-top:2rem">Sync the Stanford Encyclopedia in <a href="#/settings">Settings</a> to browse all of its ~1,800 articles here.</p>`}`;

  const list = root.querySelector('#sep-list');
  if (!list) return;
  const draw = (q = '') => {
    const rows = sepTopics.filter((t) => t.label.toLowerCase().includes(q.toLowerCase())).slice(0, 300);
    list.innerHTML = rows.map((t) => `<a class="chip" href="#/sep/${esc(t.slug)}">${esc(t.label)}</a>`).join('');
  };
  root.querySelector('#sep-filter').addEventListener('input', (e) => draw(e.target.value));
  draw();
}
