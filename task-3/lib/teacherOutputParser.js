// Validates a Teacher AI response into a strict `Summary` shape, or returns a
// structured ParseError so the workflow can route into the retry branch
// (error #7 / #8 in the PRD error table).
//
// Schema (per PRD § Output schemas):
//   {
//     title: string (non-empty),
//     mainConcepts: string[] (3..5, each non-empty),
//     keyPoints: string[] (5..7, each non-empty),
//     difficulty: "beginner" | "intermediate" | "advanced"
//   }
//
// Returned shape on success: { ok: true, value: Summary }
// Returned shape on failure: { ok: false, error: { code, message } }
//
// `code` is one of:
//   - "not_json"        — rawText was not parseable as JSON
//   - "not_object"      — parsed value isn't a plain object
//   - "schema"          — JSON parsed but fields are missing / wrong / out of range
//
// `message` is a short human-readable string suitable for execution logs.

const DIFFICULTY_ENUM = new Set(['beginner', 'intermediate', 'advanced']);

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStringArrayWithRange(v, min, max) {
  if (!Array.isArray(v)) return false;
  if (v.length < min || v.length > max) return false;
  return v.every(isNonEmptyString);
}

export function parse(rawText) {
  let parsed;
  try {
    parsed = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
  } catch (e) {
    return { ok: false, error: { code: 'not_json', message: 'Teacher output is not valid JSON' } };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: { code: 'not_object', message: 'Teacher output is not a JSON object' } };
  }

  if (!isNonEmptyString(parsed.title)) {
    return { ok: false, error: { code: 'schema', message: 'title is missing or empty' } };
  }

  if (!isStringArrayWithRange(parsed.mainConcepts, 3, 5)) {
    return {
      ok: false,
      error: { code: 'schema', message: 'mainConcepts must be an array of 3..5 non-empty strings' },
    };
  }

  if (!isStringArrayWithRange(parsed.keyPoints, 5, 7)) {
    return {
      ok: false,
      error: { code: 'schema', message: 'keyPoints must be an array of 5..7 non-empty strings' },
    };
  }

  if (!DIFFICULTY_ENUM.has(parsed.difficulty)) {
    return {
      ok: false,
      error: { code: 'schema', message: 'difficulty must be beginner | intermediate | advanced' },
    };
  }

  return {
    ok: true,
    value: {
      title: parsed.title.trim(),
      mainConcepts: parsed.mainConcepts.map((s) => s.trim()),
      keyPoints: parsed.keyPoints.map((s) => s.trim()),
      difficulty: parsed.difficulty,
    },
  };
}

export default parse;
