// A philosopher's life on a zoomable timeline: milestones and works on top, the lives
// of influences, contemporaries and followers in lanes below, world events along the axis.
import { esc, fmtYear, showTip, hideTip } from '../util.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function renderLifeline(container, data, { onSelect } = {}) {
  const p = data.philosopher;
  const width = Math.max(680, container.clientWidth || 960);
  const laneH = 20;
  const top = 128;
  const margin = { left: 12, right: 12, bottom: 70 };
  const height = top + data.lanes.length * laneH + margin.bottom;
  const pad = Math.max(10, (data.range.end - data.range.start) * 0.04);
  const x0 = d3.scaleLinear().domain([data.range.start - pad, data.range.end + pad]).range([margin.left, width - margin.right]);
  let x = x0.copy();

  container.innerHTML = `
    <div class="legend">
      <span><span class="sw" style="background:var(--accent)"></span>${esc(p.name)}</span>
      <span><span class="sw" style="background:var(--heat-2)"></span>Influenced them</span>
      <span><span class="sw" style="background:var(--contemporary)"></span>Contemporary</span>
      <span><span class="sw" style="background:var(--influenced)"></span>Influenced by them</span>
      <span><span class="sw" style="background:var(--event)"></span>World event</span>
      <span class="muted">Scroll to zoom, drag to pan.</span>
    </div>
    <div class="timeline-wrap"></div>`;
  const svg = d3.select(container.querySelector('.timeline-wrap')).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);

  // Era bands behind everything.
  const eraG = svg.append('g');
  const lifeG = svg.append('g');
  const eventG = svg.append('g');
  const laneG = svg.append('g');
  const axisG = svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - margin.bottom})`);

  const colour = { influence: css('--heat-2'), contemporary: css('--contemporary'), influenced: css('--influenced') };
  const lifeEnd = p.died ?? new Date().getFullYear();

  function draw() {
    eraG.selectAll('rect').data(data.eras.filter((e) => e.end > x.domain()[0] && e.start < x.domain()[1]), (d) => d.id)
      .join('rect')
      .attr('x', (d) => x(d.start)).attr('width', (d) => Math.max(0, x(d.end) - x(d.start)))
      .attr('y', 0).attr('height', height - margin.bottom).attr('fill', (d) => d.color).attr('opacity', 0.07);
    eraG.selectAll('text').data(data.eras.filter((e) => e.end > x.domain()[0] && e.start < x.domain()[1]), (d) => d.id)
      .join('text').attr('class', 'lane-label').attr('opacity', 0.6)
      .attr('x', (d) => Math.max(x(d.start), margin.left) + 4).attr('y', 14)
      .text((d) => (Math.min(x(d.end), width) - Math.max(x(d.start), margin.left) > d.name.length * 6 + 8 ? d.name : ''));

    // Life bar and milestones.
    lifeG.selectAll('*').remove();
    if (p.born != null) {
      lifeG.append('rect').attr('x', x(p.born)).attr('width', Math.max(3, x(lifeEnd) - x(p.born)))
        .attr('y', 52).attr('height', 14).attr('rx', 7).attr('fill', css('--accent'));
      lifeG.append('text').attr('class', 'lane-label').attr('font-weight', 700).attr('font-size', 13)
        .attr('x', x(p.born)).attr('y', 44).text(p.name);
    }
    const ms = lifeG.selectAll('g.ms').data(data.milestones).join('g').attr('class', 'ms')
      .attr('transform', (d) => `translate(${x(d.year)},59)`)
      .on('mousemove', (e, d) => showTip(`<strong>${esc(d.title)}</strong><br>${fmtYear(d.year)}`, e)).on('mouseleave', hideTip);
    ms.append('circle').attr('r', (d) => (d.kind === 'work' ? 5 : 4))
      .attr('fill', (d) => (d.kind === 'work' ? css('--surface') : css('--accent'))).attr('stroke', css('--accent')).attr('stroke-width', 2);
    // Label works on up to three rows below the bar; skip a label when there is no room
    // (it stays available in the tooltip, and appears as you zoom in).
    const rowsEnd = [-Infinity, -Infinity, -Infinity];
    ms.filter((d) => d.kind === 'work').each(function (d) {
      const label = d.title.length > 30 ? `${d.title.slice(0, 28)}…` : d.title;
      const w = label.length * 5.4;
      const cx = x(d.year);
      const row = rowsEnd.findIndex((end) => end + 6 < cx - w / 2);
      if (row < 0) return;
      rowsEnd[row] = cx + w / 2;
      d3.select(this).append('text').attr('class', 'lane-label').attr('text-anchor', 'middle').attr('font-size', 10)
        .attr('y', 24 + row * 13).text(label);
    });

    // Lanes.
    const lanes = laneG.selectAll('g.lane').data(data.lanes, (d) => d.id).join((enter) => {
      const g = enter.append('g').attr('class', 'lane').style('cursor', 'pointer')
        .on('click', (_e, d) => onSelect?.(d))
        .on('mousemove', (e, d) => showTip(`<strong>${esc(d.name)}</strong> (${fmtYear(d.start)}–${fmtYear(d.end)})<br>${
          d.relation === 'influence' ? `Influenced ${esc(p.name)}` : d.relation === 'influenced' ? `Influenced by ${esc(p.name)}` : 'Contemporary'}`, e))
        .on('mouseleave', hideTip);
      g.append('rect').attr('rx', 3).attr('height', laneH - 6).attr('y', 3);
      g.append('text').attr('class', 'lane-label').attr('y', laneH / 2 + 4);
      return g;
    });
    lanes.attr('transform', (_d, i) => `translate(0,${top + i * laneH})`);
    lanes.select('rect').attr('x', (d) => x(d.start)).attr('width', (d) => Math.max(3, x(d.end) - x(d.start)))
      .attr('fill', (d) => colour[d.relation]).attr('opacity', (d) => (d.relation === 'influence' ? 0.55 + d.weight * 0.15 : 0.75));
    lanes.select('text').attr('x', (d) => Math.max(x(d.start), margin.left) + 4).text((d) => d.name);

    // Events.
    const ev = eventG.selectAll('g').data(data.events, (d) => d.year + d.title).join((enter) => {
      const g = enter.append('g')
        .on('mousemove', (e, d) => showTip(`<strong>${esc(d.title)}</strong><br>${fmtYear(d.year)} · ${esc(d.region)}`, e))
        .on('mouseleave', hideTip);
      g.append('line').attr('stroke', css('--event')).attr('stroke-width', 2).attr('stroke-dasharray', '3 3');
      g.append('circle').attr('r', 5).attr('fill', css('--event'));
      return g;
    });
    ev.select('line').attr('x1', (d) => x(d.year)).attr('x2', (d) => x(d.year)).attr('y1', top - 6).attr('y2', height - margin.bottom);
    ev.select('circle').attr('cx', (d) => x(d.year)).attr('cy', height - margin.bottom + 34);

    axisG.call(d3.axisBottom(x).ticks(Math.round(width / 110)).tickFormat((d) => fmtYear(d)));
  }

  svg.call(d3.zoom().scaleExtent([1, 40]).translateExtent([[0, 0], [width, height]]).extent([[0, 0], [width, height]])
    .on('zoom', (e) => { x = e.transform.rescaleX(x0); draw(); }));
  draw();
}
