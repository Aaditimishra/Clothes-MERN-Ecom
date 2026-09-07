/**
 * Short, URL-safe, sortable-ish identifiers.
 *
 * Ids are strings rather than Mongo ObjectIds because they appear in URLs, CSV
 * exports and support conversations. A 24-character hex blob is unreadable over
 * the phone; `prd_k3f9x2ab` is not. Uniqueness still comes from the random
 * suffix — the timestamp prefix only keeps insertion order roughly monotonic,
 * which keeps B-tree inserts local.
 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

const randomBlock = (length: number): string => {
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
};

export const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${randomBlock(6)}`;
