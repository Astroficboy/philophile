// Offline quiz questions built from the knowledge graph, used when Ollama is not running.
import { listPhilosophers, getPhilosopher, getTopic } from './knowledge.js';
import { ERAS } from '../data/eras.js';

function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mcq(question, correct, distractors, explanation) {
  const pool = [...new Set(distractors.filter((d) => d && d !== correct))];
  if (pool.length < 3) return null;
  const options = shuffle([correct, ...shuffle(pool).slice(0, 3)]);
  return { question, options, answerIndex: options.indexOf(correct), explanation, source: 'offline' };
}

export function offlineQuiz({ philosopherId, topicId, count = 5 }) {
  const all = listPhilosophers().filter((p) => p.source === 'curated');
  const names = all.map((p) => p.name);
  const qs = [];

  if (philosopherId) {
    const p = getPhilosopher(philosopherId);
    if (!p) return [];
    const others = all.filter((x) => x.id !== p.id);
    const nearby = others.filter((x) => Math.abs((x.born ?? 0) - (p.born ?? 0)) < 400);
    for (const w of p.works.slice(0, 3)) {
      qs.push(mcq(`Who wrote “${w.title}”?`, p.name, shuffle(nearby).map((x) => x.name), `${w.title} is by ${p.name}${w.year != null ? ` (${fmt(w.year)})` : ''}.`));
    }
    for (const idea of p.ideas.slice(0, 3)) {
      qs.push(mcq(`Which philosopher is best known for: “${idea}”?`, p.name, shuffle(nearby).map((x) => x.name), `“${idea}” is a key idea of ${p.name}.`));
    }
    const top = p.influences[0];
    if (top) {
      const notInfl = shuffle(others.filter((x) => !p.influences.some((i) => i.id === x.id) && (x.born ?? 0) < (p.born ?? 0))).map((x) => x.name);
      qs.push(mcq(`Which of these thinkers most strongly influenced ${p.name}?`, top.name, notInfl, `${top.name} was a major influence on ${p.name}.`));
    }
    if (p.eraInfo) {
      qs.push(mcq(`In which era did ${p.name} do their main work?`, p.eraInfo.name, ERAS.map((e) => e.name), `${p.name} belongs to the ${p.eraInfo.name} (${fmt(p.eraInfo.start)}–${fmt(p.eraInfo.end)}).`));
    }
    if (p.influenced.length) {
      const follower = p.influenced[0];
      qs.push(mcq(`Which later philosopher was influenced by ${p.name}?`, follower.name, shuffle(others.filter((x) => (x.born ?? 0) < (p.born ?? 0))).map((x) => x.name), `${follower.name} drew on ${p.name}.`));
    }
  } else if (topicId) {
    const t = getTopic(topicId);
    if (!t) return [];
    const inTopic = new Set(t.philosophers.map((p) => p.id));
    for (const p of shuffle(t.philosophers).slice(0, count)) {
      qs.push(mcq(`Which of these philosophers is associated with ${t.name}?`, p.name, shuffle(all.filter((x) => !inTopic.has(x.id))).map((x) => x.name), `${p.name}: ${p.summary}`));
    }
  } else {
    for (const p of shuffle(all).slice(0, count * 2)) {
      if (!p.summary) continue;
      qs.push(mcq(`Who is this? “${p.summary}”`, p.name, shuffle(names), `This describes ${p.name}.`));
    }
  }
  return shuffle(qs.filter(Boolean)).slice(0, count);
}

function fmt(y) {
  return y < 0 ? `${-y} BCE` : String(y);
}
