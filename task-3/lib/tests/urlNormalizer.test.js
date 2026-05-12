import { describe, it, expect } from 'vitest';
import { normalize } from '../urlNormalizer.js';

describe('urlNormalizer.normalize', () => {
  describe('valid inputs', () => {
    it('passes through a simple https URL unchanged', () => {
      expect(normalize('https://example.com/article')).toBe('https://example.com/article');
    });

    it('strips trailing slash from non-root paths', () => {
      expect(normalize('https://example.com/article/')).toBe('https://example.com/article');
      expect(normalize('https://example.com/a/b/c/')).toBe('https://example.com/a/b/c');
    });

    it('preserves the trailing slash on a bare-host URL', () => {
      // The URL parser canonicalises `https://example.com` to a path of `/`;
      // dropping that slash would produce `https://example.com` which still
      // re-parses correctly but loses the explicit `/`. We keep it.
      expect(normalize('https://example.com')).toBe('https://example.com/');
      expect(normalize('https://example.com/')).toBe('https://example.com/');
    });

    it('drops the fragment', () => {
      expect(normalize('https://example.com/article#section-1')).toBe('https://example.com/article');
      expect(normalize('https://example.com/article/#section-1')).toBe('https://example.com/article');
      expect(normalize('https://example.com/#frag')).toBe('https://example.com/');
    });

    it('lowercases the host', () => {
      expect(normalize('https://Example.COM/Article')).toBe('https://example.com/Article');
      expect(normalize('HTTPS://EXAMPLE.COM/article')).toBe('https://example.com/article');
    });

    it('preserves the path case (only the host is case-folded)', () => {
      expect(normalize('https://example.com/Path/CaseSensitive')).toBe('https://example.com/Path/CaseSensitive');
    });

    it('preserves the query string verbatim', () => {
      // Stripping/sorting params is intentionally out of scope — `?id=1` and
      // `?id=2` are distinct resources from the server's point of view.
      expect(normalize('https://example.com/article?id=42&ref=twitter')).toBe('https://example.com/article?id=42&ref=twitter');
      expect(normalize('https://example.com/article?ref=twitter&id=42')).toBe('https://example.com/article?ref=twitter&id=42');
    });

    it('preserves percent-encoded path segments', () => {
      expect(normalize('https://example.com/caf%C3%A9')).toBe('https://example.com/caf%C3%A9');
    });

    it('preserves an explicit non-default port', () => {
      expect(normalize('https://example.com:8443/article')).toBe('https://example.com:8443/article');
    });

    it('accepts http as well as https', () => {
      expect(normalize('http://example.com/article')).toBe('http://example.com/article');
    });

    it('combines all rules in one URL', () => {
      expect(normalize('  HTTPS://Example.COM/Article/?id=1#frag  ')).toBe('https://example.com/Article?id=1');
    });
  });

  describe('invalid inputs return null', () => {
    it('rejects empty / whitespace strings', () => {
      expect(normalize('')).toBeNull();
      expect(normalize('   ')).toBeNull();
    });

    it('rejects plain words without a scheme', () => {
      expect(normalize('not-a-url')).toBeNull();
      expect(normalize('example.com')).toBeNull();
    });

    it('rejects unsupported schemes', () => {
      expect(normalize('ftp://example.com/x')).toBeNull();
      expect(normalize('file:///etc/passwd')).toBeNull();
      expect(normalize('javascript:alert(1)')).toBeNull();
    });

    it('rejects non-string inputs', () => {
      expect(normalize(null)).toBeNull();
      expect(normalize(undefined)).toBeNull();
      expect(normalize(42)).toBeNull();
      expect(normalize({})).toBeNull();
      expect(normalize([])).toBeNull();
    });

    it('rejects URLs with whitespace in the authority', () => {
      // S3-MED-001: a space in the host slips past `[^/?#]+` but the URL
      // constructor (and Jina) would reject the percent-encoded result.
      // We classify these as invalid URLs (error #2) rather than wasting a
      // Jina round-trip to surface a 4xx.
      expect(normalize('https://exa mple.com/article')).toBeNull();
      expect(normalize('https://exa\tmple.com/article')).toBeNull();
      expect(normalize('https://exa\nmple.com/article')).toBeNull();
    });
  });
});
