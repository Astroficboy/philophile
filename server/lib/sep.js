// Client for the Stanford Encyclopedia of Philosophy (plato.stanford.edu).
// Pages are fetched on demand, cached on disk, and parsed into clean sections.
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { readCache, writeCache } from './cache.js';

const DAY = 24 * 60 * 60 * 1000;
const USER_AGENT = 'Philophile/0.1 (philosophy learning app; personal use)';

export async function fetchSepPage(pathname, { force = false } = {}) {
  const key = pathname.replace(/^\/+/, '') || 'index';
  if (!force) {
    const cached = await readCache('sep', `${key}.html`, config.sep.cacheDays * DAY);
    if (cached) return cached;
  }
  const url = new URL(pathname, config.sep.base).toString();
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    const err = new Error(`SEP request failed: ${res.status} ${url}`);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  const html = await res.text();
  await writeCache('sep', `${key}.html`, html);
  return html;
}

export function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]*(\/[a-z0-9-]+)?$/i.test(slug);
}

export async function getEntry(slug, opts) {
  if (!isValidSlug(slug)) {
    const err = new Error('Invalid SEP slug');
    err.status = 400;
    throw err;
  }
  const html = await fetchSepPage(`/entries/${slug}/`, opts);
  return parseEntry(html, slug);
}

export async function getContents(opts) {
  const html = await fetchSepPage('/contents.html', opts);
  return parseContents(html);
}

// ---------------------------------------------------------------------------
// Parsing

// Parse an entry page into { slug, title, pubinfo, preamble, toc, sections, related, lifespan }.
export function parseEntry(html, slug) {
  const $ = cheerio.load(html);
  const root = $('#aueditable').length ? $('#aueditable') : $('body');
  sanitize($, root, slug);

  const title = clean(root.find('h1').first().text()) || slug;
  const pubinfo = clean(root.find('#pubinfo').text());
  const preambleEl = root.find('#preamble');
  const preamble = preambleEl.html()?.trim() || '';
  const preambleText = clean(preambleEl.text());

  const sections = [];
  const main = root.find('#main-text');
  let current = null;
  main.children().each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    if (tag === 'h2' || tag === 'h3') {
      const $el = $(el);
      const anchor = $el.find('a[id], a[name]').first();
      const id = anchor.attr('id') || anchor.attr('name') || `s${sections.length + 1}`;
      current = { id, level: tag === 'h2' ? 2 : 3, title: clean($el.text()), html: '' };
      sections.push(current);
    } else {
      if (!current) {
        current = { id: 'intro', level: 2, title: 'Introduction', html: '' };
        sections.push(current);
      }
      current.html += $.html(el);
    }
  });

  const related = [];
  root.find('#related-entries a[href]').each((_, a) => {
    const target = $(a).attr('data-sep-slug');
    if (target) related.push({ slug: target, title: clean($(a).text()) });
  });

  const bibliography = root.find('#bibliography').html()?.trim() || '';

  return {
    slug,
    url: `${config.sep.base}/entries/${slug}/`,
    title,
    pubinfo,
    preamble,
    preambleText,
    lifespan: parseLifespan(preambleText.slice(0, 600)),
    sections,
    related,
    bibliography,
  };
}

// Rewrite links so that in-encyclopedia links stay inside the app, and strip anything active.
function sanitize($, root, slug) {
  root.find('script, style, iframe, object, embed, form, noscript').remove();
  root.find('*').each((_, el) => {
    for (const name of Object.keys(el.attribs || {})) {
      if (/^on/i.test(name) || name === 'style') $(el).removeAttr(name);
    }
  });
  root.find('a[href]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href');
    let url;
    try {
      url = new URL(href, `${config.sep.base}/entries/${slug}/`);
    } catch {
      $a.removeAttr('href');
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      $a.removeAttr('href');
      return;
    }
    const m = url.hostname === new URL(config.sep.base).hostname && url.pathname.match(/^\/entries\/([^/]+)\/?(.*)$/);
    if (m && m[1] === slug && !m[2] && url.hash) {
      $a.attr('href', url.hash);
      $a.attr('data-anchor', url.hash.slice(1));
    } else if (m && (!m[2] || m[2] === 'index.html')) {
      $a.attr('href', `#/sep/${m[1]}${url.hash ? `?section=${encodeURIComponent(url.hash.slice(1))}` : ''}`);
      $a.attr('data-sep-slug', m[1]);
    } else {
      $a.attr('href', url.toString());
      $a.attr('target', '_blank');
      $a.attr('rel', 'noopener');
    }
  });
  root.find('img[src]').each((_, img) => {
    const $img = $(img);
    try {
      $img.attr('src', new URL($img.attr('src'), `${config.sep.base}/entries/${slug}/`).toString());
    } catch {
      $img.remove();
    }
  });
}

