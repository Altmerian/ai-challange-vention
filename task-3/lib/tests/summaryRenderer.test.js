import { describe, it, expect } from 'vitest';
import { render } from '../summaryRenderer.js';

const baseSummary = {
  title: 'React Hooks Guide',
  mainConcepts: ['useState', 'useEffect', 'useMemo'],
  keyPoints: [
    'Hooks let you use state without classes',
    'useEffect handles side effects',
    'Custom hooks compose reusable logic',
    'Rules of hooks must be followed',
    'Hooks run on every render unless memoized',
  ],
  difficulty: 'intermediate',
};

describe('summaryRenderer.render', () => {
  describe('happy path', () => {
    it('produces an HTML body and a Quiz-me-now inline keyboard', () => {
      const result = render({ summary: baseSummary, shortId: 'ab12cd34' });
      expect(result.html).toContain('<b>React Hooks Guide</b>');
      expect(result.html).toContain('🟡');
      expect(result.html).toContain('Intermediate');
      expect(result.html).toContain('• useState');
      expect(result.html).toContain('• Hooks let you use state without classes');
      expect(result.replyMarkup.inline_keyboard).toEqual([
        [{ text: '🧠 Quiz me now', callback_data: 'qstart:ab12cd34' }],
      ]);
    });

    it('uses the green badge for beginner and the red badge for advanced', () => {
      const beginner = render({ summary: { ...baseSummary, difficulty: 'beginner' }, shortId: 'x' });
      expect(beginner.html).toContain('🟢');
      expect(beginner.html).toContain('Beginner');

      const advanced = render({ summary: { ...baseSummary, difficulty: 'advanced' }, shortId: 'x' });
      expect(advanced.html).toContain('🔴');
      expect(advanced.html).toContain('Advanced');
    });
  });

  describe('HTML escape contract', () => {
    // Per PRD § HTML rendering contract: every dynamic field must be escaped
    // before string interpolation. Failures here mean Telegram will reject
    // the entire message with "Bad Request: can't parse entities".
    it('escapes <, >, & in title, mainConcepts, and keyPoints', () => {
      const summary = {
        title: 'List<T> & friends',
        mainConcepts: ['a < b', 'foo & bar', 'List<T>'],
        keyPoints: [
          'when a < b && c > d, the predicate holds',
          'use <pre> blocks for code',
          'AT&T and similar acronyms',
          'angle brackets like <kbd> are valid HTML tags',
          'and & here',
        ],
        difficulty: 'beginner',
      };

      const { html } = render({ summary, shortId: 'short001' });

      // Required: the escaped sequences appear verbatim.
      expect(html).toContain('List&lt;T&gt; &amp; friends');
      expect(html).toContain('a &lt; b');
      expect(html).toContain('foo &amp; bar');
      expect(html).toContain('a &lt; b &amp;&amp; c &gt; d');

      // Required: every `<` and `>` in the output is part of an HTML tag we
      // ourselves emit (`<b>`, `</b>`). No raw user `<` / `>` leaks through.
      const allowedTags = ['<b>', '</b>'];
      let scrubbed = html;
      for (const t of allowedTags) scrubbed = scrubbed.split(t).join('');
      expect(scrubbed).not.toMatch(/[<>]/);

      // Required: every `&` is either `&amp;`, `&lt;`, or `&gt;` — no raw `&`.
      expect(scrubbed.match(/&(?!amp;|lt;|gt;)/g)).toBeNull();
    });

    it('does not collapse a near-Telegram-limit-length payload (payload <= 4096 stays single-message)', () => {
      // Telegram's body limit is 4096 chars; the chunking rule (#12) kicks in
      // when we exceed it. This test confirms the renderer doesn't internally
      // truncate or split — that's the sender's job. We just need the output
      // to faithfully include the long input.
      const longPoint = 'x'.repeat(800);
      const summary = {
        ...baseSummary,
        keyPoints: [longPoint, longPoint, longPoint, longPoint, longPoint],
      };
      const { html } = render({ summary, shortId: 'x' });
      expect(html.length).toBeGreaterThan(4000);
      // Every key point should be present
      expect((html.match(new RegExp(longPoint, 'g')) || []).length).toBe(5);
    });

    it('handles a stray unknown difficulty gracefully without leaking unescaped characters', () => {
      // Defence-in-depth: even though `teacherOutputParser` rejects out-of-enum
      // values, the renderer is the last line before Telegram. An unknown
      // value must not crash and must not produce a body that Telegram rejects.
      const summary = { ...baseSummary, difficulty: 'expert<script>' };
      const { html } = render({ summary, shortId: 'x' });
      expect(html).not.toContain('<script>');
      expect(html).toContain('⚪');
    });
  });

  describe('input validation', () => {
    it('throws if summary is missing', () => {
      expect(() => render({ summary: null, shortId: 'x' })).toThrow(/summary/);
    });

    it('throws if shortId is missing or empty', () => {
      expect(() => render({ summary: baseSummary, shortId: '' })).toThrow(/shortId/);
      expect(() => render({ summary: baseSummary, shortId: undefined })).toThrow(/shortId/);
    });
  });
});
