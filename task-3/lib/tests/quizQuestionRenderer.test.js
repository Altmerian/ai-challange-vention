import { describe, it, expect } from 'vitest';
import { render } from '../quizQuestionRenderer.js';

function makeQuestion(overrides = {}) {
  return {
    id: 'Q1',
    question: 'What does useEffect do?',
    options: [
      { key: 'A', text: 'Runs after render' },
      { key: 'B', text: 'Runs before render' },
      { key: 'C', text: 'Memoizes values' },
      { key: 'D', text: 'Replaces useState' },
    ],
    correctAnswer: 'A',
    perOptionExplanation: { A: 'a', B: 'b', C: 'c', D: 'd' },
    ...overrides,
  };
}

describe('quizQuestionRenderer.render', () => {
  describe('happy path', () => {
    it('produces HTML body and a 4-row A/B/C/D inline keyboard', () => {
      const { html, replyMarkup } = render({ question: makeQuestion(), quizId: 'q1234567', qIdx: 0 });
      expect(html).toContain('Question 1 of 5');
      expect(html).toContain('What does useEffect do?');
      expect(html).toContain('Runs after render');
      expect(replyMarkup.inline_keyboard).toHaveLength(4);
      expect(replyMarkup.inline_keyboard[0]).toHaveLength(1);
      expect(replyMarkup.inline_keyboard[0][0]).toEqual({
        text: 'A) Runs after render',
        callback_data: 'qa:q1234567:0:A',
      });
      expect(replyMarkup.inline_keyboard[3][0].callback_data).toBe('qa:q1234567:0:D');
    });

    it('encodes qIdx 0..4 into callback_data', () => {
      for (const qIdx of [0, 1, 2, 3, 4]) {
        const { replyMarkup } = render({ question: makeQuestion(), quizId: 'abc12345', qIdx });
        expect(replyMarkup.inline_keyboard[0][0].callback_data).toBe(`qa:abc12345:${qIdx}:A`);
      }
    });
  });

  describe('HTML escape contract', () => {
    // Per PRD § HTML rendering contract: question text and option text are
    // dynamic content and must be escaped. Failing here means Telegram
    // rejects the message with "Bad Request: can't parse entities".
    it('escapes <, >, & in question text and option text', () => {
      const q = makeQuestion({
        question: 'When is List<T> & generics preferred over a < b?',
        options: [
          { key: 'A', text: '<pre> blocks' },
          { key: 'B', text: 'a && b' },
          { key: 'C', text: 'foo > bar' },
          { key: 'D', text: 'AT&T' },
        ],
      });
      const { html } = render({ question: q, quizId: 'q1234567', qIdx: 0 });

      // Required: every escape appears verbatim in the body.
      expect(html).toContain('List&lt;T&gt; &amp; generics');
      expect(html).toContain('a &lt; b');
      expect(html).toContain('&lt;pre&gt; blocks');
      expect(html).toContain('a &amp;&amp; b');
      expect(html).toContain('foo &gt; bar');
      expect(html).toContain('AT&amp;T');

      // Required: every `<` / `>` in the output is part of an HTML tag we
      // emit ourselves (`<b>`, `</b>`). No raw user `<` / `>` leaks through.
      const allowedTags = ['<b>', '</b>'];
      let scrubbed = html;
      for (const t of allowedTags) scrubbed = scrubbed.split(t).join('');
      expect(scrubbed).not.toMatch(/[<>]/);

      // Required: every `&` is an HTML entity — no raw `&`.
      expect(scrubbed.match(/&(?!amp;|lt;|gt;)/g)).toBeNull();
    });

    it('does not escape inline-button text (Telegram button widget is plain UTF-8)', () => {
      const q = makeQuestion({
        options: [
          { key: 'A', text: 'List<T>' },
          { key: 'B', text: 'plain' },
          { key: 'C', text: 'a & b' },
          { key: 'D', text: 'plain' },
        ],
      });
      const { replyMarkup } = render({ question: q, quizId: 'q1234567', qIdx: 0 });
      expect(replyMarkup.inline_keyboard[0][0].text).toBe('A) List<T>');
      expect(replyMarkup.inline_keyboard[2][0].text).toBe('C) a & b');
    });
  });

  describe('input validation', () => {
    it('throws if question is missing', () => {
      expect(() => render({ question: null, quizId: 'q1234567', qIdx: 0 })).toThrow(/question/);
    });

    it('throws if quizId is missing', () => {
      expect(() => render({ question: makeQuestion(), quizId: '', qIdx: 0 })).toThrow(/quizId/);
    });

    it('throws if qIdx is negative or non-integer', () => {
      expect(() => render({ question: makeQuestion(), quizId: 'q', qIdx: -1 })).toThrow(/qIdx/);
      expect(() => render({ question: makeQuestion(), quizId: 'q', qIdx: 1.5 })).toThrow(/qIdx/);
    });

    it('throws if options length is not 4', () => {
      const q = makeQuestion();
      q.options = q.options.slice(0, 3);
      expect(() => render({ question: q, quizId: 'q', qIdx: 0 })).toThrow(/options/);
    });
  });
});
