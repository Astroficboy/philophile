import { api } from '../api.js';
import { esc, fmtYear, getMeta, progress, avatar, fmtLife } from '../util.js';

export async function render(root) {
  const meta = getMeta();
  const all = await api.philosophers();
  const prog = progress.read();
  const recent = Object.entries(prog.visited).sort((a, b) => b[1].at - a[1].at).slice(0, 6);
  // A stable "philosopher of the day" from the curated set.
  const curated = all.filter((p) => p.source === 'curated');
  const day = Math.floor(Date.now() / 86400000);
  const featured = curated[day % curated.length];
  const influential = [...all].sort((a, b) => b.influenceCount - a.influenceCount).slice(0, 8);

  root.innerHTML = `
    <section class="hero">
      <h1>Learn philosophy through the people who made it</h1>
      <p>Browse ${all.length.toLocaleString()} philosophers, see who shaped whom on era heat maps, follow each life on a timeline,
      read the Stanford Encyclopedia in context, and ask your local AI tutor anything.</p>
      <div class="row">
        <a class="btn primary" href="#/philosophers">Browse philosophers</a>
        <a class="btn" href="#/timeline">Open the timeline</a>
        <a class="btn" href="#/learn">Take a quiz</a>
      </div>
      ${meta.stats.sepIndexDate ? '' : `<p class="notice small" style="margin-top:1rem">Showing the curated set. Import every philosopher from the Stanford Encyclopedia in <a href="#/settings">Settings</a>.</p>`}
    </section>

    ${featured ? `
    <section class="card connection-banner" style="margin:1.5rem 0">
      <div class="row" style="align-items:flex-start;flex-wrap:nowrap">
        ${avatar(featured, 'lg')}
        <div>
          <div class="badge">Philosopher of the day</div>
          <h2 style="margin:.3rem 0"><a href="#/philosopher/${encodeURIComponent(featured.id)}">${esc(featured.name)}</a></h2>
          <div class="muted small">${esc(fmtLife(featured))}${featured.tradition ? ` · ${esc(featured.tradition)}` : ''}</div>
          <p style="margin:.5rem 0 0">${esc(featured.summary)}</p>
        </div>
      </div>
    </section>` : ''}

    ${recent.length ? `
    <div class="section-title"><h2>Continue learning</h2></div>
    <div class="row">${recent.map(([id, v]) => `<a class="chip" href="#/philosopher/${encodeURIComponent(id)}">${esc(v.name)}</a>`).join('')}</div>` : ''}

    <div class="section-title"><h2>Eras</h2><a href="#/timeline">See them on the timeline →</a></div>
    <div class="era-strip">
      ${meta.eras.map((e) => {
        const n = all.filter((p) => p.era === e.id).length;
        return `<a class="era-card" style="background:${e.color}" href="#/philosophers?era=${e.id}">
          <div><h3>${esc(e.name)}</h3><div class="small">${fmtYear(e.start)} – ${e.end > 2025 ? 'today' : fmtYear(e.end)} · ${n} philosophers</div></div>
          <p>${esc(e.blurb)}</p></a>`;
      }).join('')}
    </div>

    <div class="section-title"><h2>Most influential</h2><span class="muted small">by number of philosophers they influenced</span></div>
    <div class="grid">
      ${influential.map((p) => `<a class="card ph-card" href="#/philosopher/${encodeURIComponent(p.id)}">
        <div class="row">${avatar(p)}<div><h3>${esc(p.name)}</h3><div class="dates">${esc(fmtLife(p))}</div></div></div>
        <p>Influenced ${p.influenceCount} philosophers in this collection.</p></a>`).join('')}
    </div>`;
}
