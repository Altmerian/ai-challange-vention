import { describe, it, expect } from 'vitest';
import { parse } from '../teacherOutputParser.js';

const validSummary = {
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

describe('teacherOutputParser.parse', () => {
  describe('valid input', () => {
    it('accepts a well-formed Summary JSON string and returns it normalized', () => {
      const result = parse(JSON.stringify(validSummary));
      expect(result.ok).toBe(true);
      expect(result.value).toEqual(validSummary);
    });

    it('also accepts an already-parsed object (defensive: lmChatOpenAi sometimes hands us one)', () => {
      const result = parse(validSummary);
      expect(result.ok).toBe(true);
      expect(result.value.title).toBe('React Hooks Guide');
    });

    it('trims whitespace on string fields', () => {
      const messy = {
        ...validSummary,
        title: '   React Hooks Guide   ',
        mainConcepts: ['  useState  ', 'useEffect', 'useMemo'],
      };
      const result = parse(JSON.stringify(messy));
      expect(result.ok).toBe(true);
      expect(result.value.title).toBe('React Hooks Guide');
      expect(result.value.mainConcepts[0]).toBe('useState');
    });

    it('accepts the boundary counts (3 mainConcepts, 5 keyPoints; 5 mainConcepts, 7 keyPoints)', () => {
      const low = { ...validSummary, mainConcepts: ['a', 'b', 'c'], keyPoints: ['1', '2', '3', '4', '5'] };
      const high = {
        ...validSummary,
        mainConcepts: ['a', 'b', 'c', 'd', 'e'],
        keyPoints: ['1', '2', '3', '4', '5', '6', '7'],
      };
      expect(parse(JSON.stringify(low)).ok).toBe(true);
      expect(parse(JSON.stringify(high)).ok).toBe(true);
    });
  });

  describe('not-JSON failure', () => {
    it('rejects unparseable JSON with code "not_json"', () => {
      const result = parse('this is not JSON');
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('not_json');
    });

    it('rejects a trailing-comma half-JSON string', () => {
      const result = parse('{"title": "x",');
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

    it('rejects a JSON literal string', () => {
      const result = parse('"hello"');
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('not_object');
    });
  });

  describe('schema failures', () => {
    it('rejects missing title', () => {
      const bad = { ...validSummary, title: undefined };
      const result = parse(JSON.stringify(bad));
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('schema');
      expect(result.error.message).toMatch(/title/);
    });

    it('rejects empty title', () => {
      const bad = { ...validSummary, title: '   ' };
      const result = parse(JSON.stringify(bad));
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('schema');
    });

    it('rejects mainConcepts < 3', () => {
      const bad = { ...validSummary, mainConcepts: ['a', 'b'] };
      const result = parse(JSON.stringify(bad));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/mainConcepts/);
    });

    it('rejects mainConcepts > 5', () => {
      const bad = { ...validSummary, mainConcepts: ['a', 'b', 'c', 'd', 'e', 'f'] };
      const result = parse(JSON.stringify(bad));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/mainConcepts/);
    });

    it('rejects keyPoints < 5', () => {
      const bad = { ...validSummary, keyPoints: ['1', '2', '3', '4'] };
      const result = parse(JSON.stringify(bad));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/keyPoints/);
    });

    it('rejects keyPoints > 7', () => {
      const bad = { ...validSummary, keyPoints: ['1', '2', '3', '4', '5', '6', '7', '8'] };
      const result = parse(JSON.stringify(bad));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/keyPoints/);
    });

    it('rejects mainConcepts containing a non-string element', () => {
      const bad = { ...validSummary, mainConcepts: ['a', 'b', 42] };
      const result = parse(JSON.stringify(bad));
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('schema');
    });

    it('rejects mainConcepts containing an empty string', () => {
      const bad = { ...validSummary, mainConcepts: ['a', '', 'c'] };
      const result = parse(JSON.stringify(bad));
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('schema');
    });

    it('rejects a difficulty outside the enum', () => {
      const bad = { ...validSummary, difficulty: 'easy' };
      const result = parse(JSON.stringify(bad));
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/difficulty/);
    });

    it('rejects a missing difficulty', () => {
      const bad = { ...validSummary, difficulty: undefined };
      const result = parse(JSON.stringify(bad));
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('schema');
    });
  });
});
