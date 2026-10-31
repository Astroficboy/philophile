import { api } from '../api.js';
import { esc, markdown } from '../util.js';

let statusPromise;
export function aiStatus(refresh = false) {
  if (refresh || !statusPromise) statusPromise = api.aiStatus(refresh).catch((e) => ({ available: false, error: e.message }));
  return statusPromise;
}

export function offlineNotice(status) {
  return `<div class="notice small">The local AI tutor is offline: ${esc(status.error || 'unknown error')}.
    See <a href="#/settings">Settings</a> for setup. Encyclopedia reading, maps and offline quizzes still work.</div>`;
}

// Render a streamed tutor answer into `el` as Markdown, with a blinking cursor while it arrives.
export async function streamInto(el, start) {
  el.classList.add('ai-output', 'cursor');
  el.innerHTML = '<span class="muted small">Thinking…</span>';
  let frame = 0;
  try {
    const full = await start((_t, text) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { el.innerHTML = markdown(text); });
    });
    cancelAnimationFrame(frame);
    el.innerHTML = markdown(full) || '<p class="muted">No answer.</p>';
    return full;
  } catch (err) {
    el.innerHTML = `<div class="error small">${esc(err.message)}</div>`;
    return '';
  } finally {
    el.classList.remove('cursor');
  }
}
