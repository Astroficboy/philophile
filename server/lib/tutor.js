// The AI tutor: grounds every prompt in curated facts and the Stanford Encyclopedia
// text, then asks the local Ollama model.
import { chatJson, chatStream } from './ollama.js';
import { getEntry } from './sep.js';
import { getPhilosopher, getRaw, getTopic, reload } from './knowledge.js';
import { TOPICS } from '../data/topics.js';
import { writeJsonCache } from './cache.js';

const SYSTEM = `You are Philophile, a patient philosophy tutor.
Ground your answers in the provided context, which comes from a curated dataset and the Stanford Encyclopedia of Philosophy (SEP).
When you use SEP material, mention the section title in brackets, e.g. [SEP: 2. Transcendental Idealism].
If the context does not cover something, say so briefly and answer from general knowledge, flagging it as such.
Explain clearly for a motivated learner: define technical terms, use one concrete example, and end with a short question that checks understanding.`;

function fmtYear(y) {
  if (y == null) return '?';
  return y < 0 ? `${-y} BCE` : String(y);
}

function words(s) {
  return new Set((s || '').toLowerCase().match(/[a-z]{4,}/g) || []);
}

// Pick the SEP sections most relevant to a question, within a character budget.
function selectSections(entry, question, budget) {
  const q = words(question);
  const scored = entry.sections.map((s, i) => {
    const text = s.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    let score = 0;
    for (const w of words(s.title)) if (q.has(w)) score += 3;
    for (const w of q) if (text.toLowerCase().includes(w)) score += 1;
    return { s, text, score: score - i * 0.01 };
  });
  scored.sort((a, b) => b.score - a.score);
  const out = [];
  let used = 0;
  for (const { s, text } of scored) {
    if (used >= budget) break;
    const piece = text.slice(0, Math.min(2500, budget - used));
    out.push(`## ${s.title}\n${piece}`);
    used += piece.length;
  }
  return out.join('\n\n');
}

async function sepContext(slug, question, budget = 6000) {
  if (!slug) return '';
  try {
    const entry = await getEntry(slug);
    return `# SEP entry: ${entry.title} (${entry.url})\n${entry.preambleText}\n\n${selectSections(entry, question, budget)}`;
  } catch (err) {
    return `(SEP entry "${slug}" could not be loaded: ${err.message})`;
  }
}

function philosopherFacts(p) {
  if (!p) return '';
  return [
    `# ${p.name} (${fmtYear(p.born)}–${p.died == null ? 'present' : fmtYear(p.died)})`,
    p.tradition && `Tradition: ${p.tradition}${p.region ? `, ${p.region}` : ''}`,
    p.eraInfo && `Era: ${p.eraInfo.name}`,
    p.summary && `Summary: ${p.summary}`,
    p.ideas?.length && `Key ideas: ${p.ideas.join('; ')}`,
    p.works?.length && `Works: ${p.works.map((w) => `${w.title} (${fmtYear(w.year)})`).join('; ')}`,
    p.topics?.length && `Topics: ${p.topics.map((t) => t.name).join(', ')}`,
    p.influences?.length && `Influenced by: ${p.influences.map((i) => i.name).join(', ')}`,
    p.influenced?.length && `Influenced: ${p.influenced.slice(0, 12).map((i) => i.name).join(', ')}`,
  ].filter(Boolean).join('\n');
}

async function buildContext({ philosopherId, topicId, sepSlug, question = '' }) {
  const parts = [];
  const p = philosopherId ? getPhilosopher(philosopherId) : null;
  const t = topicId ? getTopic(topicId) : null;
  if (p) parts.push(philosopherFacts(p));
  if (t) parts.push(`# Topic: ${t.name}\n${t.summary}\nKey figures: ${t.philosophers.slice(0, 15).map((x) => x.name).join(', ')}`);
  const slug = sepSlug || p?.sep || t?.sep;
  parts.push(await sepContext(slug, question, p && t ? 4000 : 6000));
  if (p && t && t.sep && t.sep !== slug) parts.push(await sepContext(t.sep, question, 2500));
  return { context: parts.filter(Boolean).join('\n\n'), philosopher: p, topic: t };
}

export async function ask({ question, philosopherId, topicId, sepSlug, history = [], level = 'intermediate' }, onToken) {
  const { context } = await buildContext({ philosopherId, topicId, sepSlug, question });
  const messages = [
    { role: 'system', content: `${SYSTEM}\nPitch the explanation at a ${level} level.\n\nCONTEXT:\n${context}` },
    ...history.slice(-8).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 4000) })),
    { role: 'user', content: question },
  ];
  return chatStream(messages, { onToken });
}

