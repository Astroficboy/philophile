import { api } from '../api.js';
import { esc, fmtYear, getMeta, showTip, hideTip } from '../util.js';

// Every philosopher on one zoomable timeline, packed into lanes, over coloured era bands.
export async function render(root, _params, query) {
  const meta = getMeta();
  const data = await api.timeline();
  root.innerHTML = `
    <h1>Timeline of philosophy</h1>
    <p class="muted">${data.philosophers.length.toLocaleString()} lives across ${data.eras.length} eras. Scroll to zoom, drag to pan, click a bar to open a profile.</p>
    <div class="tl-controls">
      <select name="era"><option value="">Zoom to era…</option>${data.eras.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select>
      <select name="topic"><option value="">Highlight topic…</option>${meta.topics.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
      <input type="search" name="q" placeholder="Highlight name…">
      <label class="small"><input type="checkbox" name="equal" checked> Equal-width eras</label>
      <label class="small"><input type="checkbox" name="events" checked> World events</label>
      <button class="btn" type="button" data-reset>Reset view</button>
    </div>
    <div class="timeline-wrap" id="tl"></div>
    <div id="era-info" class="card" style="margin-top:1rem" hidden></div>`;

  const state = { era: query.era || '', topic: query.topic || '', q: '', equal: true, events: true };
  root.querySelector('[name=era]').value = state.era;
  root.querySelector('[name=topic]').value = state.topic;

  let topicMembers = new Set();
  async function loadTopic() {
    topicMembers = new Set();
    if (state.topic) {
      const t = await api.topic(state.topic);
      topicMembers = new Set(t.philosophers.map((p) => p.id));
    }
  }

  const chart = buildChart(root.querySelector('#tl'), data, state, () => topicMembers);
  root.querySelector('.tl-controls').addEventListener('input', async (e) => {
    const { name, type, checked, value } = e.target;
    state[name] = type === 'checkbox' ? checked : value;
    if (name === 'topic') await loadTopic();
    if (name === 'equal') chart.rebuild();
    if (name === 'era') { chart.zoomToEra(value); showEra(root, data, value); } else chart.redraw();
  });
  root.querySelector('[data-reset]').addEventListener('click', () => chart.reset());
  await loadTopic();
  chart.redraw();
  if (state.era) { chart.zoomToEra(state.era); showEra(root, data, state.era); }
}

function showEra(root, data, id) {
  const box = root.querySelector('#era-info');
  const e = data.eras.find((x) => x.id === id);
  box.hidden = !e;
  if (!e) return;
  const people = data.philosophers.filter((p) => p.era === id).sort((a, b) => b.influence - a.influence).slice(0, 12);
  box.innerHTML = `<h2 style="color:${e.color}">${esc(e.name)} <span class="muted small">${fmtYear(e.start)}–${e.end > 2025 ? 'today' : fmtYear(e.end)}</span></h2>
    <p>${esc(e.blurb)}</p>
    <div class="row" style="gap:.4rem">${people.map((p) => `<a class="chip" href="#/philosopher/${encodeURIComponent(p.id)}">${esc(p.name)}</a>`).join('')}
    <a href="#/philosophers?era=${id}">All philosophers of this era →</a></div>`;
}

// Greedy interval packing in pixel space, leaving room for each name label, so that
// names do not overlap at the default zoom. Also records each bar's successor in its lane.
const LABEL_PX = 5.6;
function packLanes(items, x) {
  const lanes = [];
  const last = [];
  const sorted = [...items].sort((a, b) => a.start - b.start);
  for (const it of sorted) {
    const left = x(it.start);
    const right = Math.max(x(it.end), left + it.name.length * LABEL_PX + 8);
    let lane = lanes.findIndex((end) => end + 4 < left);
    if (lane < 0) { lane = lanes.length; lanes.push(0); }
    lanes[lane] = right;
    if (last[lane]) last[lane].next = it;
    last[lane] = it;
    it.lane = lane;
    it.next = null;
  }
  return lanes.length;
}

