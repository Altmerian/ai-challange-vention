import { describe, it, expect } from 'vitest';
import { encode, decode, MAX_CALLBACK_BYTES } from '../callbackCodec.js';

describe('callbackCodec.encode + decode round-trip', () => {
  it('round-trips qa: with valid quizId, qIdx, choice', () => {
    const data = encode('qa', { quizId: 'abc12345', qIdx: 2, choice: 'B' });
    expect(data).toBe('qa:abc12345:2:B');
    expect(decode(data)).toEqual({ ok: true, type: 'qa', params: { quizId: 'abc12345', qIdx: 2, choice: 'B' } });
  });

  it('round-trips rs: resume (4-segment with bound quizId)', () => {
    const data = encode('rs', { materialShortId: 'm1234567', quizId: 'q0000001', action: 'r' });
    expect(data).toBe('rs:m1234567:q0000001:r');
    expect(decode(data)).toEqual({ ok: true, type: 'rs', params: { materialShortId: 'm1234567', quizId: 'q0000001', action: 'r' } });
  });

  it('round-trips rs: start-fresh (4-segment with bound quizId)', () => {
    const data = encode('rs', { materialShortId: 'm1234567', quizId: 'q0000001', action: 'n' });
    expect(data).toBe('rs:m1234567:q0000001:n');
    expect(decode(data)).toEqual({ ok: true, type: 'rs', params: { materialShortId: 'm1234567', quizId: 'q0000001', action: 'n' } });
  });

  it('round-trips tp:', () => {
    const data = encode('tp', { materialShortId: 'mat00001' });
    expect(data).toBe('tp:mat00001');
    expect(decode(data)).toEqual({ ok: true, type: 'tp', params: { materialShortId: 'mat00001' } });
  });

  it('round-trips tpp: with page 0', () => {
    expect(encode('tpp', { pageIdx: 0 })).toBe('tpp:0');
    expect(decode('tpp:0')).toEqual({ ok: true, type: 'tpp', params: { pageIdx: 0 } });
  });

  it('round-trips tpp: with multi-digit page index', () => {
    const data = encode('tpp', { pageIdx: 42 });
    expect(data).toBe('tpp:42');
    expect(decode(data)).toEqual({ ok: true, type: 'tpp', params: { pageIdx: 42 } });
  });

  it('round-trips qstart:', () => {
    const data = encode('qstart', { materialShortId: 'mat00001' });
    expect(data).toBe('qstart:mat00001');
    expect(decode(data)).toEqual({ ok: true, type: 'qstart', params: { materialShortId: 'mat00001' } });
  });
});

describe('callbackCodec.encode validation', () => {
  it('throws on unknown type', () => {
    expect(() => encode('foo', {})).toThrow(/unknown type/);
  });

  it('throws when qa.qIdx is negative or non-integer', () => {
    expect(() => encode('qa', { quizId: 'q1', qIdx: -1, choice: 'A' })).toThrow();
    expect(() => encode('qa', { quizId: 'q1', qIdx: 1.5, choice: 'A' })).toThrow();
    expect(() => encode('qa', { quizId: 'q1', qIdx: '2', choice: 'A' })).toThrow();
  });

  it('throws when qa.choice is not A|B|C|D', () => {
    expect(() => encode('qa', { quizId: 'q1', qIdx: 0, choice: 'E' })).toThrow(/choice/);
    expect(() => encode('qa', { quizId: 'q1', qIdx: 0, choice: 'a' })).toThrow(/choice/);
  });

  it('throws when a string field contains a colon (would break decode)', () => {
    // S3 lesson — a colon in any field corrupts the segment count on decode.
    // Encode catches this defensively rather than producing data that decode
    // later mis-parses.
    expect(() => encode('tp', { materialShortId: 'has:colon' })).toThrow(/":"/);
  });

  it('throws when params is not an object', () => {
    expect(() => encode('tp', null)).toThrow(/object/);
    expect(() => encode('tp', 'short')).toThrow(/object/);
  });

  it('throws when rs.action is not r|n', () => {
    expect(() => encode('rs', { materialShortId: 'm1', quizId: 'q1', action: 'x' })).toThrow(/action/);
  });

  it('throws when rs.quizId is missing or empty', () => {
    expect(() => encode('rs', { materialShortId: 'm1', action: 'r' })).toThrow(/quizId/);
    expect(() => encode('rs', { materialShortId: 'm1', quizId: '', action: 'r' })).toThrow(/quizId/);
  });

  it('throws when result exceeds the 64-byte Telegram limit', () => {
    // 60-char materialShortId + the 7-byte "qstart:" prefix = 67 bytes > 64.
    const long = 'a'.repeat(60);
    expect(() => encode('qstart', { materialShortId: long })).toThrow(/64-byte/);
  });

  it('produces a string within the 64-byte limit for normal inputs', () => {
    const data = encode('qa', { quizId: 'abc12345', qIdx: 4, choice: 'D' });
    expect(data.length).toBeLessThanOrEqual(MAX_CALLBACK_BYTES);
  });

  it('rejects huge / non-safe integers that decode could not round-trip', () => {
    // Codex slice-4 finding LOW #4: encode must not emit values like `tpp:1e+21`
    // that decode (which only matches /^\d+$/) would reject. Bound to a
    // practical max instead of unrestricted Number.isInteger.
    expect(() => encode('tpp', { pageIdx: 1e21 })).toThrow();
    expect(() => encode('tpp', { pageIdx: Number.MAX_SAFE_INTEGER })).toThrow();
    expect(() => encode('qa', { quizId: 'q1', qIdx: 1e15, choice: 'A' })).toThrow();
  });
});

