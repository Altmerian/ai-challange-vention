// Validates an Examiner AI response into a strict 5-question MCQ shape, or
// returns a structured ParseError so the workflow can route into the retry
// branch (error #9 in the PRD error table).
//
// Schema (per PRD § Output schemas):
//   {
//     questions: [
//       {
//         id: "Q1".."Q5",
//         question: string (non-empty),
//         options: [
//           { key: "A", text: string (non-empty) },
//           { key: "B", text: string (non-empty) },
//           { key: "C", text: string (non-empty) },
//           { key: "D", text: string (non-empty) }
//         ],
//         correctAnswer: "A" | "B" | "C" | "D",
//         perOptionExplanation: {
//           A: string (non-empty),
//           B: string (non-empty),
//           C: string (non-empty),
//           D: string (non-empty)
//         }
//       }
//     ] (length === 5)
//   }
//
// The contract mirrors `teacherOutputParser`: same `{ ok, error: { code, message } }`
// shape so the workflow's error-routing topology is uniform (PRD slice-3 handoff).
//
// `code` is one of:
//   - "not_json"  — rawText was not parseable as JSON
//   - "not_object" — parsed value isn't a plain object
//   - "schema"    — JSON parsed but structure violates the schema above
//
// `message` is short, suitable for execution logs (no raw content echoed).

const OPTION_KEYS = ['A', 'B', 'C', 'D'];
const OPTION_KEY_SET = new Set(OPTION_KEYS);
const QUESTION_COUNT = 5;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateOptions(options, qIdx) {
  if (!Array.isArray(options) || options.length !== OPTION_KEYS.length) {
    return `questions[${qIdx}].options must be an array of exactly 4 items`;
  }
  for (let i = 0; i < OPTION_KEYS.length; i++) {
    const opt = options[i];
    const expectedKey = OPTION_KEYS[i];
    if (!opt || typeof opt !== 'object' || Array.isArray(opt)) {
      return `questions[${qIdx}].options[${i}] must be an object`;
    }
    if (opt.key !== expectedKey) {
      return `questions[${qIdx}].options[${i}].key must equal "${expectedKey}"`;
    }
    if (!isNonEmptyString(opt.text)) {
      return `questions[${qIdx}].options[${i}].text must be a non-empty string`;
    }
  }
  return null;
}

function validatePerOptionExplanation(explain, qIdx) {
  if (explain === null || typeof explain !== 'object' || Array.isArray(explain)) {
    return `questions[${qIdx}].perOptionExplanation must be an object`;
  }
  for (const k of OPTION_KEYS) {
    if (!isNonEmptyString(explain[k])) {
      return `questions[${qIdx}].perOptionExplanation.${k} must be a non-empty string`;
    }
  }
  return null;
}

export function parse(rawText) {
  let parsed;
  try {
    parsed = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
  } catch (_) {
    return { ok: false, error: { code: 'not_json', message: 'Examiner output is not valid JSON' } };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: { code: 'not_object', message: 'Examiner output is not a JSON object' } };
  }

  if (!Array.isArray(parsed.questions) || parsed.questions.length !== QUESTION_COUNT) {
    return {
      ok: false,
      error: {
        code: 'schema',
        message: `questions must be an array of exactly ${QUESTION_COUNT} items`,
      },
    };
  }

  const normalized = [];
  for (let i = 0; i < QUESTION_COUNT; i++) {
    const q = parsed.questions[i];
    if (!q || typeof q !== 'object' || Array.isArray(q)) {
      return { ok: false, error: { code: 'schema', message: `questions[${i}] must be an object` } };
    }
    if (!isNonEmptyString(q.question)) {
      return { ok: false, error: { code: 'schema', message: `questions[${i}].question must be a non-empty string` } };
    }
    const optionsErr = validateOptions(q.options, i);
    if (optionsErr) return { ok: false, error: { code: 'schema', message: optionsErr } };
    if (!OPTION_KEY_SET.has(q.correctAnswer)) {
      return {
        ok: false,
        error: { code: 'schema', message: `questions[${i}].correctAnswer must be one of A|B|C|D` },
      };
    }
    const explainErr = validatePerOptionExplanation(q.perOptionExplanation, i);
    if (explainErr) return { ok: false, error: { code: 'schema', message: explainErr } };

    // The `id` is supplied by the Examiner (Q1..Q5). We trust the slot order
    // and rewrite the id deterministically so downstream logic — which uses
    // qIdx, not q.id — is never out of sync with the array slot.
    normalized.push({
      id: `Q${i + 1}`,
      question: q.question.trim(),
      options: q.options.map((opt) => ({ key: opt.key, text: opt.text.trim() })),
      correctAnswer: q.correctAnswer,
      perOptionExplanation: {
        A: q.perOptionExplanation.A.trim(),
        B: q.perOptionExplanation.B.trim(),
        C: q.perOptionExplanation.C.trim(),
        D: q.perOptionExplanation.D.trim(),
      },
    });
  }

  return { ok: true, value: { questions: normalized } };
}

export default parse;
