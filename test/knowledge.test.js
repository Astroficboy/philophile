import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURATED_PHILOSOPHERS } from '../server/data/philosophers/index.js';
import { TOPICS } from '../server/data/topics.js';
import { ERAS, EVENTS, eraForYear } from '../server/data/eras.js';
import * as kb from '../server/lib/knowledge.js';
import { offlineQuiz } from '../server/lib/quiz.js';
import { pickModel } from '../server/lib/ollama.js';

test('curated dataset is internally consistent', () => {
  const ids = new Set(CURATED_PHILOSOPHERS.map((p) => p.id));
  const topicIds = new Set(TOPICS.map((t) => t.id));
  assert.equal(ids.size, CURATED_PHILOSOPHERS.length, 'philosopher ids are unique');
  for (const p of CURATED_PHILOSOPHERS) {
    assert.ok(p.born == null || p.died == null || p.born < p.died, `${p.id} dates`);
    for (const t of p.topics) assert.ok(topicIds.has(t), `${p.id} has unknown topic ${t}`);
    for (const i of p.influences) {
      assert.ok(ids.has(i.id), `${p.id} has unknown influence ${i.id}`);
      assert.ok(i.weight >= 1 && i.weight <= 3, `${p.id} weight`);
      const q = CURATED_PHILOSOPHERS.find((x) => x.id === i.id);
      assert.ok(q.born < (p.died ?? 3000), `${q.id} cannot influence ${p.id} after their death`);
    }
  }
});

test('eras are contiguous and events sorted into them', () => {
  for (let i = 1; i < ERAS.length; i++) assert.equal(ERAS[i].start, ERAS[i - 1].end);
  assert.equal(eraForYear(1781).id, 'enlightenment');
  assert.equal(eraForYear(-399).id, 'classical');
  assert.ok(EVENTS.every((e) => Number.isInteger(e.year) && e.title));
});

test('influences are mirrored as "influenced"', () => {
  const plato = kb.getPhilosopher('plato');
  assert.ok(plato.influenced.some((p) => p.id === 'aristotle'));
  assert.ok(plato.influences.some((p) => p.id === 'socrates' && p.weight === 3));
});

test('era map colours direct influences red and contemporaries separately', () => {
  const m = kb.eraMap('kant');
  const byId = new Map(m.items.map((i) => [i.id, i]));
  assert.equal(byId.get('hume').relation, 'influence');
  assert.equal(byId.get('hume').heat, 1);
  assert.equal(byId.get('voltaire').relation, 'contemporary');
  assert.equal(byId.get('voltaire').heat, 0);
  assert.equal(byId.get('hegel').relation, 'influenced');
  assert.ok(byId.get('transcendental-idealism').heat > 0.9);
  const confucianism = byId.get('confucianism');
  assert.equal(confucianism.relation, 'contemporary', 'an active topic that did not shape Kant');
  assert.ok(m.items.some((i) => i.type === 'event' && i.year === 1789));
  // Items are sorted hottest first.
  for (let i = 1; i < m.items.length; i++) assert.ok(m.items[i - 1].heat >= m.items[i].heat);
});

test('topic view explains the relation to a focus philosopher', () => {
  const t = kb.getTopic('empiricism', 'kant');
  assert.ok(t.philosophers.some((p) => p.id === 'locke'));
  assert.equal(t.focus.engaged, false);
  assert.ok(t.focus.via.some((v) => v.id === 'hume'));
});

test('personal timeline includes works, lanes and events', () => {
  const t = kb.personalTimeline('kant');
  assert.ok(t.milestones.some((m) => m.title === 'Critique of Pure Reason' && m.year === 1781));
  assert.ok(t.lanes.some((l) => l.id === 'hume' && l.relation === 'influence'));
  assert.ok(t.events.some((e) => e.year === 1776));
});

test('offline quiz produces well-formed questions', () => {
  for (const args of [{ philosopherId: 'kant' }, { topicId: 'stoicism' }, {}]) {
    const qs = offlineQuiz({ ...args, count: 4 });
    assert.ok(qs.length > 0);
    for (const q of qs) {
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options).size, 4);
      assert.ok(q.answerIndex >= 0 && q.answerIndex < 4);
    }
  }
});

test('pickModel falls back to the closest installed tag', () => {
  assert.equal(pickModel('gemma4:12', ['llama3:8b', 'gemma4:12b']), 'gemma4:12b');
  assert.equal(pickModel('gemma4:12b', ['gemma4:latest']), 'gemma4:latest');
  assert.equal(pickModel('gemma4:12b', ['llama3']), null);
});
