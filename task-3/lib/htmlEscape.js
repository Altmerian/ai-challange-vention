// Escapes the three characters Telegram's HTML parse mode treats as markup.
// Order matters: `&` must be replaced first, otherwise `&` introduced by the
// `<`/`>` replacements would be double-encoded into `&amp;lt;` / `&amp;gt;`.
//
// Non-string inputs are coerced via String(value); null/undefined become "".
export function htmlEscape(value) {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default htmlEscape;
