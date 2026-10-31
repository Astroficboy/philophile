// Era map: everything happening around a philosopher's life, coloured by how much it
// shaped their thought. Red ramp = influence on them; blue = same era, no direct
// influence; violet = later thinkers they influenced; amber = world events.
import { esc, fmtYear, showTip, hideTip } from '../util.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function heatColor(heat) {
  const stops = [css('--heat-0'), css('--heat-1'), css('--heat-2'), css('--heat-3')];
  const scale = d3.scaleLinear().domain([0, 0.33, 0.66, 1]).range(stops).interpolate(d3.interpolateRgb).clamp(true);
  return scale(heat);
}

function tileStyle(item) {
  if (item.relation === 'influence' || item.relation === 'indirect') {
    const bg = heatColor(item.heat);
    return { cls: item.heat >= 0.5 ? 'tile hot' : 'tile', style: `background:${bg};border-color:${bg}` };
  }
  return { cls: `tile ${item.relation}`, style: '' };
}

function spanLabel(item) {
  if (item.type === 'event') return fmtYear(item.year);
  const end = item.end >= new Date().getFullYear() ? 'now' : fmtYear(item.end);
  if (item.start < 0 && item.end < 0) return `${-item.start}–${-item.end} BCE`;
  return `${fmtYear(item.start)}–${end}`;
}

export function renderEraMap(container, data, { onSelect } = {}) {
  const p = data.philosopher;
  const groups = [
    { key: 'philosopher', title: 'Philosophers', note: 'direct influences from any century, plus everyone active around their lifetime' },
    { key: 'topic', title: 'Topics & movements', note: 'schools, problems and branches alive in this era' },
    { key: 'event', title: 'What was happening in the world', note: 'politics, science, religion and culture' },
  ];
  const ramp = [0.15, 0.4, 0.65, 0.9].map((h) => `<i style="background:${heatColor(h)}"></i>`).join('');
  const counts = {
    influence: data.items.filter((i) => i.relation === 'influence' && i.type === 'philosopher').length,
    contemporary: data.items.filter((i) => i.relation === 'contemporary').length,
  };

  container.innerHTML = `
    <div class="legend" role="list">
      <span role="listitem"><span class="ramp">${ramp}</span>Influenced ${esc(p.name)} (weak → strong)</span>
      <span role="listitem"><span class="sw" style="background:var(--contemporary)"></span>Same era, not a direct influence</span>
      <span role="listitem"><span class="sw" style="background:var(--influenced)"></span>Influenced by ${esc(p.name)}</span>
      <span role="listitem"><span class="sw" style="background:var(--event)"></span>World event</span>
    </div>
    <p class="muted small">Window ${fmtYear(data.window.start)} – ${fmtYear(data.window.end)} · ${counts.influence} influences · ${counts.contemporary} contemporaries and currents that did not directly shape them.
      Click a philosopher or topic to see it in relation to ${esc(p.name)}.</p>
    <div class="row" style="margin-bottom:.5rem">
      <label class="small"><input type="radio" name="mode" value="grid" checked> Heat map</label>
      <label class="small"><input type="radio" name="mode" value="time"> Time map</label>
    </div>
    <div class="era-map-body"></div>`;

  const body = container.querySelector('.era-map-body');
  const draw = (mode) => (mode === 'time' ? drawTimeMap(body, data, onSelect) : drawGrid(body, data, groups));
  container.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => draw(r.value)));
  draw('grid');

  body.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-type]');
    if (!tile || tile.dataset.type === 'event') return;
    onSelect?.({ type: tile.dataset.type, id: tile.dataset.id });
  });
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const tile = e.target.closest('[data-type]');
    if (tile && tile.dataset.type !== 'event') { e.preventDefault(); onSelect?.({ type: tile.dataset.type, id: tile.dataset.id }); }
  });
}

