// Renders the per-question feedback message sent after a User taps an answer
// button. Per PRD § UX: short ✅ / ❌ banner + the *targeted*
// `perOptionExplanation` for the option the User picked (NOT a generic blurb
// about the correct answer — see ADR-0001).
//
// Inputs:
//   - question: the question object the User answered (already validated by
//               examinerOutputParser; has `correctAnswer`, `options`,
//               `perOptionExplanation`, `question`).
//   - picked:   one of "A" | "B" | "C" | "D".
//   - qIdx:     0-based question index (0..4). Used only in the header line.
//
// Output: { html } — Telegram HTML body (no inline keyboard; the bot removes
// the previous question's keyboard separately via editMessageReplyMarkup,
// and the next question is sent as a fresh message via quizQuestionRenderer).

import { htmlEscape } from './htmlEscape.js';

const VALID_CHOICES = new Set(['A', 'B', 'C', 'D']);

export function render({ question, picked, qIdx }) {
  if (!question || typeof question !== 'object') {
    throw new Error('quizFeedbackRenderer: question is required');
  }
  if (!VALID_CHOICES.has(picked)) {
    throw new Error('quizFeedbackRenderer: picked must be one of A|B|C|D');
  }
  if (!Number.isInteger(qIdx) || qIdx < 0) {
    throw new Error('quizFeedbackRenderer: qIdx must be a non-negative integer');
  }
  const explain = question.perOptionExplanation || {};
  if (typeof explain[picked] !== 'string') {
    throw new Error(`quizFeedbackRenderer: missing perOptionExplanation.${picked}`);
  }

  const isCorrect = picked === question.correctAnswer;
  const banner = isCorrect
    ? `✅ <b>Correct!</b>`
    : `❌ <b>Not quite.</b> The correct answer was <b>${htmlEscape(question.correctAnswer)}</b>.`;

  // The targeted rationale for the picked option (ADR-0001).
  const rationale = htmlEscape(explain[picked]);
  const headerLine = `<i>Question ${qIdx + 1} of 5</i>`;

  const html = `${headerLine}\n${banner}\n\n${rationale}`;
  return { html };
}

export default render;