// Parse the SEP table of contents into a list of { slug, label, isPersonCandidate }.
// Person entries are listed as "Surname, Given" or a single capitalised name, while
// topic entries are lowercase; sub-entries use a colon ("Kant, Immanuel: aesthetics").
export function parseContents(html) {
  const $ = cheerio.load(html);
  const seen = new Map();
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/(?:^|\/)entries\/([a-z0-9-]+)\/?$/i);
    if (!m) return;
    const slug = m[1].toLowerCase();
    const label = clean($(a).text());
    if (!label) return;
    // An entry can be linked several times ("see also" lines); keep the first, most direct label.
    if (seen.has(slug)) return;
    // Skip cross-reference lines such as "abstract objects — see objects: abstract".
    const parentText = clean($(a).parent().text());
    const isSeeAlso = /\bsee\b/i.test(parentText.split(label)[0] || '');
    seen.set(slug, { slug, label, isPersonCandidate: !isSeeAlso && looksLikePersonLabel(label) });
  });
  return [...seen.values()];
}

const TOPIC_WORDS = /\b(philosophy|philosophical|theory|theories|logic|ethics|school|tradition|thought|movement|ism|problem|and|of|the|in|on)\b/i;

export function looksLikePersonLabel(label) {
  if (!label || label.includes(':')) return false;
  if (!/^[A-ZÀ-ɏḀ-ỿ]/.test(label)) return false;
  if (/^[A-Z][a-z]+ism$/.test(label)) return false;
  const [head, given] = label.split(',').map((s) => s.trim());
  if (given !== undefined) {
    // "Kant, Immanuel" or "Pseudo-Dionysius the Areopagite, ..." — reject topical heads.
    return !/\b(philosophy|theory|logic|ethics|school|tradition)\b/i.test(head) && /^[A-ZÀ-ɏḀ-ỿ(]/.test(given);
  }
  // Single capitalised names such as "Aristotle", "Confucius", "Plotinus".
  return !TOPIC_WORDS.test(label) && label.split(/\s+/).length <= 4;
}

// "Kant, Immanuel" -> "Immanuel Kant"; "Aristotle" -> "Aristotle"
export function displayNameFromLabel(label) {
  const parts = label.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 2 && !/\[|\(/.test(parts[1])) return `${parts[1]} ${parts[0]}`;
  return label;
}

// Find the birth/death years in text such as "Immanuel Kant (1724–1804)",
// "Plato (429?–347 B.C.E.)", "(c. 570 – c. 495 BCE)", "(b. 1929)" or "(d. 1274)".
const APPROX = /(?:^|[\s(\u2013\u2014-])(?:c|ca)\.\s*\d|\?|circa|fl\./i;

export function parseLifespan(text) {
  if (!text) return null;
  const BCE = /\b(?:B\.?\s?C\.?\s?E?\.?|BCE)/i;
  const re = /\(([^()]{3,90})\)/g;
  let m;
  while ((m = re.exec(text))) {
    const inner = m[1];
    if (/^\s*b\.\s*/i.test(inner)) {
      const y = inner.match(/(\d{3,4})/);
      if (y) return { born: Number(y[1]) * (BCE.test(inner) ? -1 : 1), died: null, approximate: APPROX.test(inner) };
    }
    const range = inner.match(/(\d{1,4})\s*(B\.?\s?C\.?\s?E?\.?|BCE|C\.?E\.?|A\.?D\.?)?[^\d]{0,12}?[–—\-]+[^\d]{0,12}?(\d{1,4})\s*(B\.?\s?C\.?\s?E?\.?|BCE|C\.?E\.?|A\.?D\.?)?/i);
    if (range) {
      let born = Number(range[1]);
      let died = Number(range[3]);
      const bornBce = range[2] && BCE.test(range[2]);
      const diedBce = range[4] && BCE.test(range[4]);
      if (diedBce) {
        died = -died;
        if (!(range[2] && !bornBce)) born = -born;
      } else if (bornBce) {
        born = -born;
      }
      // Reject spans that cannot be a human life (e.g. page ranges or unrelated numbers).
      const span = died - born;
      if (span > 10 && span < 120) {
        return { born, died, approximate: APPROX.test(inner) };
      }
    }
  }
  return null;
}

function clean(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}
