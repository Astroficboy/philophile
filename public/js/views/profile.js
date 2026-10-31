import { api, clearCache } from '../api.js';
import { esc, fmtLife, fmtYear, avatar, eraChip, progress, errorBox, loading, showTip, hideTip } from '../util.js';
import { renderEraMap } from '../components/heatmap.js';
import { renderLifeline } from '../components/lifeline.js';
import { renderSepEntry } from '../components/sep-reader.js';
import { mountChat } from '../components/chat.js';
import { mountQuiz } from '../components/quiz.js';
import { aiStatus, streamInto } from '../components/ai.js';

const TABS = [
  ['overview', 'Profile'],
  ['era-map', 'Era map'],
  ['timeline', 'Timeline'],
  ['encyclopedia', 'Encyclopedia'],
  ['graph', 'Influence graph'],
  ['ask', 'Ask the tutor'],
  ['quiz', 'Quiz'],
];

export async function render(root, { id, tab = 'overview' }, query) {
  const p = await api.philosopher(id);
  progress.visit(p.id, p.name);
  document.title = `${p.name} – Philophile`;
  const link = (t) => `#/philosopher/${encodeURIComponent(p.id)}${t === 'overview' ? '' : `/${t}`}`;

  root.innerHTML = `
    <div id="connection"></div>
    <header class="profile-head">
      ${avatar(p, 'lg')}
      <div>
        <h1>${esc(p.name)}</h1>
        <div class="row small" style="gap:.4rem;margin-top:.35rem">
          <span class="muted">${esc(fmtLife(p))}</span>
          ${p.era ? eraChip(p.era) : ''}
          ${p.tradition ? `<span class="chip">${esc(p.tradition)}</span>` : ''}
          ${p.region ? `<span class="chip">${esc(p.region)}</span>` : ''}
          <span class="badge">${p.source === 'curated' ? 'Curated' : 'From SEP'}${p.enriched ? ' + AI' : ''}</span>
        </div>
      </div>
    </header>
    <nav class="tabs" aria-label="Profile sections">
      ${TABS.map(([t, label]) => `<a href="${link(t)}" class="${t === tab ? 'active' : ''}">${label}</a>`).join('')}
    </nav>
    <div id="tab"></div>`;

  if (query.from && query.from !== p.id) renderConnection(root.querySelector('#connection'), query.from, p);

  const el = root.querySelector('#tab');
  const views = { overview, 'era-map': eraMapTab, timeline: timelineTab, encyclopedia, graph, ask, quiz };
  await (views[tab] || overview)(el, p, query);
}

// Arrived here by clicking a tile on another philosopher's era map.
async function renderConnection(el, fromId, p) {
  const from = await api.philosopher(fromId).catch(() => null);
  if (!from) return;
  const asInfluence = from.influences.find((i) => i.id === p.id);
  const asFollower = from.influenced.find((i) => i.id === p.id);
  const relation = asInfluence ? `${p.name} was ${['', 'a minor', 'a significant', 'a major'][asInfluence.weight] || 'an'} influence on ${from.name}.`
    : asFollower ? `${p.name} was influenced by ${from.name}.`
      : `${p.name} was active in ${from.name}’s era but is not recorded as a direct influence.`;
  el.innerHTML = `<div class="card connection-banner" style="margin-bottom:1.25rem">
    <div class="row" style="justify-content:space-between">
      <div><span class="badge">From ${esc(from.name)}’s era map</span>
        <p style="margin:.4rem 0 0"><strong>${esc(relation)}</strong></p></div>
      <div class="row"><a class="btn" href="#/philosopher/${encodeURIComponent(from.id)}/era-map">← Back to ${esc(from.name)}</a>
        <button class="btn primary" type="button" data-explain>Explain the connection</button></div>
    </div>
    <div class="explain-out" style="margin-top:.75rem"></div></div>`;
  el.querySelector('[data-explain]').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const status = await aiStatus();
    const out = el.querySelector('.explain-out');
    if (!status.model) { out.innerHTML = `<p class="muted small">${esc(status.error)}</p>`; return; }
    await streamInto(out, (onToken) => api.connection({ philosopherId: from.id, targetType: 'philosopher', targetId: p.id }, onToken));
    e.target.disabled = false;
  });
}

