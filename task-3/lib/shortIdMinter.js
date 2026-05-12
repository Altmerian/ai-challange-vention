// Deterministically derives an 8-character base36 `short_id` from a row's
// primary id. The row id is whatever the `materials` Data Table assigns at
// insert (string or number); base36 keeps it URL-safe and human-readable.
//
// The hash is djb2 (Bernstein) — fast, zero deps, good enough for an opaque
// 8-char handle. Collisions are vanishingly unlikely at MVP scale (a single
// chat's library is on the order of dozens of rows). Not for cryptographic use.
export function mint(rowId) {
  const s = rowId === null || rowId === undefined ? '' : String(rowId);
  // djb2 — produces a 32-bit unsigned integer
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  // Pad-and-slice to guarantee exactly 8 characters. Short hashes pad with
  // leading zeros; longer base36 representations are slice()'d.
  return h.toString(36).padStart(8, '0').slice(0, 8);
}

export default mint;
