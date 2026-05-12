import { describe, it, expect } from 'vitest';
import { render } from '../quizFeedbackRenderer.js';

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
    perOptionExplanation: {
      A: 'Correct — effects run after the commit phase.',
      B: 'Wrong — effects do not run before render.',
      C: 'Wrong — that is useMemo, not useEffect.',
      D: 'Wrong — useEffect and useState are complementary.',
    },
    ...overrides,
  };
}

describe('quizFeedbackRenderer.render', () => {
  describe('happy path', () => {
    it('renders a ✅ banner and the picked option\'s explanation on a correct tap', () => {
      const { html } = render({ question: makeQuestion(), picked: 'A', qIdx: 0 });
      expect(html).toContain('✅');
      expect(html).toContain('Correct');
      expect(html).toContain('effects run after the commit phase');
      expect(html).toContain('Question 1 of 5');
    });

    it('renders a ❌ banner and the picked option\'s explanation on an incorrect tap', () => {
      const { html } = render({ question: makeQuestion(), picked: 'C', qIdx: 2 });
      expect(html).toContain('❌');
      expect(html).toContain('Not quite');
      // PRD: explanation must be targeted to the user's pick, not the correct answer.
      expect(html).toContain('that is useMemo');
      expect(html).not.toContain('effects run after the commit phase');
      // The correct-answer letter is still surfaced in the banner.
      expect(html).toMatch(/<b>A<\/b>/);
      expect(html).toContain('Question 3 of 5');
    });
  });

  describe('HTML escape contract', () => {
    // Per PRD § HTML rendering contract: the dynamic explanation text must be
    // escaped before interpolation. Failing here means Telegram rejects the
    // message with "Bad Request: can't parse entities".
    it('escapes <, >, & in the picked option\'s explanation', () => {
      const q = makeQuestion({
        correctAnswer: 'B',
        perOptionExplanation: {
          A: 'Wrong — List<T> & List<String> are not the same.',
          B: 'Correct — a < b implies b > a.',
          C: 'Wrong — AT&T is a brand.',
          D: 'Wrong — <pre> blocks differ.',
        },
      });
      // Pick A (wrong) → its escaped explanation appears in body.
      const { html } = render({ question: q, picked: 'A', qIdx: 0 });
      expect(html).toContain('List&lt;T&gt; &amp; List&lt;String&gt;');

      // Required: no raw `<` / `>` / `&` outside our own static markup.
      const allowedTags = ['<b>', '</b>', '<i>', '</i>'];
      let scrubbed = html;
      for (const t of allowedTags) scrubbed = scrubbed.split(t).join('');
      expect(scrubbed).not.toMatch(/[<>]/);
      expect(scrubbed.match(/&(?!amp;|lt;|gt;)/g)).toBeNull();
    });
  });

  describe('input validation', () => {
    it('throws on missing question', () => {
      expect(() => render({ question: null, picked: 'A', qIdx: 0 })).toThrow(/question/);
    });

    it('throws on invalid picked', () => {
      expect(() => render({ question: makeQuestion(), picked: 'E', qIdx: 0 })).toThrow(/picked/);
      expect(() => render({ question: makeQuestion(), picked: 'a', qIdx: 0 })).toThrow(/picked/);
    });

    it('throws on a non-integer qIdx', () => {
      expect(() => render({ question: makeQuestion(), picked: 'A', qIdx: -1 })).toThrow(/qIdx/);
    });

    it('throws if the explanation for the picked option is missing', () => {
      const q = makeQuestion();
      delete q.perOptionExplanation.C;
      expect(() => render({ question: q, picked: 'C', qIdx: 0 })).toThrow(/perOptionExplanation\.C/);
    });
  });
});