function buildChart(container, data, state, members) {
  const width = Math.max(700, container.clientWidth || 1100);
  const people = data.philosophers.filter((p) => p.start != null && p.end != null).map((p) => ({ ...p }));
  const laneH = 15;
  const top = 46;
  const minYear = Math.min(...people.map((p) => p.start), data.eras[0].start) - 20;
  const maxYear = new Date().getFullYear() + 10;
  let height;

  const svg = d3.select(container).append('svg');
  const bandG = svg.append('g');
  const eventG = svg.append('g');
  const barG = svg.append('g');
  const axisG = svg.append('g').attr('class', 'axis');

  let x0;
  let x;
  let zoom;
  const makeScale = () => {
    if (state.equal) {
      const bounds = [minYear, ...data.eras.slice(1).map((e) => e.start), maxYear];
      const step = (width - 20) / (bounds.length - 1);
      x0 = d3.scaleLinear().domain(bounds).range(bounds.map((_, i) => 10 + i * step));
    } else {
      x0 = d3.scaleLinear().domain([minYear, maxYear]).range([10, width - 10]);
    }
    x = x0.copy();
    height = top + packLanes(people, x0) * laneH + 34;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    axisG.attr('transform', `translate(0,${height - 30})`);
    zoom?.translateExtent([[0, 0], [width, height]]).extent([[0, 0], [width, height]]);
  };

  const eraColor = new Map(data.eras.map((e) => [e.id, e.color]));
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--border');
  const eventColor = getComputedStyle(document.documentElement).getPropertyValue('--event');

  function redraw() {
    const q = state.q.toLowerCase();
    const topicSet = members();
    const active = (d) => (!state.topic || topicSet.has(d.id)) && (!q || d.name.toLowerCase().includes(q));

    bandG.selectAll('rect').data(data.eras).join('rect')
      .attr('x', (d) => x(d.start)).attr('width', (d) => Math.max(0, x(Math.min(d.end, maxYear)) - x(d.start)))
      .attr('y', 0).attr('height', height - 30).attr('fill', (d) => d.color).attr('opacity', 0.08);
    bandG.selectAll('text').data(data.eras).join('text').attr('class', 'lane-label')
      .attr('x', (d) => x(d.start) + 4).attr('y', 14).attr('font-weight', 600).attr('fill', (d) => d.color)
      .text((d) => (x(Math.min(d.end, maxYear)) - x(d.start) > d.name.length * 6.5 ? d.name : ''));

    const ev = eventG.selectAll('g').data(state.events ? data.events : []).join((enter) => {
      const g = enter.append('g')
        .on('mousemove', (e, d) => showTip(`<strong>${esc(d.title)}</strong><br>${fmtYear(d.year)} · ${esc(d.region)}`, e))
        .on('mouseleave', hideTip);
      g.append('rect').attr('width', 3).attr('height', 12).attr('y', 22).attr('rx', 1);
      return g;
    });
    ev.select('rect').attr('x', (d) => x(d.year) - 1.5).attr('fill', eventColor);

    const bars = barG.selectAll('g').data(people, (d) => d.id).join((enter) => {
      const g = enter.append('g').style('cursor', 'pointer')
        .on('click', (_e, d) => { location.hash = `#/philosopher/${encodeURIComponent(d.id)}`; })
        .on('mousemove', (e, d) => showTip(`<strong>${esc(d.name)}</strong><br>${fmtYear(d.start)}–${d.end >= new Date().getFullYear() ? 'present' : fmtYear(d.end)}${d.tradition ? ` · ${esc(d.tradition)}` : ''}${d.influence ? `<br>Influenced ${d.influence} philosophers` : ''}`, e))
        .on('mouseleave', hideTip);
      g.append('rect').attr('height', laneH - 3).attr('rx', 2);
      g.append('text').attr('class', 'lane-label').attr('font-size', 10);
      return g;
    });
    bars.attr('transform', (d) => `translate(0,${top + d.lane * laneH})`);
    bars.select('rect').attr('x', (d) => x(d.start)).attr('width', (d) => Math.max(2, x(d.end) - x(d.start)))
      .attr('fill', (d) => (active(d) ? eraColor.get(d.era) || '#888' : muted))
      .attr('opacity', (d) => (active(d) ? (d.source === 'curated' ? 0.95 : 0.6) : 0.35));
    bars.select('text').attr('x', (d) => x(d.start) + 3).attr('y', laneH - 6)
      .attr('fill', (d) => (active(d) ? null : muted))
      .text((d) => {
        const room = d.next ? x(d.next.start) - x(d.start) - 4 : Infinity;
        return room > d.name.length * LABEL_PX ? d.name : '';
      });

    axisG.call(d3.axisBottom(x).ticks(Math.round(width / 100)).tickFormat((d) => fmtYear(Math.round(d))));
  }

  makeScale();
  zoom = d3.zoom().scaleExtent([1, 60]).translateExtent([[0, 0], [width, height]]).extent([[0, 0], [width, height]])
    .on('zoom', (e) => { x = e.transform.rescaleX(x0); redraw(); });
  svg.call(zoom);

  return {
    redraw,
    rebuild() { makeScale(); barG.selectAll('*').remove(); svg.call(zoom.transform, d3.zoomIdentity); redraw(); },
    reset() { svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity); },
    zoomToEra(id) {
      const e = data.eras.find((d) => d.id === id);
      if (!e) return this.reset();
      const x1 = x0(e.start);
      const x2 = x0(Math.min(e.end, maxYear));
      const k = Math.min(60, (width - 20) / Math.max(1, x2 - x1));
      svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(10 - x1 * k, 0).scale(k));
    },
  };
}
