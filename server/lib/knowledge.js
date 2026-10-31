// The knowledge graph: curated philosophers merged with every person entry in the
// Stanford Encyclopedia index, plus AI-enriched details when available.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { ERAS, EVENTS, eraForYear } from '../data/eras.js';
import { TOPICS } from '../data/topics.js';
import { CURATED_PHILOSOPHERS } from '../data/philosophers/index.js';

const NOW = new Date().getFullYear();
const topicById = new Map(TOPICS.map((t) => [t.id, t]));
const topicBySep = new Map(TOPICS.map((t) => [t.sep, t]));

let state = build();

export function reload() {
  state = build();
  return stats();
}

export function stats() {
  return {
    philosophers: state.list.length,
    curated: state.list.filter((p) => p.source === 'curated').length,
    fromSep: state.list.filter((p) => p.sepIndexed).length,
    sepTopics: state.sepTopics.length,
    sepIndexDate: state.sepIndexDate,
    topics: TOPICS.length,
    eras: ERAS.length,
    events: EVENTS.length,
  };
}

// ---------------------------------------------------------------------------
// Building

function normName(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function loadEnriched() {
  const dir = path.join(config.cacheDir, 'enriched');
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const data = readJson(path.join(dir, f));
    if (data?.id) out.set(data.id, data);
  }
  return out;
}

function build() {
  const sepIndex = readJson(config.sepIndexFile);
  const sepPeople = sepIndex?.people || [];
  const byId = new Map();

  for (const c of CURATED_PHILOSOPHERS) {
    byId.set(c.id, { ...c, sepIndexed: false, influences: c.influences.map((i) => ({ ...i, source: 'curated' })) });
  }

  // Match SEP entries to curated philosophers by slug, then by normalised name.
  const curatedBySep = new Map();
  const curatedByName = new Map();
  for (const p of byId.values()) {
    if (p.sep) curatedBySep.set(p.sep, p);
    curatedBySep.set(p.id, curatedBySep.get(p.id) || p);
    curatedByName.set(normName(p.name), p);
  }
  const slugToId = new Map();
  for (const s of sepPeople) {
    const match = curatedBySep.get(s.slug) || curatedByName.get(normName(s.name)) || curatedByName.get(normName(displayLabel(s.label)));
    if (match) {
      // A curated record linked to a topic page gets upgraded to the dedicated person entry.
      match.sep = s.slug;
      match.sepIndexed = true;
      match.sepSummary = s.summary;
      slugToId.set(s.slug, match.id);
    } else {
      const id = byId.has(s.slug) ? `sep-${s.slug}` : s.slug;
      byId.set(id, {
        id,
        name: s.name,
        born: s.born,
        died: s.died,
        approximate: s.approximate,
        sep: s.slug,
        region: null,
        tradition: null,
        topics: (s.related || []).map((r) => topicBySep.get(r)?.id).filter(Boolean),
        influences: [],
        works: [],
        ideas: [],
        summary: s.summary,
        source: 'sep',
        sepIndexed: true,
        _mentions: s.mentions || [],
      });
      slugToId.set(s.slug, id);
    }
  }

  // Influences for encyclopedia-only entries come from who their entry discusses most.
  for (const p of byId.values()) {
    if (!p._mentions) continue;
    p.influences = p._mentions
      .map((m) => ({ id: slugToId.get(m.slug), count: m.count }))
      .filter((m) => m.id && m.id !== p.id)
      .filter((m) => {
        const q = byId.get(m.id);
        return q && q.born != null && p.born != null && q.born < p.born;
      })
      .slice(0, 10)
      .map((m) => ({ id: m.id, weight: m.count >= 12 ? 3 : m.count >= 5 ? 2 : 1, source: 'sep-mentions' }));
    delete p._mentions;
  }

  // AI-enriched details (from the local Ollama model) fill gaps but never override curated facts.
  const enriched = loadEnriched();
  for (const [id, e] of enriched) {
    const p = byId.get(id);
    if (!p) continue;
    p.enriched = true;
    const fill = (key) => {
      if ((p[key] == null || (Array.isArray(p[key]) && !p[key].length) || p[key] === '') && e[key] != null) p[key] = e[key];
    };
    ['born', 'died', 'region', 'tradition', 'works', 'ideas'].forEach(fill);
    if (p.source !== 'curated') {
      if (e.summary) p.summary = e.summary;
      const topics = (e.topics || []).filter((t) => topicById.has(t));
      p.topics = [...new Set([...topics, ...p.topics])];
      const known = new Set(p.influences.map((i) => i.id));
      for (const inf of e.influences || []) {
        if (byId.has(inf.id) && !known.has(inf.id) && inf.id !== id) {
          p.influences.push({ id: inf.id, weight: inf.weight || 2, source: 'ai' });
          known.add(inf.id);
        }
      }
    }
  }

  // Derived fields.
  const influencedBy = new Map();
  for (const p of byId.values()) {
    p.influences = p.influences.filter((i) => byId.has(i.id));
    for (const i of p.influences) {
      if (!influencedBy.has(i.id)) influencedBy.set(i.id, []);
      influencedBy.get(i.id).push({ id: p.id, weight: i.weight });
    }
    p.floruit = floruit(p);
    p.era = p.floruit != null ? eraForYear(p.floruit).id : null;
  }
  for (const p of byId.values()) p.influenced = influencedBy.get(p.id) || [];

  const list = [...byId.values()].sort((a, b) => (a.born ?? 99999) - (b.born ?? 99999) || a.name.localeCompare(b.name));
  return {
    byId,
    list,
    sepTopics: sepIndex?.topics || [],
    sepIndexDate: sepIndex?.generatedAt || null,
  };
}

