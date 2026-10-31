// Builds data/sep-index.json: every person entry in the Stanford Encyclopedia,
// with life dates parsed from the entry preamble, plus the list of topic entries.
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { getContents, getEntry, displayNameFromLabel } from './sep.js';

export const syncState = {
  running: false,
  phase: 'idle',
  done: 0,
  total: 0,
  found: 0,
  errors: 0,
  startedAt: null,
  finishedAt: null,
  message: '',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runSepSync({ force = false, limit = Infinity, log = () => {}, onDone } = {}) {
  if (syncState.running) throw Object.assign(new Error('A sync is already running'), { status: 409 });
  Object.assign(syncState, {
    running: true, phase: 'contents', done: 0, total: 0, found: 0, errors: 0,
    startedAt: new Date().toISOString(), finishedAt: null, message: 'Reading table of contents…',
  });

  try {
    const contents = await getContents({ force });
    const candidates = contents.filter((c) => c.isPersonCandidate).slice(0, limit);
    const topics = contents.filter((c) => !c.isPersonCandidate).map(({ slug, label }) => ({ slug, label }));
    syncState.total = candidates.length;
    syncState.phase = 'entries';
    log(`Found ${contents.length} entries, ${candidates.length} possible philosophers.`);

    const people = [];
    const texts = new Map();
    for (const c of candidates) {
      syncState.message = `Reading ${c.label}`;
      try {
        const entry = await getEntry(c.slug, { force });
        const isPerson = Boolean(entry.lifespan) || c.label.includes(',');
        if (isPerson) {
          people.push({
            slug: c.slug,
            name: entry.title || displayNameFromLabel(c.label),
            label: c.label,
            born: entry.lifespan?.born ?? null,
            died: entry.lifespan?.died ?? null,
            approximate: entry.lifespan?.approximate ?? false,
            summary: firstSentences(entry.preambleText, 2),
            related: entry.related.map((r) => r.slug),
          });
          texts.set(c.slug, entry.preambleText + ' ' + entry.sections.map((s) => s.html.replace(/<[^>]+>/g, ' ')).join(' '));
          syncState.found = people.length;
        } else {
          topics.push({ slug: c.slug, label: c.label });
        }
      } catch (err) {
        syncState.errors++;
        log(`  ! ${c.slug}: ${err.message}`);
      }
      syncState.done++;
      if (syncState.done % 25 === 0) log(`  ${syncState.done}/${syncState.total} read, ${people.length} philosophers`);
      await sleep(config.sep.delayMs);
    }

    syncState.phase = 'mentions';
    syncState.message = 'Linking philosophers who discuss each other…';
    addMentions(people, texts);

    const index = {
      generatedAt: new Date().toISOString(),
      source: config.sep.base,
      people: people.sort((a, b) => a.name.localeCompare(b.name)),
      topics: topics.sort((a, b) => a.label.localeCompare(b.label)),
    };
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(config.sepIndexFile, JSON.stringify(index, null, 1));
    Object.assign(syncState, { phase: 'done', message: `Synced ${people.length} philosophers and ${topics.length} topics.` });
    log(syncState.message);
    onDone?.(index);
    return index;
  } catch (err) {
    Object.assign(syncState, { phase: 'error', message: err.message });
    throw err;
  } finally {
    syncState.running = false;
    syncState.finishedAt = new Date().toISOString();
  }
}

// For each person, count how often other people's names appear in their entry.
// Frequently discussed earlier thinkers are a good proxy for influence.
function addMentions(people, texts) {
  const keys = people
    .map((p) => ({ slug: p.slug, key: mentionKey(p), born: p.born }))
    .filter((k) => k.key && k.key.length >= 4);
  const keyCounts = new Map();
  for (const k of keys) keyCounts.set(k.key, (keyCounts.get(k.key) || 0) + 1);
  const unique = keys.filter((k) => keyCounts.get(k.key) === 1);
  const patterns = unique.map((k) => ({ ...k, re: new RegExp(`\\b${escapeRe(k.key)}(?:'s|’s)?\\b`, 'g') }));

  for (const p of people) {
    const text = texts.get(p.slug);
    if (!text) continue;
    const counts = [];
    for (const k of patterns) {
      if (k.slug === p.slug) continue;
      const n = (text.match(k.re) || []).length;
      if (n >= 2) counts.push({ slug: k.slug, count: n, born: k.born });
    }
    p.mentions = counts
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .map(({ slug, count }) => ({ slug, count }));
  }
}

// "Kant, Immanuel" -> "Kant"; "Aristotle" -> "Aristotle"; "Beauvoir, Simone de" -> "Beauvoir"
function mentionKey(p) {
  const head = p.label.split(',')[0].trim();
  return head.split(/\s+/).length <= 2 ? head : null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Sentence ends are a ., ! or ? followed by a capitalised word, but not after
// abbreviations such as "B.C.E.", "c.", "e.g." or a single initial.
export function firstSentences(text, n) {
  if (!text) return '';
  const ends = /(?<!\b(?:[A-Z]|[A-Z]\.[A-Z]|c|ca|cf|e\.g|i\.e|vol|St|Mr|Dr|fl|b|d))[.!?](?=\s+[A-ZÀ-ɏ“"(])/g;
  let count = 0;
  let m;
  while ((m = ends.exec(text))) {
    if (++count === n) return text.slice(0, m.index + 1).trim().slice(0, 600);
  }
  return text.trim().slice(0, 600);
}
