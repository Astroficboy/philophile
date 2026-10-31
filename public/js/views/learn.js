import { esc, progress } from '../util.js';
import { mountChat } from '../components/chat.js';
import { mountQuiz } from '../components/quiz.js';

export async function render(root, _params, query) {
  const prog = progress.read();
  const visited = Object.entries(prog.visited).sort((a, b) => b[1].at - a[1].at);
  const quizzes = prog.quizzes;
  const avg = quizzes.length ? Math.round((quizzes.reduce((s, q) => s + q.correct / q.total, 0) / quizzes.length) * 100) : null;

  root.innerHTML = `
    <h1>Learn</h1>
    <div class="two-col">
      <div class="stack">
        <section class="card">
          <h2>Ask the tutor anything</h2>
          ${query.sep ? `<p class="muted small">Grounded in the encyclopedia entry <a href="#/sep/${esc(query.sep)}">${esc(query.sep)}</a>.</p>` : ''}
          <div id="chat"></div>
        </section>
        <section class="card">
          <h2>Mixed quiz</h2>
          <p class="muted small">Questions about philosophers from every era. For focused quizzes, open a philosopher or topic and use its Quiz tab.</p>
          <div id="quiz"></div>
        </section>
      </div>
      <aside class="stack">
        <section class="card">
          <h3>Your progress</h3>
          <p><span class="score">${visited.length}</span> philosophers explored<br>
          <span class="score">${quizzes.length}</span> quizzes taken${avg != null ? ` · average ${avg}%` : ''}</p>
          ${avg != null ? `<div class="progress-bar"><i style="width:${avg}%"></i></div>` : ''}
        </section>
        <section class="card"><h3>Recently explored</h3>
          ${visited.length ? `<ul class="people-list">${visited.slice(0, 12).map(([id, v]) => `<li><a href="#/philosopher/${encodeURIComponent(id)}">${esc(v.name)}</a><span class="muted small">${v.count}×</span></li>`).join('')}</ul>` : '<p class="muted small">Nothing yet. <a href="#/philosophers">Start browsing</a>.</p>'}
        </section>
        <section class="card"><h3>Quiz history</h3>
          ${quizzes.length ? `<ul class="people-list">${quizzes.slice(0, 12).map((q) => `<li><span>${esc(q.subject || 'Mixed')}</span><span class="muted small">${q.correct}/${q.total}</span></li>`).join('')}</ul>` : '<p class="muted small">No quizzes yet.</p>'}
          ${quizzes.length ? '<button class="btn small" type="button" data-clear>Clear progress</button>' : ''}
        </section>
      </aside>
    </div>`;

  mountChat(root.querySelector('#chat'), {
    sepSlug: query.sep,
    subject: query.sep ? 'this entry' : 'philosophy',
    initialQuestion: query.q,
    suggestions: query.sep ? ['Summarise this entry', 'What is the central debate here?', 'Explain the key terms'] : [
      'What is the difference between rationalism and empiricism?',
      'Explain the trolley problem',
      'What did Kant mean by the categorical imperative?',
      'How did Buddhism and Stoicism treat suffering differently?',
      'Where should a beginner start in philosophy?',
    ],
  });
  mountQuiz(root.querySelector('#quiz'), { title: 'Mixed' });
  root.querySelector('[data-clear]')?.addEventListener('click', () => {
    if (confirm('Clear your saved progress in this browser?')) { progress.write({ visited: {}, quizzes: [] }); render(root, _params, query); }
  });
}
