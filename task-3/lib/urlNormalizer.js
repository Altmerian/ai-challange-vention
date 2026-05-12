// Canonicalises a URL so two visually-different strings that point at the
// same article collapse to the same dedup key in the `materials` Data Table.
//
// Rules (kept narrow — anything broader risks merging genuinely-distinct
// pages such as `?id=1` vs `?id=2`):
//
//   1. Scheme must be http or https.
//   2. Host is lowercased.
//   3. Fragment (`#...`) is dropped.
//   4. Trailing `/` on non-root paths is dropped (`/foo/` → `/foo`);
//      root path `/` is preserved.
//   5. Query string is preserved verbatim (no sort, no tracking-param strip).
//
// Implementation note: parsed via regex rather than `new URL(...)`. The
// WHATWG URL constructor is not exposed inside the n8n Code-node task-runner
// sandbox on n8n Cloud, so the parse node would silently fall back to the
// invalid-URL branch. Keeping lib + Code-node implementations identical
// means tests here cover both.
//
// Returns the normalised string, or `null` for any non-URL input.
// `\s` in the authority class rejects URLs with embedded whitespace (e.g.
// `https://exa mple.com`) — the WHATWG URL constructor would also reject them,
// but the sandbox-friendly regex path needs the guard added explicitly.
const URL_RE = /^(https?):\/\/([^\s/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i;
const AUTHORITY_RE = /^([^:]+)(?::(\d+))?$/;

export function normalize(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const m = trimmed.match(URL_RE);
  if (!m) return null;

  const auth = m[2].match(AUTHORITY_RE);
  if (!auth || !auth[1]) return null;

  const protocol = m[1].toLowerCase() + ':';
  const host = auth[1].toLowerCase();
  const port = auth[2] ? `:${auth[2]}` : '';

  let path = m[3] || '/';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  const search = m[4] || '';
  // m[5] is the fragment — intentionally dropped.

  return `${protocol}//${host}${port}${path}${search}`;
}

export default normalize;