function drawGrid(body, data, groups) {
  body.innerHTML = groups.map((g) => {
    const items = data.items.filter((i) => i.type === g.key);
    if (!items.length) return '';
    return `<section class="heatmap-section">
      <h3>${g.title} <span class="muted small">${items.length} · ${g.note}</span></h3>
      <div class="heatmap-grid">${items.map((item) => {
        const { cls, style } = tileStyle(item);
        const clickable = item.type !== 'event';
        return `<div class="${cls}" style="${style}" data-type="${item.type}" data-id="${esc(item.id)}" ${clickable ? 'role="link" tabindex="0"' : ''}
          title="${esc(item.reason)}">
          <strong>${esc(item.name)}</strong>
          <small>${esc(spanLabel(item))}${item.relation === 'influence' || item.relation === 'indirect' ? ` · ${Math.round(item.heat * 100)}%` : ''}</small>
        </div>`;
      }).join('')}</div></section>`;
  }).join('');
}

// Horizontal bars across the era window, sorted by heat, with events as ticks on top.
function drawTimeMap(body, data, onSelect) {
  const items = data.items.filter((i) => i.type !== 'event');
  const events = data.items.filter((i) => i.type === 'event');
  const width = Math.max(640, body.clientWidth || 900);
  const rowH = 18;
  const margin = { top: 46, right: 16, bottom: 28, left: 16 };
  const height = margin.top + items.length * rowH + margin.bottom;
  const x = d3.scaleLinear().domain([data.window.start, data.window.end]).range([margin.left, width - margin.right]);

  body.innerHTML = '<div class="timeline-wrap"></div>';
  const svg = d3.select(body.firstChild).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('height', height).style('cursor', 'default');

  svg.append('rect').attr('x', x(data.window.born)).attr('width', Math.max(2, x(data.window.died) - x(data.window.born)))
    .attr('y', margin.top - 6).attr('height', height - margin.top - margin.bottom + 6).attr('fill', css('--accent')).attr('opacity', 0.08);
  svg.append('text').attr('x', x(data.window.born) + 4).attr('y', margin.top - 10).attr('class', 'lane-label').attr('font-weight', 600)
    .text(`${data.philosopher.name}’s lifetime`);

  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(8).tickFormat((d) => fmtYear(d)));

  svg.append('g').selectAll('line').data(events).join('line')
    .attr('x1', (d) => x(d.year)).attr('x2', (d) => x(d.year)).attr('y1', 6).attr('y2', 22)
    .attr('stroke', css('--event')).attr('stroke-width', 3)
    .on('mousemove', (e, d) => showTip(`<strong>${esc(d.name)}</strong><br>${esc(d.reason)}`, e)).on('mouseleave', hideTip);

  const colorFor = (d) => (d.relation === 'influence' || d.relation === 'indirect' ? heatColor(d.heat)
    : d.relation === 'influenced' ? css('--influenced') : css('--contemporary'));
  const rows = svg.append('g').selectAll('g').data(items).join('g')
    .attr('transform', (d, i) => `translate(0,${margin.top + i * rowH})`)
    .style('cursor', 'pointer')
    .on('click', (_e, d) => onSelect?.({ type: d.type, id: d.id }))
    .on('mousemove', (e, d) => showTip(`<strong>${esc(d.name)}</strong> (${esc(spanLabel(d))})<br>${esc(d.reason)}`, e))
    .on('mouseleave', hideTip);
  rows.append('rect')
    .attr('x', (d) => x(Math.max(d.start, data.window.start)))
    .attr('width', (d) => Math.max(4, x(Math.min(d.end, data.window.end)) - x(Math.max(d.start, data.window.start))))
    .attr('y', 2).attr('height', rowH - 4).attr('rx', 3)
    .attr('fill', colorFor).attr('opacity', (d) => (d.type === 'topic' ? 0.75 : 1));
  rows.append('text').attr('class', 'lane-label')
    .attr('x', (d) => x(Math.max(d.start, data.window.start)) + 4).attr('y', rowH / 2 + 4)
    .attr('fill', (d) => (d.heat >= 0.5 ? '#fff' : null))
    .text((d) => `${d.type === 'topic' ? '◆ ' : ''}${d.name}`);
}