function personList(list, p, empty) {
  if (!list.length) return `<p class="muted small">${empty}</p>`;
  return `<ul class="people-list">${list.map((q) => `<li>
    <a href="#/philosopher/${encodeURIComponent(q.id)}?from=${encodeURIComponent(p.id)}">${esc(q.name)}</a>
    <span class="muted small">${esc(fmtLife(q))} <span class="weight" title="Strength ${q.weight} of 3">${'●'.repeat(q.weight)}${'○'.repeat(3 - q.weight)}</span></span>
  </li>`).join('')}</ul>`;
}

async function overview(el, p) {
  const sourceNote = p.influences.some((i) => i.source === 'sep-mentions')
    ? '<p class="muted small">Influences inferred from how often this entry discusses earlier philosophers.</p>' : '';
  el.innerHTML = `
    <div class="two-col">
      <div class="stack">
        <section class="card">
          <h2>Who ${p.died == null ? 'is' : 'was'} ${esc(p.name)}?</h2>
          <p style="font-family:var(--serif);font-size:1.1rem">${esc(p.summary || p.sepSummary || 'No summary yet.')}</p>
          ${p.sepSummary && p.summary !== p.sepSummary ? `<p class="muted small"><strong>From the encyclopedia:</strong> ${esc(p.sepSummary)}</p>` : ''}
          ${p.sep ? `<a href="#/philosopher/${encodeURIComponent(p.id)}/encyclopedia">Read the full Stanford Encyclopedia entry →</a>` : ''}
        </section>
        ${p.ideas.length ? `<section class="card"><h2>Key ideas</h2><ul class="ideas">${p.ideas.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></section>` : ''}
        ${p.works.length ? `<section class="card"><h2>Major works</h2><ul class="works">${p.works.map((w) => `<li><span>${fmtYear(w.year)}</span><span>${esc(w.title)}</span></li>`).join('')}</ul></section>` : ''}
        ${p.topics.length ? `<section class="card"><h2>Topics</h2><div class="row" style="gap:.4rem">${p.topics.map((t) => `<a class="chip" href="#/topic/${t.id}?with=${encodeURIComponent(p.id)}">${esc(t.name)}</a>`).join('')}</div></section>` : ''}
        ${p.source !== 'curated' ? `<section class="card" id="enrich-box"><h3>Fill in this profile with AI</h3>
          <p class="muted small">This philosopher comes from the encyclopedia index. Your local model can read the entry and extract key ideas, works, topics and influences.</p>
          <button class="btn primary" type="button" data-enrich>${p.enriched ? 'Re-run AI extraction' : 'Extract with local AI'}</button><div class="enrich-out small" style="margin-top:.5rem"></div></section>` : ''}
      </div>
      <aside class="stack">
        <section class="card"><h3>Influenced by</h3>${sourceNote}${personList(p.influences, p, 'No recorded influences.')}</section>
        <section class="card"><h3>Influenced</h3>${personList(p.influenced.slice(0, 25), p, 'No recorded followers in this collection.')}</section>
        ${p.eraInfo ? `<section class="card"><h3>${esc(p.eraInfo.name)}</h3><p class="small">${esc(p.eraInfo.blurb)}</p>
          <a href="#/philosopher/${encodeURIComponent(p.id)}/era-map">See the era map →</a></section>` : ''}
      </aside>
    </div>`;

  el.querySelector('[data-enrich]')?.addEventListener('click', async (e) => {
    const out = el.querySelector('.enrich-out');
    e.target.disabled = true;
    out.innerHTML = loading('Reading the encyclopedia entry with your local model…');
    try {
      await api.enrich(p.id);
      clearCache('/api/');
      location.reload();
    } catch (err) {
      out.innerHTML = errorBox(err);
      e.target.disabled = false;
    }
  });
}

async function eraMapTab(el, p) {
  el.innerHTML = loading();
  const data = await api.eraMap(p.id);
  el.innerHTML = `<h2>${esc(p.name)} in their era</h2><div class="card"></div>`;
  renderEraMap(el.querySelector('.card'), data, {
    onSelect: ({ type, id }) => {
      location.hash = type === 'topic'
        ? `#/topic/${encodeURIComponent(id)}?with=${encodeURIComponent(p.id)}`
        : `#/philosopher/${encodeURIComponent(id)}?from=${encodeURIComponent(p.id)}`;
    },
  });
}

async function timelineTab(el, p) {
  el.innerHTML = loading();
  const data = await api.personalTimeline(p.id);
  el.innerHTML = `<h2>The life and times of ${esc(p.name)}</h2><div></div>`;
  const box = el.querySelector('div');
  renderLifeline(box, data, { onSelect: (d) => { location.hash = `#/philosopher/${encodeURIComponent(d.id)}?from=${encodeURIComponent(p.id)}`; } });
  const redraw = () => renderLifeline(box, data, { onSelect: (d) => { location.hash = `#/philosopher/${encodeURIComponent(d.id)}?from=${encodeURIComponent(p.id)}`; } });
  window.addEventListener('themechange', redraw, { once: true });
}

async function encyclopedia(el, p, query) {
  if (!p.sep) {
    el.innerHTML = `<p class="muted">No Stanford Encyclopedia entry is linked yet. Run the encyclopedia sync in <a href="#/settings">Settings</a> to match entries automatically.</p>`;
    return;
  }
  el.innerHTML = '<div></div>';
  await renderSepEntry(el.firstChild, p.sep, {
    section: query.section,
    onAskSection: (title) => { location.hash = `#/philosopher/${encodeURIComponent(p.id)}/ask?q=${encodeURIComponent(`Explain the section “${title}” in simple terms.`)}`; },
  });
}

async function graph(el, p) {
  el.innerHTML = loading();
  const data = await api.graph(p.id);
  el.innerHTML = `<h2>Lines of influence</h2>
    <p class="muted small">Left: who shaped ${esc(p.name)} (two generations back). Right: who they shaped. Click a name to open their profile.</p>
    <div class="card graph"><svg></svg></div>`;
  const svg = d3.select(el.querySelector('svg'));
  const width = el.querySelector('.graph').clientWidth - 40 || 900;
  const height = 460;
  svg.attr('viewBox', `0 0 ${width} ${height}`);
  const levels = d3.extent(data.nodes, (d) => d.level);
  const x = d3.scaleLinear().domain(levels[0] === levels[1] ? [-1, 1] : levels).range([90, width - 90]);
  const sim = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links).id((d) => d.id).distance(80).strength(0.3))
    .force('charge', d3.forceManyBody().strength(-160))
    .force('x', d3.forceX((d) => x(d.level)).strength(0.9))
    .force('y', d3.forceY(height / 2).strength(0.08))
    .force('collide', d3.forceCollide(26));
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent');
  const heat = getComputedStyle(document.documentElement).getPropertyValue('--heat-2');
  const violet = getComputedStyle(document.documentElement).getPropertyValue('--influenced');
  const link = svg.append('g').selectAll('line').data(data.links).join('line').attr('class', 'link').attr('stroke-width', (d) => d.weight);
  const node = svg.append('g').selectAll('g').data(data.nodes).join('g').attr('class', 'node').style('cursor', 'pointer')
    .on('click', (_e, d) => { location.hash = `#/philosopher/${encodeURIComponent(d.id)}?from=${encodeURIComponent(p.id)}`; })
    .on('mousemove', (e, d) => showTip(`<strong>${esc(d.name)}</strong>${d.born != null ? ` b. ${fmtYear(d.born)}` : ''}`, e))
    .on('mouseleave', hideTip);
  node.append('circle').attr('r', (d) => (d.level === 0 ? 12 : 7)).attr('fill', (d) => (d.level === 0 ? accent : d.level < 0 ? heat : violet));
  node.append('text').attr('x', 10).attr('y', 4).text((d) => d.name);
  sim.on('tick', () => {
    for (const d of data.nodes) { d.x = Math.max(20, Math.min(width - 20, d.x)); d.y = Math.max(15, Math.min(height - 15, d.y)); }
    link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });
}

async function ask(el, p, query) {
  el.innerHTML = '<div class="card"></div>';
  await mountChat(el.firstChild, {
    philosopherId: p.id,
    subject: p.name,
    initialQuestion: query.q,
    suggestions: [
      `What is ${p.name}'s most important idea?`,
      `Explain ${p.name} to a beginner`,
      p.influences[0] ? `How did ${p.influences[0].name} influence ${p.name}?` : `What problems was ${p.name} responding to?`,
      `What are the main criticisms of ${p.name}?`,
      `How is ${p.name} relevant today?`,
    ],
  });
}

async function quiz(el, p) {
  el.innerHTML = `<h2>Test yourself on ${esc(p.name)}</h2><div class="card"></div>`;
  mountQuiz(el.querySelector('.card'), { philosopherId: p.id, title: p.name });
}
