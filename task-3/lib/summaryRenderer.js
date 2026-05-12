// Renders a Teacher-produced Summary into the Telegram HTML body + inline
// keyboard sent back to the user after `/learn`. Every dynamic field is
// routed through `htmlEscape` per the PRD's HTML rendering contract;
// static markup (the `<b>` tags, newlines, emojis) is interpolated as-is.
//
// Inputs:
//   - summary: { title, mainConcepts[], keyPoints[], difficulty }
//   - shortId: 8-char base36 minted by `shortIdMinter`
//
// Output:
//   {
//     html: string,                    // Telegram message body (parse_mode: HTML)
//     replyMarkup: {                   // n8n Telegram node "Reply Markup" JSON
//       inline_keyboard: [[{ text: "🧠 Quiz me now", callback_data: "qstart:<id>" }]]
//     }
//   }
//
// The `replyMarkup` shape is the raw Telegram Bot API shape — the n8n
// Telegram node's `additionalFields.replyMarkup` accepts it as a JSON string
// or object (see the workflow JSON).
import { htmlEscape } from './htmlEscape.js';

const DIFFICULTY_BADGES = {
  beginner: '🟢',
  intermediate: '🟡',
  advanced: '🔴',
};

function difficultyLine(difficulty) {
  const badge = DIFFICULTY_BADGES[difficulty] || '⚪';
  // The enum keyword is part of our controlled vocabulary; capitalise the
  // first letter for display without trusting the value beyond the known set.
  const known = badge !== '⚪';
  const label = known ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1) : 'Unknown';
  return `${badge} <b>Difficulty:</b> ${htmlEscape(label)}`;
}

export function render({ summary, shortId }) {
  if (!summary || typeof summary !== 'object') {
    throw new Error('summaryRenderer: summary is required');
  }
  if (typeof shortId !== 'string' || shortId.length === 0) {
    throw new Error('summaryRenderer: shortId is required');
  }

  const titleHtml = htmlEscape(summary.title);
  const conceptsHtml = (summary.mainConcepts || []).map((c) => `• ${htmlEscape(c)}`).join('\n');
  const pointsHtml = (summary.keyPoints || []).map((p) => `• ${htmlEscape(p)}`).join('\n');

  const html = [
    `<b>${titleHtml}</b>`,
    difficultyLine(summary.difficulty),
    '',
    '<b>Main concepts</b>',
    conceptsHtml,
    '',
    '<b>Key points</b>',
    pointsHtml,
  ].join('\n');

  return {
    html,
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: '🧠 Quiz me now',
            callback_data: `qstart:${shortId}`,
          },
        ],
      ],
    },
  };
}

export default render;