export async function explainConnection({ philosopherId, targetType, targetId }, onToken) {
  const p = getPhilosopher(philosopherId);
  if (!p) throw Object.assign(new Error('Unknown philosopher'), { status: 404 });
  let task;
  let ctx;
  if (targetType === 'topic') {
    const t = getTopic(targetId, philosopherId);
    if (!t) throw Object.assign(new Error('Unknown topic'), { status: 404 });
    ({ context: ctx } = await buildContext({ philosopherId, topicId: targetId, question: t.name }));
    task = `Explain how "${t.name}" relates to ${p.name}'s philosophy. ${t.focus?.reason || ''}
Cover: (1) what the topic was at the time, (2) whether and how ${p.name} engaged with it or was shaped by it, (3) which thinkers carried it to them${t.focus?.via?.length ? ` (the dataset says: ${t.focus.via.map((v) => v.name).join(', ')})` : ''}, (4) one quotation-free example of the idea in their work.`;
  } else {
    const q = getPhilosopher(targetId);
    if (!q) throw Object.assign(new Error('Unknown philosopher'), { status: 404 });
    const direct = p.influences.find((i) => i.id === q.id);
    const reverse = p.influenced.find((i) => i.id === q.id);
    ({ context: ctx } = await buildContext({ philosopherId, question: q.name }));
    ctx += `\n\n${philosopherFacts(q)}\n${await sepContext(q.sep, p.name, 2500)}`;
    task = direct
      ? `Explain how ${q.name} influenced ${p.name}: which ideas were taken up, transformed or rejected, with concrete examples.`
      : reverse
        ? `Explain how ${p.name} influenced ${q.name}.`
        : `${q.name} and ${p.name} lived in overlapping times but ${q.name} is not recorded as a direct influence. Explain what each was doing, any points of contact or contrast, and why their projects differed.`;
  }
  return chatStream([
    { role: 'system', content: `${SYSTEM}\n\nCONTEXT:\n${ctx}` },
    { role: 'user', content: task },
  ], { onToken });
}

const QUIZ_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
          answerIndex: { type: 'integer', minimum: 0, maximum: 3 },
          explanation: { type: 'string' },
        },
        required: ['question', 'options', 'answerIndex', 'explanation'],
      },
    },
  },
  required: ['questions'],
};

export async function generateQuiz({ philosopherId, topicId, count = 5, difficulty = 'medium' }) {
  const { context, philosopher, topic } = await buildContext({ philosopherId, topicId, question: 'key ideas arguments central claims' });
  const subject = philosopher?.name || topic?.name || 'philosophy';
  const data = await chatJson([
    { role: 'system', content: 'You write accurate multiple-choice quiz questions for philosophy students, based only on the given context. Return JSON.' },
    { role: 'user', content: `CONTEXT:\n${context}\n\nWrite ${count} ${difficulty} multiple-choice questions about ${subject}. Each has exactly 4 options, one correct answer (answerIndex 0-3, vary its position), and a one or two sentence explanation. Test understanding of ideas and arguments, not just dates.` },
  ], QUIZ_SCHEMA);
  return (data.questions || [])
    .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length === 4 && q.answerIndex >= 0 && q.answerIndex < 4)
    .slice(0, count)
    .map((q) => ({ ...q, source: 'ai' }));
}

const ENRICH_SCHEMA = {
  type: 'object',
  properties: {
    born: { type: ['integer', 'null'] },
    died: { type: ['integer', 'null'] },
    region: { type: ['string', 'null'] },
    tradition: { type: ['string', 'null'] },
    summary: { type: 'string' },
    ideas: { type: 'array', items: { type: 'string' } },
    works: { type: 'array', items: { type: 'object', properties: { year: { type: ['integer', 'null'] }, title: { type: 'string' } }, required: ['title'] } },
    topics: { type: 'array', items: { type: 'string' } },
    influences: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, weight: { type: 'integer' } }, required: ['name'] } },
  },
  required: ['summary', 'ideas', 'topics', 'influences'],
};

// Use the model to extract a structured profile from the SEP entry of a philosopher
// that is not in the curated dataset. The result is cached and merged into the graph.
export async function enrich(id) {
  const raw = getRaw(id);
  if (!raw) throw Object.assign(new Error('Unknown philosopher'), { status: 404 });
  if (!raw.sep) throw Object.assign(new Error('No encyclopedia entry to learn from'), { status: 400 });
  const ctx = await sepContext(raw.sep, 'life works influences influenced major ideas', 9000);
  const topicList = TOPICS.map((t) => `${t.id} (${t.name})`).join(', ');
  const data = await chatJson([
    { role: 'system', content: 'You extract structured facts about philosophers from encyclopedia text. Use negative numbers for BCE years. Return JSON only.' },
    { role: 'user', content: `TEXT:\n${ctx}\n\nExtract a profile of ${raw.name}:
- born/died years (null if unknown)
- region and philosophical tradition (short labels)
- summary: two sentences for a learner
- ideas: 3 to 6 key ideas, short phrases
- works: main works with year
- topics: choose 2 to 6 ids ONLY from this list: ${topicList}
- influences: earlier philosophers who influenced ${raw.name}, with weight 1 (minor) to 3 (major)` },
  ], ENRICH_SCHEMA);

  const all = (await import('./knowledge.js')).listPhilosophers();
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();
  const findId = (name) => {
    const n = norm(name);
    if (!n) return null;
    return (all.find((p) => norm(p.name) === n) || all.find((p) => norm(p.name).split(' ').pop() === n.split(' ').pop() && n.split(' ').pop().length > 3))?.id || null;
  };
  const record = {
    id,
    generatedAt: new Date().toISOString(),
    born: Number.isInteger(data.born) ? data.born : null,
    died: Number.isInteger(data.died) ? data.died : null,
    region: data.region || null,
    tradition: data.tradition || null,
    summary: data.summary || '',
    ideas: (data.ideas || []).slice(0, 8),
    works: (data.works || []).slice(0, 12).map((w) => ({ year: Number.isInteger(w.year) ? w.year : null, title: w.title })),
    topics: (data.topics || []).filter((t) => TOPICS.some((x) => x.id === t)),
    influences: (data.influences || [])
      .map((i) => ({ id: findId(i.name || ''), name: i.name, weight: Math.min(3, Math.max(1, i.weight || 2)) }))
      .filter((i) => i.id && i.id !== id),
  };
  await writeJsonCache('enriched', id, record);
  reload();
  return record;
}