describe('callbackCodec.decode failure modes', () => {
  it('rejects empty / non-string input', () => {
    expect(decode('')).toMatchObject({ ok: false, error: { code: 'malformed' } });
    expect(decode(null)).toMatchObject({ ok: false, error: { code: 'malformed' } });
    expect(decode(undefined)).toMatchObject({ ok: false, error: { code: 'malformed' } });
    expect(decode(123)).toMatchObject({ ok: false, error: { code: 'malformed' } });
  });

  it('rejects unknown prefix', () => {
    expect(decode('foo:bar')).toMatchObject({ ok: false, error: { code: 'unknown_prefix' } });
    expect(decode('xx:1:2')).toMatchObject({ ok: false, error: { code: 'unknown_prefix' } });
  });

  it('rejects qa: with wrong segment count', () => {
    expect(decode('qa:onlyone')).toMatchObject({ ok: false, error: { code: 'malformed' } });
    expect(decode('qa:q1:2:A:extra')).toMatchObject({ ok: false, error: { code: 'malformed' } });
  });

  it('rejects qa: with non-integer qIdx', () => {
    expect(decode('qa:q1:abc:A')).toMatchObject({ ok: false, error: { code: 'invalid_field' } });
    expect(decode('qa:q1:-1:A')).toMatchObject({ ok: false, error: { code: 'invalid_field' } });
    expect(decode('qa:q1:1.5:A')).toMatchObject({ ok: false, error: { code: 'invalid_field' } });
  });

  it('rejects qa: with invalid choice', () => {
    expect(decode('qa:q1:0:E')).toMatchObject({ ok: false, error: { code: 'invalid_field' } });
    expect(decode('qa:q1:0:a')).toMatchObject({ ok: false, error: { code: 'invalid_field' } });
  });

  it('rejects rs: with invalid action', () => {
    expect(decode('rs:m1:q1:x')).toMatchObject({ ok: false, error: { code: 'invalid_field' } });
    expect(decode('rs:m1:q1:')).toMatchObject({ ok: false, error: { code: 'invalid_field' } });
  });

  it('rejects rs: with wrong segment count or missing quizId', () => {
    expect(decode('rs:m1:r')).toMatchObject({ ok: false, error: { code: 'malformed' } });
    expect(decode('rs:m1::r')).toMatchObject({ ok: false, error: { code: 'invalid_field' } });
  });

  it('rejects tp: missing id', () => {
    expect(decode('tp:')).toMatchObject({ ok: false, error: { code: 'invalid_field' } });
    expect(decode('tp')).toMatchObject({ ok: false, error: { code: 'malformed' } });
  });

  it('rejects tpp: with non-numeric or negative page', () => {
    expect(decode('tpp:abc')).toMatchObject({ ok: false, error: { code: 'invalid_field' } });
    expect(decode('tpp:-1')).toMatchObject({ ok: false, error: { code: 'invalid_field' } });
    expect(decode('tpp:')).toMatchObject({ ok: false, error: { code: 'invalid_field' } });
  });

  it('rejects callback_data exceeding 64 bytes', () => {
    // A genuinely-too-long payload — could come from an old client or a
    // hand-crafted tap. Encode would have prevented this, but decode runs
    // on untrusted input.
    const tooLong = 'tp:' + 'x'.repeat(70);
    expect(decode(tooLong)).toMatchObject({ ok: false, error: { code: 'too_long' } });
  });
});
