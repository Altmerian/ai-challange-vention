// Encodes and decodes Telegram inline-button `callback_data` strings for the
// bot's controlled vocabulary. Two design constraints:
//
//   1. Telegram's hard limit on `callback_data` is 64 bytes UTF-8. Anything
//      longer is rejected by the Bot API at sendMessage time, so we guard at
//      encode and surface an explicit error early.
//   2. Decoding runs on untrusted input (anyone can tamper with callback_data
//      on the client, and stale buttons from old executions can still fire),
//      so `decode` returns a structured `{ ok, ... }` result and never throws.
//
// Vocabulary (PRD § Callback data conventions):
//   - `qa:{quizId}:{qIdx}:{choice}`          — answer-button tap
//   - `rs:{materialShortId}:{quizId}:{r|n}`  — resume / start-fresh, bound to
//                                              the observed in-progress quiz_id
//                                              so a stale prompt cannot delete
//                                              a freshly-started quiz (slice 6
//                                              Codex adversarial review HIGH-1).
//   - `tp:{materialShortId}`                 — topic pick from /quiz list
//   - `tpp:{pageIdx}`                        — topic-picker pagination
//   - `qstart:{materialShortId}`             — "Quiz me now" under a Summary
//
// `:` is the segment delimiter; no field value may contain it. `encode` throws
// on invalid input (programming error in the workflow); `decode` returns
// `{ ok: false, error: { code, message } }` on any failure.

export const MAX_CALLBACK_BYTES = 64;

// `qa.qIdx` is the 0-based question index (0..4 for a five-question Quiz).
// We allow up to 99 here for forward compatibility, but the upstream
// generator only produces 0..4.
const QA_CHOICES = new Set(['A', 'B', 'C', 'D']);
const RS_ACTIONS = new Set(['r', 'n']);

function byteLength(s) {
  // n8n Code-node sandbox exposes Buffer; browsers / minimal envs fall back
  // to TextEncoder. Tests run on Node, so Buffer is always available.
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(s, 'utf8');
  return new TextEncoder().encode(s).length;
}

function assertNonEmptyToken(value, fieldName) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`callbackCodec.encode: ${fieldName} must be a non-empty string`);
  }
  if (value.indexOf(':') !== -1) {
    throw new TypeError(`callbackCodec.encode: ${fieldName} must not contain ":"`);
  }
}

// Upper bound mirrors the practical range encode/decode can round-trip.
// pageIdx and qIdx are small (< 100 in practice), but the limit guards
// against accidental huge values (e.g. timestamps) which `Number.isInteger`
// alone wouldn't catch — `decode` only matches `\d+`, so `1e21` would emit
// `tpp:1e+21` and fail to round-trip. (Codex slice-4 finding LOW #4.)
const MAX_NON_NEG_INT = 999999;
function assertNonNegativeInt(value, fieldName) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_NON_NEG_INT) {
    throw new TypeError(
      `callbackCodec.encode: ${fieldName} must be a non-negative integer in [0, ${MAX_NON_NEG_INT}]`,
    );
  }
}

export function encode(type, params) {
  if (params === null || typeof params !== 'object') {
    throw new TypeError('callbackCodec.encode: params must be an object');
  }
  let out;
  switch (type) {
    case 'qa': {
      assertNonEmptyToken(params.quizId, 'quizId');
      assertNonNegativeInt(params.qIdx, 'qIdx');
      if (!QA_CHOICES.has(params.choice)) {
        throw new TypeError('callbackCodec.encode: choice must be one of A, B, C, D');
      }
      out = `qa:${params.quizId}:${params.qIdx}:${params.choice}`;
      break;
    }
    case 'rs': {
      assertNonEmptyToken(params.materialShortId, 'materialShortId');
      assertNonEmptyToken(params.quizId, 'quizId');
      if (!RS_ACTIONS.has(params.action)) {
        throw new TypeError('callbackCodec.encode: action must be "r" or "n"');
      }
      out = `rs:${params.materialShortId}:${params.quizId}:${params.action}`;
      break;
    }
    case 'tp': {
      assertNonEmptyToken(params.materialShortId, 'materialShortId');
      out = `tp:${params.materialShortId}`;
      break;
    }
    case 'tpp': {
      assertNonNegativeInt(params.pageIdx, 'pageIdx');
      out = `tpp:${params.pageIdx}`;
      break;
    }
    case 'qstart': {
      assertNonEmptyToken(params.materialShortId, 'materialShortId');
      out = `qstart:${params.materialShortId}`;
      break;
    }
    default:
      throw new TypeError(`callbackCodec.encode: unknown type "${type}"`);
  }
  if (byteLength(out) > MAX_CALLBACK_BYTES) {
    throw new RangeError(
      `callbackCodec.encode: result "${out}" exceeds Telegram's ${MAX_CALLBACK_BYTES}-byte callback_data limit`,
    );
  }
  return out;
}

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

function parseNonNegativeInt(raw) {
  if (typeof raw !== 'string' || raw === '' || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function decode(callbackData) {
  if (typeof callbackData !== 'string' || callbackData.length === 0) {
    return fail('malformed', 'callback_data must be a non-empty string');
  }
  if (byteLength(callbackData) > MAX_CALLBACK_BYTES) {
    return fail('too_long', `callback_data exceeds ${MAX_CALLBACK_BYTES} bytes`);
  }
  const parts = callbackData.split(':');
  const type = parts[0];
  switch (type) {
    case 'qa': {
      if (parts.length !== 4) return fail('malformed', 'qa: expects quizId:qIdx:choice');
      const [, quizId, qIdxRaw, choice] = parts;
      if (!quizId) return fail('invalid_field', 'qa.quizId is empty');
      const qIdx = parseNonNegativeInt(qIdxRaw);
      if (qIdx === null) return fail('invalid_field', 'qa.qIdx must be a non-negative integer');
      if (!QA_CHOICES.has(choice)) return fail('invalid_field', 'qa.choice must be A|B|C|D');
      return { ok: true, type, params: { quizId, qIdx, choice } };
    }
    case 'rs': {
      if (parts.length !== 4) return fail('malformed', 'rs: expects materialShortId:quizId:action');
      const [, materialShortId, quizId, action] = parts;
      if (!materialShortId) return fail('invalid_field', 'rs.materialShortId is empty');
      if (!quizId) return fail('invalid_field', 'rs.quizId is empty');
      if (!RS_ACTIONS.has(action)) return fail('invalid_field', 'rs.action must be r|n');
      return { ok: true, type, params: { materialShortId, quizId, action } };
    }
    case 'tp': {
      if (parts.length !== 2) return fail('malformed', 'tp: expects materialShortId');
      const [, materialShortId] = parts;
      if (!materialShortId) return fail('invalid_field', 'tp.materialShortId is empty');
      return { ok: true, type, params: { materialShortId } };
    }
    case 'tpp': {
      if (parts.length !== 2) return fail('malformed', 'tpp: expects pageIdx');
      const pageIdx = parseNonNegativeInt(parts[1]);
      if (pageIdx === null) return fail('invalid_field', 'tpp.pageIdx must be a non-negative integer');
      return { ok: true, type, params: { pageIdx } };
    }
    case 'qstart': {
      if (parts.length !== 2) return fail('malformed', 'qstart: expects materialShortId');
      const [, materialShortId] = parts;
      if (!materialShortId) return fail('invalid_field', 'qstart.materialShortId is empty');
      return { ok: true, type, params: { materialShortId } };
    }
    default:
      return fail('unknown_prefix', `unknown callback prefix "${type}"`);
  }
}

export default { encode, decode, MAX_CALLBACK_BYTES };
