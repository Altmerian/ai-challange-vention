import { describe, it, expect } from 'vitest';
import { parse } from '../examinerOutputParser.js';

function makeQuestion(i, overrides = {}) {
  const base = {
    id: `Q${i + 1}`,
    question: `What is fact ${i + 1}?`,
    options: [
      { key: 'A', text: `Answer A for Q${i + 1}` },
      { key: 'B', text: `Answer B for Q${i + 1}` },
      { key: 'C', text: `Answer C for Q${i + 1}` },
      { key: 'D', text: `Answer D for Q${i + 1}` },
    ],
    correctAnswer: 'A',
    perOptionExplanation: {
      A: 'Correct because reason.',
      B: 'Wrong because reason B.',
      C: 'Wrong because reason C.',
      D: 'Wrong because reason D.',
    },
  };
  return { ...base, ...overrides };
}

function makeValid(overrides = {}) {
  const questions = Array.from({ length: 5 }, (_, i) => makeQuestion(i));
  return { questions, ...overrides };
}

describe('examinerOutputParser.parse', () => {
  describe('valid input', () => {
    it('accepts a well-formed 5-question Quiz JSON string', () => {
      const result = parse(JSON.stringify(makeValid()));
      expect(result.ok).toBe(true);
      expect(result.value.questions).toHaveLength(5);
      expect(result.value.questions[0].id).toBe('Q1');
      expect(result.value.questions[4].id).toBe('Q5');
    });

    it('also accepts an already-parsed object (defensive: chainLlm sometimes hands us one)', () => {
      const result = parse(makeValid());
      expect(result.ok).toBe(true);
      expect(result.value.questions[0].options).toHaveLength(4);
    });

    it('trims whitespace on question, option text, and explanation fields', () => {
      const v = makeValid();
      v.questions[0].question = '   Has whitespace?   ';
      v.questions[0].options[0].text = '   trim me   ';
      v.questions[0].perOptionExplanation.A = '   trimmed explain   ';
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(true);
      expect(result.value.questions[0].question).toBe('Has whitespace?');
      expect(result.value.questions[0].options[0].text).toBe('trim me');
      expect(result.value.questions[0].perOptionExplanation.A).toBe('trimmed explain');
    });

    it('normalises ids to Q1..Q5 by slot, even if the AI mislabels them', () => {
      const v = makeValid();
      v.questions[2].id = 'banana'; // AI got creative
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(true);
      expect(result.value.questions[2].id).toBe('Q3');
    });
  });

  describe('not-JSON failure', () => {
    it('rejects unparseable JSON with code "not_json"', () => {
      const result = parse('not json at all');
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('not_json');
    });

    it('rejects a truncated JSON string', () => {
      const result = parse('{"questions": [');
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('not_json');
    });
  });

  describe('not-object failure', () => {
    it('rejects a JSON array', () => {
      const result = parse('[1, 2, 3]');
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('not_object');
    });

    it('rejects a JSON literal null', () => {
      const result = parse('null');
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('not_object');
    });
  });

  describe('schema failures — questions array', () => {
    it('rejects missing questions array', () => {
      const result = parse(JSON.stringify({}));
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('schema');
      expect(result.error.message).toMatch(/questions/);
    });

    it('rejects fewer than 5 questions', () => {
      const v = makeValid();
      v.questions = v.questions.slice(0, 4);
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/5/);
    });

    it('rejects more than 5 questions', () => {
      const v = makeValid();
      v.questions.push(makeQuestion(5));
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/5/);
    });
  });

  describe('schema failures — options', () => {
    it('rejects fewer than 4 options', () => {
      const v = makeValid();
      v.questions[0].options = v.questions[0].options.slice(0, 3);
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/options/);
    });

    it('rejects more than 4 options', () => {
      const v = makeValid();
      v.questions[0].options.push({ key: 'E', text: 'extra' });
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/options/);
    });

    it('rejects an option with wrong key (B in slot 0)', () => {
      const v = makeValid();
      v.questions[0].options[0].key = 'B';
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/key must equal "A"/);
    });

    it('rejects an option with empty text', () => {
      const v = makeValid();
      v.questions[0].options[2].text = '   ';
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/text/);
    });

    it('rejects an option that is not an object', () => {
      const v = makeValid();
      v.questions[0].options[0] = 'A';
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('schema');
    });
  });

  describe('schema failures — correctAnswer', () => {
    it('rejects correctAnswer outside A|B|C|D', () => {
      const v = makeValid();
      v.questions[0].correctAnswer = 'E';
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/correctAnswer/);
    });

    it('rejects lowercase correctAnswer', () => {
      const v = makeValid();
      v.questions[0].correctAnswer = 'a';
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/correctAnswer/);
    });

    it('rejects a missing correctAnswer', () => {
      const v = makeValid();
      delete v.questions[0].correctAnswer;
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('schema');
    });
  });

  describe('schema failures — perOptionExplanation', () => {
    it('rejects a missing entry (C)', () => {
      const v = makeValid();
      delete v.questions[1].perOptionExplanation.C;
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/perOptionExplanation\.C/);
    });

    it('rejects an empty entry (B)', () => {
      const v = makeValid();
      v.questions[1].perOptionExplanation.B = '';
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/perOptionExplanation\.B/);
    });

    it('rejects perOptionExplanation as an array', () => {
      const v = makeValid();
      v.questions[1].perOptionExplanation = ['a', 'b', 'c', 'd'];
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('schema');
    });
  });

  describe('schema failures — question text', () => {
    it('rejects a non-string question', () => {
      const v = makeValid();
      v.questions[0].question = 42;
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('schema');
    });

    it('rejects an empty question', () => {
      const v = makeValid();
      v.questions[0].question = '   ';
      const result = parse(JSON.stringify(v));
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('schema');
    });
  });
});
