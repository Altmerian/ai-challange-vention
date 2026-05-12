// Renders one Quiz question into the Telegram HTML body + a 4-row inline
// keyboard (one button per row: A, B, C, D). Every dynamic field is routed
// through `htmlEscape` per the PRD's HTML rendering contract; static markup
// (the `<b>` tags, newlines, emojis) is interpolated as-is.
//
// Inputs:
//   - question:  { id, question, options: [{ key, text }×4], ... } from the
//                Examiner output (already parsed by examinerOutputParser).
//   - quizId:    8-char base36 id minted by `shortIdMinter`.
//   - qIdx:      0-based index of this question in its Quiz (0..4).
//
// Output:
//   {
//     html: string,              // Telegram message body (parse_mode: HTML)
//     replyMarkup: {             // Raw Telegram Bot API inline_keyboard
//       inline_keyboard: [
//         [{ text: "A) <option text>", callback_data: "qa:<quizId>:<qIdx>:A" }],
//         ...3 more rows...
//       ]
//     }
//   }
//
// PRD § Callback data conventions: `qa:{quizId}:{qIdx}:{choice}`. The 64-byte
// callback_data limit is checked by `callbackCodec.encode`.
//
// PRD § User Stories #18: exactly four MCQ options stacked one per row.
// Inline-button text fields are NOT HTML (Telegram renders them as plain
// UTF-8 strings via the button widget) — do not HTML-escape, but DO truncate
// for mobile readability.

import { htmlEscape } from './htmlEscape.js';
import { encode } from './callbackCodec.js';

// 80 chars keeps mobile button labels readable; Telegram itself caps at 64
// bytes of callback_data but allows much longer button text. We slice on the
// raw input (pre-escape) so we never split a future "&amp;" sequence (the
// renderer's body uses escaped output, but button labels stay raw).
const BUTTON_LABEL_MAX = 80;

function truncateLabel(s) {
  const str = s == null ? '' : String(s);
  if (str.length <= BUTTON_LABEL_MAX) return str;
  // Reserve 1 char for the ellipsis so the visible length stays <= MAX.
  return str.slice(0, BUTTON_LABEL_MAX - 1) + '…';
}

export function render({ question, quizId, qIdx }) {
  if (!question || typeof question !== 'object') {
    throw new Error('quizQuestionRenderer: question is required');
  }
  if (typeof quizId !== 'string' || quizId.length === 0) {
    throw new Error('quizQuestionRenderer: quizId is required');
  }
  if (!Number.isInteger(qIdx) || qIdx < 0) {
    throw new Error('quizQuestionRenderer: qIdx must be a non-negative integer');
  }
  if (!Array.isArray(question.options) || question.options.length !== 4) {
    throw new Error('quizQuestionRenderer: question.options must have exactly 4 entries');
  }

  const header = `<b>Question ${qIdx + 1} of 5</b>`;
  const stem = htmlEscape(question.question);
  const optionLines = question.options
    .map((opt) => `<b>${htmlEscape(opt.key)})</b> ${htmlEscape(opt.text)}`)
    .join('\n');
  const html = `${header}\n\n${stem}\n\n${optionLines}`;

  const inline_keyboard = question.options.map((opt) => [
    {
      // Plain-text button label, not HTML — see PRD § HTML rendering contract.
      text: truncateLabel(`${opt.key}) ${opt.text}`),
      callback_data: encode('qa', { quizId, qIdx, choice: opt.key }),
    },
  ]);

  return { html, replyMarkup: { inline_keyboard } };
}

export default render;
