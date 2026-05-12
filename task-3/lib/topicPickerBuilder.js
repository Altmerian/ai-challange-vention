// Renders the `/quiz` topic picker into the message body + a STATIC
// 3-row keyboard (2 grid rows of 4 numbered buttons + 1 pagination row of
// 3 buttons). Workflow renders the picker via the n8n Telegram node whose
// inline-keyboard structure is statically-sized — dynamic-length keyboards
// would require an HTTP Request to the Bot API with the token interpolated
// from a Variable/Env Var, neither of which is available on the user's n8n
// plan. See task-3/implementation-plan.md slice-4 handoff for context.
//
// Inputs:
//   - materials: array of `{ short_id, title, difficulty }`, sorted by the
//     caller (the workflow sorts `added_date DESC` via the Data Table node).
//   - page: 0-based page index. Clamped to [0, totalPages-1] silently.
//   - pageSize: items per page. Default 8.
//
// Output:
//   {
//     empty: boolean,
//     html: string,                      // Telegram message body (HTML)
//     gridButtons: Button[8],            // 2 grid rows of 4 cells each
//     paginationButtons: Button[3],      // [Prev, PageStatus, Next]
//     page: number, totalPages: number
//   }
//
// Each Button is `{ text: string, callback_data: string }`. The grid has
// exactly 8 entries even when fewer materials are on the current page;
// unused cells use "·" text with a no-op callback that re-renders the
// current page (`tpp:{safePage}`). Pagination buttons wrap-around on the
// edges (Prev on page 0 → last page; Next on last page → page 0), and the
// middle button is informational (also re-renders on tap). This means the
// keyboard is callback-handler-complete: every tap routes through a valid
// branch and the user always gets an ack.

import { htmlEscape } from './htmlEscape.js';
import { encode } from './callbackCodec.js';

const DIFFICULTY_EMOJI = {
  beginner: '🟢',
  intermediate: '🟡',
  advanced: '🔴',
};

export const DEFAULT_PAGE_SIZE = 8;
export const GRID_SIZE = 8;
// U+2800 (Braille pattern blank) renders as truly invisible whitespace on
// Telegram, so unused grid cells and single-page pagination buttons don't
// add visual clutter. Telegram requires button text to be non-empty (>= 1
// character); a literal space would still render as a visibly-blank button.
const NOOP_TEXT = '⠀';
const PREV_LABEL = '⬅️ Prev';
const NEXT_LABEL = 'Next ➡️';
const PICKER_HEADER = '<b>📚 Pick a material to quiz on:</b>';
const EMPTY_MESSAGE_HTML =
  "You haven't saved any materials yet. Send /learn &lt;URL&gt; to add one.";

function noopButton(safePage) {
  return { text: NOOP_TEXT, callback_data: encode('tpp', { pageIdx: safePage }) };
}

export function build({ materials, page = 0, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  if (!Array.isArray(materials) || materials.length === 0) {
    return {
      empty: true,
      html: EMPTY_MESSAGE_HTML,
      gridButtons: null,
      paginationButtons: null,
      page: 0,
      totalPages: 0,
    };
  }

  const totalPages = Math.max(1, Math.ceil(materials.length / pageSize));
  const rawPage = Number.isFinite(page) ? page | 0 : 0;
  const safePage = Math.min(Math.max(0, rawPage), totalPages - 1);
  const start = safePage * pageSize;
  const slice = materials.slice(start, start + pageSize);

  // Body: numbered list of materials on the current page.
  const lines = slice.map((m, idx) => {
    const emoji = DIFFICULTY_EMOJI[m.difficulty] || '⚪';
    const title = m.title == null ? '' : String(m.title);
    return `${idx + 1}. ${emoji} ${htmlEscape(title)}`;
  });
  const pageLine = totalPages > 1 ? `\n<i>Page ${safePage + 1} of ${totalPages}</i>` : '';
  const html = `${PICKER_HEADER}${pageLine}\n\n${lines.join('\n')}`;

  // Grid: exactly 8 buttons. Material slots get tp:<short_id>; unused slots
  // get a noop re-render so taps still produce a callback the workflow can ack.
  const gridButtons = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    if (i < slice.length) {
      gridButtons.push({
        text: String(i + 1),
        callback_data: encode('tp', { materialShortId: slice[i].short_id }),
      });
    } else {
      gridButtons.push(noopButton(safePage));
    }
  }

  // Pagination row: 3 cells. Wraparound on the edges so every tap is valid.
  // On a single-page picker, all 3 cells become no-op re-renders.
  const prevPage = totalPages > 1 ? (safePage > 0 ? safePage - 1 : totalPages - 1) : safePage;
  const nextPage = totalPages > 1 ? (safePage < totalPages - 1 ? safePage + 1 : 0) : safePage;
  const paginationButtons = [
    {
      text: totalPages > 1 ? PREV_LABEL : NOOP_TEXT,
      callback_data: encode('tpp', { pageIdx: prevPage }),
    },
    {
      text: `Page ${safePage + 1}/${totalPages}`,
      callback_data: encode('tpp', { pageIdx: safePage }),
    },
    {
      text: totalPages > 1 ? NEXT_LABEL : NOOP_TEXT,
      callback_data: encode('tpp', { pageIdx: nextPage }),
    },
  ];

  return {
    empty: false,
    html,
    gridButtons,
    paginationButtons,
    page: safePage,
    totalPages,
  };
}

export default build;