function displayLabel(label) {
  if (!label) return '';
  const [a, b] = label.split(',').map((s) => s.trim());
  return b ? `${b} ${a}` : a;
}

function floruit(p) {
  if (p.born != null && p.died != null) return Math.round(p.born + Math.min(40, (p.died - p.born) * 0.6));
  if (p.born != null) return p.born + 40;
  if (p.died != null) return p.died - 20;
  return null;
}

// ---------------------------------------------------------------------------
// Queries

export function light(p) {
  return {
    id: p.id,
    name: p.name,
    born: p.born,
    died: p.died,
    approximate: p.approximate,
    era: p.era,
    tradition: p.tradition,
    region: p.region,
    source: p.source,
    sep: p.sep,
    topics: p.topics.slice(0, 4),
    summary: p.summary ? p.summary.slice(0, 220) : '',
    influenceCount: p.influenced.length,
  };
}

export function listPhilosophers({ q, era, tradition, topic, source } = {}) {
  const nq = q ? normName(q) : null;
  return state.list
    .filter((p) => !era || p.era === era)
    .filter((p) => !tradition || p.tradition === tradition)
    .filter((p) => !topic || p.topics.includes(topic))
    .filter((p) => !source || p.source === source)
    .filter((p) => !nq || normName(p.name).includes(nq) || normName(p.summary).includes(nq))
    .map(light);
}

export function traditions() {
  return [...new Set(state.list.map((p) => p.tradition).filter(Boolean))].sort();
}

export function getRaw(id) {
  return state.byId.get(id) || null;
}

export function getPhilosopher(id) {
  const p = state.byId.get(id);
  if (!p) return null;
  const ref = (x) => {
    const q = state.byId.get(x.id);
    return q ? { ...light(q), weight: x.weight, source: x.source } : null;
  };
  return {
    ...p,
    eraInfo: ERAS.find((e) => e.id === p.era) || null,
    topics: p.topics.map((t) => topicById.get(t)).filter(Boolean),
    influences: p.influences.map(ref).filter(Boolean).sort((a, b) => b.weight - a.weight),
    influenced: p.influenced.map(ref).filter(Boolean).sort((a, b) => b.weight - a.weight),
  };
}

export function getTopics() {
  return TOPICS.map((t) => ({
    ...t,
    philosopherCount: state.list.filter((p) => p.topics.includes(t.id)).length,
  }));
}

export function sepTopics() {
  return state.sepTopics;
}

export function getTopic(id, withId) {
  const t = topicById.get(id);
  if (!t) return null;
  const philosophers = state.list
    .filter((p) => p.topics.includes(id))
    .map((p) => ({ ...light(p), centrality: 1 - p.topics.indexOf(id) / Math.max(p.topics.length, 1) }))
    .sort((a, b) => (a.born ?? 0) - (b.born ?? 0));
  const result = {
    ...t,
    eras: ERAS.filter((e) => e.start < t.end && e.end > t.start).map((e) => e.id),
    philosophers,
    related: relatedTopics(id),
  };
  if (withId) {
    const p = state.byId.get(withId);
    if (p) result.focus = topicRelation(p, t);
  }
  return result;
}

function relatedTopics(id) {
  const counts = new Map();
  for (const p of state.list) {
    if (!p.topics.includes(id)) continue;
    for (const t of p.topics) if (t !== id) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tid, n]) => ({ ...topicById.get(tid), shared: n }));
}

// How a topic bears on a given philosopher: their own engagement and which influences carried it.
function topicRelation(p, t) {
  const own = p.topics.indexOf(t.id);
  const via = p.influences
    .map((i) => state.byId.get(i.id))
    .filter((q) => q && q.topics.includes(t.id))
    .map((q) => ({ id: q.id, name: q.name }));
  const contemporaries = state.list
    .filter((q) => q.id !== p.id && q.topics.includes(t.id) && overlaps(q, lifeWindow(p)))
    .slice(0, 12)
    .map((q) => ({ id: q.id, name: q.name, born: q.born, died: q.died }));
  const score = topicHeat(p, t);
  return {
    philosopher: light(p),
    engaged: own >= 0,
    rank: own >= 0 ? own + 1 : null,
    via,
    contemporaries,
    heat: score.heat,
    reason: score.reason,
  };
}

