import { api } from '../api.js';
import { esc } from '../util.js';
import { aiStatus, offlineNotice, streamInto } from './ai.js';

// A tutor conversation grounded in a philosopher, topic or encyclopedia entry.
export async function mountChat(container, { philosopherId, topicId, sepSlug, subject, suggestions = [], initialQuestion } = {}) {
  const history = [];
  const status = await aiStatus();
  container.innerHTML = `
    <div class="chat">
      ${status.model ? `<div class="muted small">Tutor: <strong>${esc(status.model)}</strong> via Ollama, grounded in the Stanford Encyclopedia entry for ${esc(subject || 'this subject')}.</div>` : offlineNotice(status)}
      <div class="suggestions">${suggestions.map((s) => `<button type="button">${esc(s)}</button>`).join('')}</div>
      <div class="chat-log" aria-live="polite"></div>
      <form class="chat-form">
        <textarea name="q" rows="2" placeholder="Ask about ${esc(subject || 'philosophy')}…" ${status.model ? '' : 'disabled'}></textarea>
        <div class="stack" style="display:flex;flex-direction:column;gap:.4rem">
          <button class="btn primary" type="submit" ${status.model ? '' : 'disabled'}>Ask</button>
          <select name="level" title="Level" aria-label="Explanation level">
            <option value="beginner">Beginner</option><option value="intermediate" selected>Intermediate</option><option value="advanced">Advanced</option>
          </select>
        </div>
      </form>
    </div>`;
  const log = container.querySelector('.chat-log');
  const form = container.querySelector('form');
  const textarea = form.q;
  let busy = false;

  async function send(question) {
    if (busy || !question.trim() || !status.model) return;
    busy = true;
    form.querySelector('button').disabled = true;
    log.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(question)}</div>`);
    const out = document.createElement('div');
    out.className = 'msg assistant';
    log.appendChild(out);
    log.scrollTop = log.scrollHeight;
    const answer = await streamInto(out, (onToken) =>
      api.ask({ question, philosopherId, topicId, sepSlug, history, level: form.level.value }, (t, full) => { onToken(t, full); log.scrollTop = log.scrollHeight; }));
    history.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
    busy = false;
    form.querySelector('button').disabled = false;
    textarea.focus();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = textarea.value;
    textarea.value = '';
    send(q);
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  container.querySelector('.suggestions').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') send(e.target.textContent);
  });
  if (initialQuestion) send(initialQuestion);
  return { send };
}
