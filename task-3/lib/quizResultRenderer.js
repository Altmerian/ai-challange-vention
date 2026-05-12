// Renders the final results card sent after the User answers Q5. Per PRD
// § UX: score percentage + per-question breakdown showing each question's
// correct answer + the explanation the User saw (or would have seen).
//
// Inputs:
//   - questions: the 5-question array stored on the Quiz row (each item the
//                same shape examinerOutputParser emits).
//   - answers:   the 5-element array of `{ q_id, picked, is_correct }` from
//                the completed Quiz row. Order is Q1..Q5.
//
// Output: { html } — Telegram HTML body, no keyboard.
//
// PRD § HTML rendering contract: every dynamic field (question text, picked
// explanation text, correct-answer letter) routes through `htmlEscape`.

import { htmlEscape } from './htmlEscape.js';

const VALID_CHOICES = new Set(['A', 'B', 'C', 'D']);

function scorePercent(correctCount, total) {
  if (total <= 0) return 0;
  return Math.round((correctCount / total) * 100);
}

export function render({ questions, answers }) {
  if (!Array.isArray(questions) || questions.length !== 5) {
    throw new Error('quizResultRenderer: questions must be an array of 5');
  }
  if (!Array.isArray(answers) || answers.length !== 5) {
    throw new Error('quizResultRenderer: answers must be an array of 5');
  }

  const correctCount = answers.reduce((n, a) => n + (a && a.is_correct ? 1 : 0), 0);
  const pct = scorePercent(correctCount, 5);

  const header = `<b>🏁 Quiz complete — ${correctCount}/5 (${pct}%)</b>`;

  const breakdown = questions
    .map((q, i) => {
      const a = answers[i] || {};
      const picked = VALID_CHOICES.has(a.picked) ? a.picked : '?';
      const isCorrect = !!a.is_correct;
      const mark = isCorrect ? '✅' : '❌';
      const explanation = (q.perOptionExplanation && q.perOptionExplanation[picked]) || '';
      const questionLine = `<b>Q${i + 1}.</b> ${htmlEscape(q.question)}`;
      const verdictLine = isCorrect
        ? `${mark} Your answer: <b>${htmlEscape(picked)}</b>`
        : `${mark} Your answer: <b>${htmlEscape(picked)}</b> — Correct: <b>${htmlEscape(q.correctAnswer)}</b>`;
      const explainLine = explanation ? `<i>${htmlEscape(explanation)}</i>` : '';
      // Blank lines between questions for readability.
      return [questionLine, verdictLine, explainLine].filter((x) => x.length > 0).join('\n');
    })
    .join('\n\n');

  const html = `${header}\n\n${breakdown}`;
  return { html };
}

export default render;
