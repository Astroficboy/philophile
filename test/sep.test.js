import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLifespan, parseContents, parseEntry, looksLikePersonLabel, displayNameFromLabel } from '../server/lib/sep.js';
import { firstSentences } from '../server/lib/sep-sync.js';

test('parseLifespan handles common SEP date formats', () => {
  assert.deepEqual(parseLifespan('Immanuel Kant (1724–1804) is the central figure'), { born: 1724, died: 1804, approximate: false });
  assert.deepEqual(parseLifespan('Plato (429?–347 B.C.E.) is'), { born: -429, died: -347, approximate: true });
  assert.deepEqual(parseLifespan('Pythagoras (c. 570 – c. 495 BCE)'), { born: -570, died: -495, approximate: true });
  assert.deepEqual(parseLifespan('Augustine (354–430 C.E.)'), { born: 354, died: 430, approximate: false });
  assert.deepEqual(parseLifespan('Jürgen Habermas (b. 1929)'), { born: 1929, died: null, approximate: false });
  assert.equal(parseLifespan('see pp. (12–15) of the book'), null);
  assert.equal(parseLifespan(''), null);
});

test('person labels are told apart from topic labels', () => {
  assert.ok(looksLikePersonLabel('Kant, Immanuel'));
  assert.ok(looksLikePersonLabel('Aristotle'));
  assert.ok(!looksLikePersonLabel('abduction'));
  assert.ok(!looksLikePersonLabel('Kant, Immanuel: aesthetics and teleology'));
  assert.ok(!looksLikePersonLabel('Arabic and Islamic Philosophy'));
  assert.ok(!looksLikePersonLabel('Buddhism'));
  assert.equal(displayNameFromLabel('Wittgenstein, Ludwig'), 'Ludwig Wittgenstein');
});

test('parseContents finds entries and skips cross-references', () => {
  const html = `<ul>
    <li><a href="entries/abduction/">abduction</a></li>
    <li><a href="entries/kant/"><strong>Kant, Immanuel</strong></a></li>
    <li>abstract objects — see <a href="entries/abstract-objects/">objects: abstract</a></li>
    <li><a href="entries/kant/">Kant, Immanuel</a> (duplicate)</li>
  </ul>`;
  const rows = parseContents(html);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.find((r) => r.slug === 'kant'), { slug: 'kant', label: 'Kant, Immanuel', isPersonCandidate: true });
  assert.equal(rows.find((r) => r.slug === 'abduction').isPersonCandidate, false);
});

test('parseEntry extracts sections and rewrites links safely', () => {
  const html = `<div id="aueditable"><h1>Immanuel Kant</h1><div id="pubinfo">First published 2010</div>
    <div id="preamble"><p>Immanuel Kant (1724–1804). See <a href="../hume/">Hume</a>.</p><script>alert(1)</script></div>
    <div id="main-text"><h2><a id="Life">1. Life</a></h2><p onclick="evil()">Text <a href="javascript:alert(1)">x</a> <a href="#Life">up</a></p>
    <h3><a name="Early">1.1 Early</a></h3><p>More</p></div>
    <div id="related-entries"><p><a href="../hume/">Hume, David</a></p></div></div>`;
  const e = parseEntry(html, 'kant');
  assert.equal(e.title, 'Immanuel Kant');
  assert.deepEqual(e.lifespan, { born: 1724, died: 1804, approximate: false });
  assert.deepEqual(e.sections.map((s) => [s.id, s.level]), [['Life', 2], ['Early', 3]]);
  assert.match(e.preamble, /href="#\/sep\/hume"/);
  assert.doesNotMatch(e.preamble, /script/);
  assert.doesNotMatch(e.sections[0].html, /onclick|javascript:/);
  assert.match(e.sections[0].html, /data-anchor="Life"/);
  assert.deepEqual(e.related, [{ slug: 'hume', title: 'Hume, David' }]);
});

test('firstSentences does not split on abbreviations', () => {
  assert.equal(firstSentences('Plato (429?–347 B.C.E.) is a writer. He was born. More.', 1), 'Plato (429?–347 B.C.E.) is a writer.');
  assert.equal(firstSentences('Locke (b. 1632, d. 1704) wrote. Then.', 1), 'Locke (b. 1632, d. 1704) wrote.');
});