// ---------------------------------------------------------------------------
// Era heatmap

function lifeWindow(p) {
  const born = p.born ?? (p.died != null ? p.died - 60 : p.floruit - 40);
  const died = p.died ?? Math.min(NOW, born + 90);
  return { start: born - 40, end: died + 10, born, died };
}

function span(q) {
  const start = q.born ?? (q.died != null ? q.died - 60 : null);
  const end = q.died ?? (q.born != null ? Math.min(NOW, q.born + 80) : null);
  return { start, end };
}

function overlaps(q, w) {
  const s = span(q);
  return s.start != null && s.start < w.end && s.end > w.start;
}

function topicHeat(p, t) {
  const idx = p.topics.indexOf(t.id);
  const own = idx >= 0 ? Math.max(0.55, 1 - idx * 0.08) : 0;
  const infl = p.influences.map((i) => ({ i, q: state.byId.get(i.id) })).filter(({ q }) => q?.topics.includes(t.id));
  const totalW = p.influences.reduce((s, i) => s + i.weight, 0) || 1;
  const carried = infl.reduce((s, { i }) => s + i.weight, 0) / totalW;
  const heat = Math.min(1, own + carried * 0.6);
  let reason;
  if (idx >= 0 && infl.length) reason = `Central to ${p.name}; inherited via ${infl.slice(0, 3).map(({ q }) => q.name).join(', ')}`;
  else if (idx >= 0) reason = `One of ${p.name}’s own concerns`;
  else if (infl.length) reason = `Reached ${p.name} indirectly through ${infl.slice(0, 3).map(({ q }) => q.name).join(', ')}`;
  else reason = `Active in this era (${fmtSpan(t.start, t.end)}) but not a direct influence`;
  return { heat: Math.round(heat * 100) / 100, reason };
}

export function eraMap(id) {
  const p = state.byId.get(id);
  if (!p) return null;
  const w = lifeWindow(p);
  const direct = new Map(p.influences.map((i) => [i.id, i]));
  const indirect = new Map();
  for (const i of p.influences) {
    const q = state.byId.get(i.id);
    for (const j of q?.influences || []) {
      if (!direct.has(j.id) && j.id !== p.id) indirect.set(j.id, (indirect.get(j.id) || []).concat(q.name));
    }
  }
  const influencedIds = new Set(p.influenced.map((i) => i.id));
  const items = [];

  // Philosophers: every direct influence (whatever century), plus everyone alive in the window.
  for (const q of state.list) {
    if (q.id === p.id) continue;
    const s = span(q);
    const inWindow = overlaps(q, w);
    let heat = 0;
    let relation;
    let reason;
    if (direct.has(q.id)) {
      const wgt = direct.get(q.id).weight;
      heat = [0, 0.45, 0.72, 1][wgt] || 0.45;
      relation = 'influence';
      reason = `${['', 'Minor', 'Significant', 'Major'][wgt] || 'Some'} influence on ${p.name}`;
    } else if (indirect.has(q.id) && inWindow) {
      heat = 0.22;
      relation = 'indirect';
      reason = `Indirect influence through ${[...new Set(indirect.get(q.id))].slice(0, 3).join(', ')}`;
    } else if (influencedIds.has(q.id) && inWindow) {
      relation = 'influenced';
      reason = `Influenced by ${p.name}`;
    } else if (inWindow) {
      relation = 'contemporary';
      reason = `Active ${fmtSpan(s.start, s.end)}; not a direct influence`;
    } else {
      continue;
    }
    items.push({
      type: 'philosopher', id: q.id, name: q.name, start: s.start, end: s.end, heat, relation, reason,
      tradition: q.tradition, curated: q.source === 'curated',
    });
  }

  // Keep the map readable: all influences, but only the most relevant contemporaries.
  const keepContemporaries = 36;
  const contemporaries = items
    .filter((i) => i.relation === 'contemporary')
    .sort((a, b) => Number(b.curated) - Number(a.curated) || Math.abs(mid(a) - mid(w)) - Math.abs(mid(b) - mid(w)))
    .slice(0, keepContemporaries);
  const philosophers = items.filter((i) => i.relation !== 'contemporary').concat(contemporaries);

  const topics = TOPICS.filter((t) => (t.start < w.end && t.end > w.start) || p.topics.includes(t.id))
    .filter((t) => t.kind !== 'branch' || p.topics.includes(t.id) || t.start > w.start - 200)
    .map((t) => {
      const { heat, reason } = topicHeat(p, t);
      return { type: 'topic', id: t.id, name: t.name, start: t.start, end: t.end, heat, relation: heat > 0 ? 'influence' : 'contemporary', reason, kind: t.kind };
    });

  const events = EVENTS.filter((e) => e.year >= w.start && e.year <= w.end).map((e) => ({
    type: 'event', id: `${e.year}-${e.title}`, name: e.title, year: e.year, category: e.category, region: e.region,
    heat: 0, relation: 'event', reason: `${fmtYear(e.year)} — ${e.region}`,
  }));

  return {
    philosopher: light(p),
    window: { start: w.start, end: w.end, born: w.born, died: w.died },
    era: ERAS.find((e) => e.id === p.era) || null,
    items: [...philosophers, ...topics, ...events].sort((a, b) => b.heat - a.heat || (a.start ?? a.year) - (b.start ?? b.year)),
  };
}

