import { api } from '../api.js';
import { esc } from '../util.js';
import { renderSepEntry } from '../components/sep-reader.js';

// Any Stanford Encyclopedia entry, reached by following links inside other entries.
export async function render(root, { slug }, query) {
  // If this entry belongs to a philosopher, offer their profile too.
  const all = await api.philosophers();
  const person = all.find((p) => p.sep === slug);
  root.innerHTML = `
    ${person ? `<div class="notice" style="margin-bottom:1rem">This is the entry for <strong>${esc(person.name)}</strong>.
      <a href="#/philosopher/${encodeURIComponent(person.id)}">Open their profile, era map and timeline →</a></div>` : ''}
    <div></div>
    <div class="row" style="margin-top:1rem"><a class="btn" href="#/learn?sep=${encodeURIComponent(slug)}">Ask the tutor about this entry</a></div>`;
  const entry = await renderSepEntry(root.children[person ? 1 : 0], slug, {
    section: query.section,
    onAskSection: (title) => { location.hash = `#/learn?sep=${encodeURIComponent(slug)}&q=${encodeURIComponent(`Explain the section “${title}”.`)}`; },
  });
  if (entry) document.title = `${entry.title} – Philophile`;
}
