import { describe, it, expect } from 'vitest';
import { render } from '../quizResultRenderer.js';

function makeQuestion(i, overrides = {}) {
  return {
    id: `Q${i + 1}`,
    question: `Question ${i + 1}?`,
    options: [
      { key: 'A', text: `A${i}` },
      { key: 'B', text: `B${i}` },
      { key: 'C', text: `C${i}` },
      { key: 'D', text: `D${i}` },
    ],
    correctAnswer: 'A',
    perOptionExplanation: {
      A: `correct${i}`,
      B: `wrong-B-${i}`,
      C: `wrong-C-${i}`,
      D: `wrong-D-${i}`,
    },
    ...overrides,
  };
}

function makeAnswers(picks) {
  // picks: array of 5 letters
  return picks.map((pick, i) => ({
    q_id: `Q${i + 1}`,
    picked: pick,
    is_correct: pick === 'A', // makeQuestion uses correctAnswer 'A'
  }));
}

describe('quizResultRenderer.render', () => {
  describe('happy path', () => {
    it('renders header with score % and per-question breakdown', () => {
      const questions = Array.from({ length: 5 }, (_, i) => makeQuestion(i));
      const answers = makeAnswers(['A', 'B', 'A', 'C', 'A']); // 3/5 correct
      const { html } = render({ questions, answers });
      expect(html).toContain('3/5');
      expect(html).toContain('60%');
      expect(html).toContain('Q1.');
      expect(html).toContain('Q5.');
      expect(html).toContain('✅');
      expect(html).toContain('❌');
    });

    it('renders 100% when every answer is correct', () => {
      const questions = Array.from({ length: 5 }, (_, i) => makeQuestion(i));
      const answers = makeAnswers(['A', 'A', 'A', 'A', 'A']);
      const { html } = render({ questions, answers });
      expect(html).toContain('5/5');
      expect(html).toContain('100%');
      expect(html).not.toContain('❌');
    });

    it('renders 0% and shows the correct-answer letter on each row when every pick was wrong', () => {
      const questions = Array.from({ length: 5 }, (_, i) => makeQuestion(i));
      const answers = makeAnswers(['B', 'C', 'D', 'B', 'C']);
      const { html } = render({ questions, answers });
      expect(html).toContain('0/5');
      expect(html).toContain('0%');
      // Each row should surface the correct letter as a fall-through hint.
      expect((html.match(/Correct:/g) || []).length).toBe(5);
    });

    it('shows the explanation the user saw (or would have seen) for the picked option', () => {
      const questions = Array.from({ length: 5 }, (_, i) => makeQuestion(i));
      const answers = makeAnswers(['B', 'A', 'A', 'A', 'A']);
      const { html } = render({ questions, answers });
      // Q1 was wrong (B) → explanation for B should appear.
      expect(html).toContain('wrong-B-0');
    });
  });

  describe('HTML escape contract', () => {
    // Per PRD § HTML rendering contract: question text and explanation text
    // (both dynamic) must be escaped. Failing here means Telegram rejects the
    // message with "Bad Request: can't parse entities".
    it('escapes <, >, & in question text and the picked-option explanation', () => {
      const questions = Array.from({ length: 5 }, (_, i) =>
        makeQuestion(i, {
          question: `When is List<T> & a < b?`,
          perOptionExplanation: {
            A: 'A: foo & bar',
            B: 'B: <pre>code</pre>',
            C: 'C: a < b && c > d',
            D: 'D: plain',
          },
        }),
      );
      const answers = makeAnswers(['C', 'A', 'A', 'A', 'A']);
      const { html } = render({ questions, answers });

      // Required: escaped sequences in the question line.
      expect(html).toContain('List&lt;T&gt; &amp; a &lt; b');
      // Required: escaped sequences in the explanation line (Q1 → C).
      expect(html).toContain('a &lt; b &amp;&amp; c &gt; d');

      // Required: no raw `<` / `>` / `&` outside our own static markup.
      const allowedTags = ['<b>', '</b>', '<i>', '</i>'];
      let scrubbed = html;
      for (const t of allowedTags) scrubbed = scrubbed.split(t).join('');
      expect(scrubbed).not.toMatch(/[<>]/);
      expect(scrubbed.match(/&(?!amp;|lt;|gt;)/g)).toBeNull();
    });
  });

  describe('input validation', () => {
    it('throws if questions is not an array of 5', () => {
      const answers = makeAnswers(['A', 'A', 'A', 'A', 'A']);
      expect(() => render({ questions: [], answers })).toThrow(/questions/);
      expect(() => render({ questions: [makeQuestion(0)], answers })).toThrow(/questions/);
    });

    it('throws if answers is not an array of 5', () => {
      const questions = Array.from({ length: 5 }, (_, i) => makeQuestion(i));
      expect(() => render({ questions, answers: [] })).toThrow(/answers/);
    });
  });
});
