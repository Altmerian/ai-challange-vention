import { describe, it, expect } from 'vitest';
import { htmlEscape } from '../htmlEscape.js';

describe('htmlEscape', () => {
  it('returns empty string for empty input', () => {
    expect(htmlEscape('')).toBe('');
  });

  it('escapes & first so already-encoded &-sequences round-trip without double-encoding harm', () => {
    // The contract is "& -> &amp; before < and >", which means already-escaped
    // input is *re-escaped* (`&amp;` -> `&amp;amp;`). That's the safe direction:
    // we never silently lose information. Verified explicitly here.
    expect(htmlEscape('&')).toBe('&amp;');
    expect(htmlEscape('&amp;')).toBe('&amp;amp;');
    expect(htmlEscape('a & b')).toBe('a &amp; b');
  });

  it('escapes < and > on their own', () => {
    expect(htmlEscape('<')).toBe('&lt;');
    expect(htmlEscape('>')).toBe('&gt;');
  });

  it('escapes all three special chars together in one string', () => {
    expect(htmlEscape('List<T> & a > b')).toBe('List&lt;T&gt; &amp; a &gt; b');
    expect(htmlEscape('a < b && c > d')).toBe('a &lt; b &amp;&amp; c &gt; d');
  });

  it('preserves non-special characters verbatim (including quotes, which Telegram HTML body does not need escaped)', () => {
    expect(htmlEscape('plain text 123 "quoted"')).toBe('plain text 123 "quoted"');
  });

  it('escapes multiline content containing every dangerous character', () => {
    // Real-world failure mode: a Jina-extracted code snippet with angle
    // brackets, ampersands, and embedded quotes split across multiple lines.
    // Telegram HTML parse mode would reject the whole message if any of
    // these slipped through unescaped.
    const input = 'function pick<T>(xs: T[], i: number): T {\n  if (i < 0 || i >= xs.length) throw new Error("bad index");\n  return xs[i] && xs[i];\n}';
    const out = htmlEscape(input);
    expect(out).not.toMatch(/[<>]/);
    expect(out.match(/&(?!amp;|lt;|gt;)/)).toBeNull();
    expect(out).toContain('pick&lt;T&gt;');
    expect(out).toContain('i &lt; 0');
    expect(out).toContain('i &gt;= xs.length');
    expect(out).toContain('xs[i] &amp;&amp; xs[i]');
    expect(out).toContain('"bad index"');
  });

  it('handles non-string input by coercion', () => {
    expect(htmlEscape(42)).toBe('42');
    expect(htmlEscape(true)).toBe('true');
    expect(htmlEscape(null)).toBe('');
    expect(htmlEscape(undefined)).toBe('');
  });
});