function mid(x) {
  return ((x.start ?? 0) + (x.end ?? 0)) / 2;
}

// ---------------------------------------------------------------------------
// Timelines

export function personalTimeline(id) {
  const p = state.byId.get(id);
  if (!p) return null;
  const w = lifeWindow(p);
  const milestones = [];
  if (p.born != null) milestones.push({ year: p.born, title: `Born${p.region ? ` (${p.region})` : ''}`, kind: 'birth' });
  for (const work of p.works) if (work.year != null) milestones.push({ year: work.year, title: work.title, kind: 'work' });
  if (p.died != null) milestones.push({ year: p.died, title: 'Died', kind: 'death' });

  const direct = new Map(p.influences.map((i) => [i.id, i.weight]));
  const influenced = new Set(p.influenced.map((i) => i.id));
  const lanes = state.list
    .filter((q) => q.id !== p.id && (direct.has(q.id) || influenced.has(q.id) || (overlaps(q, { start: w.born, end: w.died }) && q.source === 'curated')))
    .map((q) => {
      const s = span(q);
      return {
        id: q.id, name: q.name, start: s.start, end: s.end,
        relation: direct.has(q.id) ? 'influence' : influenced.has(q.id) ? 'influenced' : 'contemporary',
        weight: direct.get(q.id) || 0,
      };
    })
    .filter((l) => l.start != null)
    .sort((a, b) => a.start - b.start)
    .slice(0, 40);

  const lifeEnd = p.died ?? NOW;
  return {
    philosopher: { ...light(p), floruit: p.floruit },
    range: {
      start: Math.min(w.born, ...lanes.map((l) => l.start)),
      end: Math.max(lifeEnd, ...lanes.map((l) => Math.min(l.end, lifeEnd + 60))),
    },
    milestones: milestones.sort((a, b) => a.year - b.year),
    lanes,
    events: EVENTS.filter((e) => e.year >= w.born - 10 && e.year <= lifeEnd + 10),
    eras: ERAS,
  };
}

export function globalTimeline({ era, topic } = {}) {
  return {
    eras: ERAS,
    events: EVENTS,
    philosophers: state.list
      .filter((p) => p.born != null || p.died != null)
      .filter((p) => !era || p.era === era)
      .filter((p) => !topic || p.topics.includes(topic))
      .map((p) => {
        const s = span(p);
        return { id: p.id, name: p.name, start: s.start, end: s.end, era: p.era, tradition: p.tradition, source: p.source, influence: p.influenced.length };
      }),
  };
}

export function influenceGraph(id, depth = 2) {
  const p = state.byId.get(id);
  if (!p) return null;
  const nodes = new Map([[p.id, { id: p.id, name: p.name, born: p.born, level: 0 }]]);
  const links = [];
  let frontier = [p];
  for (let d = 1; d <= depth; d++) {
    const next = [];
    for (const q of frontier) {
      for (const i of q.influences) {
        const r = state.byId.get(i.id);
        if (!r) continue;
        links.push({ source: r.id, target: q.id, weight: i.weight });
        if (!nodes.has(r.id)) {
          nodes.set(r.id, { id: r.id, name: r.name, born: r.born, level: -d });
          next.push(r);
        }
      }
    }
    frontier = next;
  }
  for (const i of p.influenced) {
    const r = state.byId.get(i.id);
    if (!r) continue;
    links.push({ source: p.id, target: r.id, weight: i.weight });
    if (!nodes.has(r.id)) nodes.set(r.id, { id: r.id, name: r.name, born: r.born, level: 1 });
  }
  return { nodes: [...nodes.values()], links };
}

export function meta() {
  return { eras: ERAS, topics: TOPICS, traditions: traditions(), stats: stats() };
}

function fmtYear(y) {
  if (y == null) return '?';
  return y < 0 ? `${-y} BCE` : `${y}`;
}

function fmtSpan(a, b) {
  return `${fmtYear(a)}–${b >= NOW ? 'present' : fmtYear(b)}`;
}
