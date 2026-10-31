import { api } from '../api.js';
import { esc, fmtYear, fmtLife, avatar, getMeta } from '../util.js';
import { renderSepEntry } from '../components/sep-reader.js';
import { mountChat } from '../components/chat.js';
import { mountQuiz } from '../components/quiz.js';
import { aiStatus, streamInto } from '../components/ai.js';
import { heatColor } from '../components/heatmap.js';

export async function render(root, { id }, query) {
  const t = await api.topic(id, query.with);
  const focus = t.focus;
  const tab = query.tab || 'overview';
  const base = `#/topic/${encodeURIComponent(t.id)}?${query.with ? `with=${encodeURIComponent(query.with)}&` : ''}tab=`;
  document.title = `${t.name} – Philophile`;
  const meta = getMeta();

  root.innerHTML = `
    ${focus ? `
    <section class="card connection-banner" style="margin-bottom:1.25rem;border-left-color:${focus.heat > 0 ? heatColor(focus.heat) : 'var(--contemporary)'}">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div class="row" style="flex-wrap:nowrap;align-items:flex-start">
          ${avatar(focus.philosopher)}
          <div>
            <span class="badge">${esc(t.name)} × ${esc(focus.philosopher.name)}</span>
            <p style="margin:.4rem 0 .2rem"><strong>${esc(focus.reason)}</strong></p>
            <div class="small muted">Influence on ${esc(focus.philosopher.name)}: ${Math.round(focus.heat * 100)}%
              ${focus.engaged ? ` · #${focus.rank} of their topics` : ''}</div>
            ${focus.via.length ? `<div class="small">Carried by: ${focus.via.map((v) => `<a href="#/philosopher/${encodeURIComponent(v.id)}?from=${encodeURIComponent(focus.philosopher.id)}">${esc(v.name)}</a>`).join(', ')}</div>` : ''}
            ${focus.contemporaries.length ? `<div class="small">Also working on this in their lifetime: ${focus.contemporaries.map((v) => `<a href="#/philosopher/${encodeURIComponent(v.id)}">${esc(v.name)}</a>`).join(', ')}</div>` : ''}
          </div>
        </div>
        <div class="row">
          <a class="btn" href="#/philosopher/${encodeURIComponent(focus.philosopher.id)}/era-map">← ${esc(focus.philosopher.name)}’s era map</a>
          <button class="btn primary" type="button" data-explain>Explain with AI</button>
        </div>
      </div>
      <div class="explain-out" style="margin-top:.75rem"></div>
    </section>` : ''}
    <h1>${esc(t.name)}</h1>
    <div class="row small" style="gap:.4rem">
      <span class="badge">${esc(t.kind)}</span>
      <span class="muted">${fmtYear(t.start)} – ${t.end > 2025 ? 'today' : fmtYear(t.end)}</span>
      ${t.eras.map((e) => { const era = meta.eras.find((x) => x.id === e); return `<span class="chip era" style="background:${era.color}">${esc(era.name)}</span>`; }).join('')}
    </div>
    <nav class="tabs">
      ${[['overview', 'Overview'], ['encyclopedia', 'Encyclopedia'], ['ask', 'Ask the tutor'], ['quiz', 'Quiz']]
        .map(([k, label]) => `<a href="${base}${k}" class="${k === tab ? 'active' : ''}">${label}</a>`).join('')}
    </nav>
    <div id="tab"></div>`;

  root.querySelector('[data-explain]')?.addEventListener('click', async (e) => {
    const out = root.querySelector('.explain-out');
    const status = await aiStatus();
    if (!status.model) { out.innerHTML = `<p class="muted small">${esc(status.error)}</p>`; return; }
    e.target.disabled = true;
    await streamInto(out, (onToken) => api.connection({ philosopherId: focus.philosopher.id, targetType: 'topic', targetId: t.id }, onToken));
    e.target.disabled = false;
  });

  const el = root.querySelector('#tab');
  if (tab === 'encyclopedia') {
    el.innerHTML = '<div></div>';
    await renderSepEntry(el.firstChild, t.sep, {
      onAskSection: (title) => { location.hash = `${base}ask&q=${encodeURIComponent(`Explain “${title}” from the ${t.name} article.`)}`; },
    });
  } else if (tab === 'ask') {
    el.innerHTML = '<div class="card"></div>';
    await mountChat(el.firstChild, {
      topicId: t.id,
      philosopherId: focus?.philosopher.id,
      subject: focus ? `${t.name} and ${focus.philosopher.name}` : t.name,
      initialQuestion: query.q,
      suggestions: [
        `What is ${t.name} in a nutshell?`,
        `What are the strongest objections to ${t.name}?`,
        ...(focus ? [`How did ${focus.philosopher.name} engage with ${t.name}?`] : [`Who are the key figures in ${t.name} and why?`]),
        `Give me a thought experiment about ${t.name}`,
      ],
    });
  } else if (tab === 'quiz') {
    el.innerHTML = '<div class="card"></div>';
    mountQuiz(el.firstChild, { topicId: t.id, title: t.name });
  } else {
    el.innerHTML = `
      <div class="two-col">
        <div class="stack">
          <section class="card"><p style="font-family:var(--serif);font-size:1.15rem;margin:0">${esc(t.summary)}</p>
            <p style="margin:.75rem 0 0"><a href="${base}encyclopedia">Read the Stanford Encyclopedia article →</a></p></section>
          <section><h2>Key figures</h2>
            <div class="grid">${t.philosophers.map((p) => `<a class="card ph-card" href="#/philosopher/${encodeURIComponent(p.id)}"
              style="${focus && p.id === focus.philosopher.id ? 'border-color:var(--accent)' : ''}">
              <div class="row" style="flex-wrap:nowrap">${avatar(p)}<div><h3>${esc(p.name)}</h3><div class="dates">${esc(fmtLife(p))}</div></div></div>
              <p>${esc(p.summary)}</p></a>`).join('') || '<p class="muted">No philosophers tagged yet.</p>'}</div>
          </section>
        </div>
        <aside class="stack">
          <section class="card"><h3>Related topics</h3>
            <div class="row" style="gap:.35rem">${t.related.map((r) => `<a class="chip" href="#/topic/${r.id}${query.with ? `?with=${encodeURIComponent(query.with)}` : ''}">${esc(r.name)}</a>`).join('') || '<span class="muted small">None yet</span>'}</div></section>
          <section class="card"><h3>On the timeline</h3><a href="#/timeline?topic=${t.id}">Highlight ${esc(t.name)} on the timeline →</a></section>
        </aside>
      </div>`;
  }
}
