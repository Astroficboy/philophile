// Compact authoring helper for the curated philosopher records.
//
//   P(id, name, born, died, {
//     c: true,                // dates are approximate
//     sep: 'slug',            // Stanford Encyclopedia slug (defaults to id; null = unknown, filled by sync)
//     region, tradition,
//     topics: 'id id id',     // topic ids, most central first
//     infl: 'id:3 id:2',      // who influenced this philosopher, weight 1 (minor) .. 3 (major)
//     works: 'year Title|year Title',
//     ideas: 'Idea|Idea',
//     summary: '...',
//   })
export function P(id, name, born, died, o = {}) {
  return {
    id,
    name,
    born,
    died,
    approximate: Boolean(o.c),
    sep: o.sep === undefined ? id : o.sep,
    region: o.region || null,
    tradition: o.tradition || null,
    topics: split(o.topics),
    influences: split(o.infl).map((s) => {
      const [pid, w] = s.split(':');
      return { id: pid, weight: Number(w) || 1 };
    }),
    works: (o.works ? o.works.split('|') : []).map((s) => {
      const m = s.trim().match(/^(-?\d+)\s+(.+)$/);
      return m ? { year: Number(m[1]), title: m[2] } : { year: null, title: s.trim() };
    }),
    ideas: o.ideas ? o.ideas.split('|').map((s) => s.trim()) : [],
    summary: o.summary || '',
    source: 'curated',
  };
}

function split(s) {
  return s ? s.trim().split(/\s+/) : [];
}
