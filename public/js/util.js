export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function fmtYear(y) {
  if (y == null) return '?';
  return y < 0 ? `${-y} BCE` : String(y);
}

export function fmtLife(p) {
  const c = p.approximate ? 'c. ' : '';
  if (p.born == null && p.died == null) return 'dates unknown';
  if (p.died == null) return `born ${c}${fmtYear(p.born)}`;
  if (p.born == null) return `died ${c}${fmtYear(p.died)}`;
  // "470–399 BCE" reads better than "470 BCE–399 BCE".
  if (p.born < 0 && p.died < 0) return `${c}${-p.born}–${-p.died} BCE`;
  return `${c}${fmtYear(p.born)}–${fmtYear(p.died)}`;
}

let meta = null;
export function setMeta(m) { meta = m; }
export function getMeta() { return meta; }

export function eraOf(id) {
  return meta?.eras.find((e) => e.id === id) || null;
}

export function eraChip(id) {
  const e = eraOf(id);
  return e ? `<a class="chip era" style="background:${e.color}" href="#/timeline?era=${e.id}">${esc(e.name)}</a>` : '';
}

export function topicName(id) {
  return meta?.topics.find((t) => t.id === id)?.name || id;
}

export function initials(name) {
  const parts = name.replace(/\(.*?\)/g, '').split(/\s+/).filter((w) => /^[A-ZÀ-ɏ]/.test(w));
  return ((parts[0]?.[0] || name[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function avatar(p, cls = '') {
  const e = eraOf(p.era);
  return `<span class="avatar ${cls}" style="background:${e?.color || '#8a7b66'}" aria-hidden="true">${esc(initials(p.name))}</span>`;
}

// Small, safe Markdown renderer for tutor answers.
export function markdown(src) {
  const lines = esc(src).split('\n');
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flushPara(); flushList(); const n = Math.min(4, m[1].length + 2); out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { flushPara(); if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushPara(); if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^&gt;\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return out.join('');
}

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[SEP:\s*([^\]]+)\]/g, '<span class="chip" title="From the Stanford Encyclopedia">SEP · $1</span>');
}

// Learning progress, stored per browser.
const KEY = 'philophile.progress.v1';
export const progress = {
  read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { visited: {}, quizzes: [] }; } catch { return { visited: {}, quizzes: [] }; }
  },
  write(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
  },
  visit(id, name) {
    const p = this.read();
    p.visited[id] = { name, at: Date.now(), count: (p.visited[id]?.count || 0) + 1 };
    this.write(p);
  },
  recordQuiz(entry) {
    const p = this.read();
    p.quizzes.unshift({ ...entry, at: Date.now() });
    p.quizzes = p.quizzes.slice(0, 100);
    this.write(p);
  },
};

const tip = () => document.getElementById('tooltip');
export function showTip(html, evt) {
  const t = tip();
  t.innerHTML = html;
  t.hidden = false;
  const x = Math.min(window.innerWidth - t.offsetWidth - 12, evt.clientX + 14);
  const y = Math.min(window.innerHeight - t.offsetHeight - 12, evt.clientY + 14);
  t.style.left = `${Math.max(8, x)}px`;
  t.style.top = `${Math.max(8, y)}px`;
}
export function hideTip() { tip().hidden = true; }

export function loading(msg = 'Loading…') {
  return `<div class="loading">${esc(msg)}</div>`;
}

export function errorBox(err) {
  return `<div class="error">${esc(err?.message || err)}</div>`;
}
