/**
 * Azure official 22-viseme schema (IDs 0-21).
 * Maps phoneme tokens (IPA + Azure SAPI) directly to viseme image IDs.
 * See SPEC §2.
 */

import { clamp } from './utils';

/** phoneme token -> viseme id. Built from the SPEC §2 table. */
const VISEME_TABLE: Record<string, number> = {};

function assign(id: number, tokens: string[]) {
  for (const t of tokens) VISEME_TABLE[t.toLowerCase()] = id;
}

// 0 silence
assign(0, ['sil', 'sp', 'spn', '', '-', 'silence']);
// 1 æ, ə, ʌ
assign(1, ['æ', 'ə', 'ʌ', 'ae', 'ax', 'ah']);
// 2 ɑ
assign(2, ['ɑ', 'ɑː', 'aa']);
// 3 ɔ
assign(3, ['ɔ', 'ɔː', 'ao']);
// 4 ɛ, ʊ
assign(4, ['ɛ', 'ʊ', 'eh', 'uh']);
// 5 ɝ
assign(5, ['ɝ', 'ɜː', 'ɜ', 'axr', 'er']);
// 6 j, i, ɪ
assign(6, ['j', 'i', 'ɪ', 'iː', 'y', 'iy', 'ih']);
// 7 w, u
assign(7, ['w', 'u', 'uː', 'uw']);
// 8 o
assign(8, ['o', 'oʊ', 'əʊ', 'ow']);
// 9 aʊ
assign(9, ['aʊ', 'aw']);
// 10 ɔɪ
assign(10, ['ɔɪ', 'oy']);
// 11 aɪ
assign(11, ['aɪ', 'ay']);
// 12 h
assign(12, ['h', 'hh']);
// 13 ɹ, r
assign(13, ['ɹ', 'r']);
// 14 l
assign(14, ['l', 'el']);
// 15 s, z
assign(15, ['s', 'z']);
// 16 ʃ, tʃ, dʒ, ʒ
assign(16, ['ʃ', 'tʃ', 'dʒ', 'ʒ', 'sh', 'ch', 'jh', 'zh']);
// 17 ð
assign(17, ['ð', 'dh']);
// 18 f, v
assign(18, ['f', 'v']);
// 19 d, t, n, θ
assign(19, ['d', 't', 'n', 'θ', 'th', 'dx', 'nx', 'en']);
// 20 k, g, ŋ
assign(20, ['k', 'g', 'ŋ', 'ng']);
// 21 p, b, m
assign(21, ['p', 'b', 'm', 'em']);

/**
 * Resolve a phoneme token to a viseme id (SPEC §2 mapping requirements):
 *  1. lowercase + trim, direct table lookup
 *  2. on miss, strip length marker `ː` and retry
 *  3. otherwise return 0 (silence)
 */
export function getVisemeId(phoneme: string | null | undefined): number {
  if (phoneme == null) return 0;
  const key = phoneme.toLowerCase().trim();
  if (key in VISEME_TABLE) return VISEME_TABLE[key];
  const stripped = key.replace(/ː/g, '');
  if (stripped in VISEME_TABLE) return VISEME_TABLE[stripped];
  // also strip stress/length digits sometimes attached by recognizers
  const bare = stripped.replace(/[0-9ˈˌ]/g, '');
  if (bare in VISEME_TABLE) return VISEME_TABLE[bare];
  return 0;
}

/** Clamp id into [0, 21] and return the image path. */
export function getVisemeImagePath(id: number): string {
  const safe = clamp(Math.round(id), 0, 21);
  return `/images/viseme/viseme-id-${safe}.jpg`;
}

/**
 * Crude letter-based viseme estimate, used in Step 2 where only Cartesia
 * word timestamps (no phonemes) are available. Maps a single character to a
 * representative mouth shape so the avatar animates plausibly during playback.
 */
const LETTER_VISEME: Record<string, number> = {
  a: 1, e: 4, i: 6, o: 8, u: 7,
  r: 13, l: 14, s: 15, z: 15, c: 20,
  h: 12, w: 7, y: 6, j: 16,
  f: 18, v: 18, d: 19, t: 19, n: 19,
  k: 20, g: 20, q: 20, x: 20,
  p: 21, b: 21, m: 21,
};

/**
 * Build a short viseme sequence for a word from its letters.
 * Consecutive duplicates are collapsed so the mouth visibly changes shape.
 */
export function wordToVisemeSequence(word: string): number[] {
  const seq: number[] = [];
  for (const ch of word.toLowerCase()) {
    const v = LETTER_VISEME[ch];
    if (v === undefined) continue;
    if (seq.length === 0 || seq[seq.length - 1] !== v) seq.push(v);
  }
  return seq.length > 0 ? seq : [1];
}
