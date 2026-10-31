import { api } from '../api.js';
import { esc, loading, errorBox } from '../util.js';

// Renders a Stanford Encyclopedia entry with a sticky table of contents.
// Links to other entries open inside the app; in-page anchors scroll within the reader.
export async function renderSepEntry(container, slug, { section, onAskSection } = {}) {
  container.innerHTML = loading('Fetching from the Stanford Encyclopedia of Philosophy…');
  let entry;
  try {
    entry = await api.sepEntry(slug);
  } catch (err) {
    container.innerHTML = `${errorBox(err)}
      <p class="muted small">The encyclopedia is fetched live from plato.stanford.edu, so this needs an internet connection.
      <a href="https://plato.stanford.edu/entries/${esc(slug)}/" target="_blank" rel="noopener">Open the entry on the SEP website</a>.</p>`;
    return null;
  }
  const anchorId = (id) => `sep-${id}`;
  container.innerHTML = `
    <div class="sep-reader">
      <nav class="sep-toc card" aria-label="Entry contents">
        <strong class="small">Contents</strong>
        <a href="#" data-anchor="${anchorId('preamble')}">Overview</a>
        ${entry.sections.map((s) => `<a href="#" class="l${s.level}" data-anchor="${anchorId(s.id)}">${esc(s.title)}</a>`).join('')}
        ${entry.bibliography ? `<a href="#" data-anchor="${anchorId('bibliography')}">Bibliography</a>` : ''}
        ${entry.related.length ? `<hr><strong class="small">Related entries</strong>${entry.related.slice(0, 20).map((r) => `<a href="#/sep/${esc(r.slug)}">${esc(r.title)}</a>`).join('')}` : ''}
      </nav>
      <article class="sep-body">
        <h2 id="${anchorId('preamble')}" style="margin-top:0">${esc(entry.title)}</h2>
        <p class="muted small" style="font-family:var(--sans)">${esc(entry.pubinfo)} ·
          <a href="${esc(entry.url)}" target="_blank" rel="noopener">Read on plato.stanford.edu</a></p>
        ${entry.preamble}
        ${entry.sections.map((s) => `
          <h${s.level} id="${anchorId(s.id)}">${esc(s.title)}${onAskSection ? `<button class="btn ask-section" type="button" data-ask="${esc(s.title)}">Ask tutor</button>` : ''}</h${s.level}>
          ${s.html}`).join('')}
        ${entry.bibliography ? `<h2 id="${anchorId('bibliography')}">Bibliography</h2><div class="small">${entry.bibliography}</div>` : ''}
        <p class="muted small" style="font-family:var(--sans);margin-top:2rem">Content from the Stanford Encyclopedia of Philosophy, © Metaphysics Research Lab, Stanford University. Cite the original entry.</p>
      </article>
    </div>`;

  container.addEventListener('click', (e) => {
    const ask = e.target.closest('[data-ask]');
    if (ask) { onAskSection?.(ask.dataset.ask, entry); return; }
    const a = e.target.closest('a[data-anchor]');
    if (!a) return;
    e.preventDefault();
    const id = a.dataset.anchor;
    const target = container.querySelector(`#${CSS.escape(id)}`) || container.querySelector(`#${CSS.escape(anchorId(id))}`)
      || container.querySelector(`[name="${CSS.escape(id)}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  if (section) {
    const t = container.querySelector(`#${CSS.escape(anchorId(section))}`) || container.querySelector(`[name="${CSS.escape(section)}"]`);
    t?.scrollIntoView({ block: 'start' });
  }
  return entry;
}
