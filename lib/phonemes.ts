/**
 * Phoneme helpers: SAPI<->IPA rendering and vowel/consonant classification.
 * Azure Pronunciation Assessment returns SAPI-style phoneme tokens by default.
 */

/** SAPI phoneme token -> IPA symbol (best-effort, for display only). */
const SAPI_TO_IPA: Record<string, string> = {
  aa: 'ɑ', ae: 'æ', ah: 'ʌ', ao: 'ɔ', aw: 'aʊ', ax: 'ə', ay: 'aɪ',
  eh: 'ɛ', er: 'ɝ', ey: 'eɪ', ih: 'ɪ', iy: 'i', ow: 'oʊ', oy: 'ɔɪ',
  uh: 'ʊ', uw: 'u',
  b: 'b', ch: 'tʃ', d: 'd', dh: 'ð', dx: 'ɾ', f: 'f', g: 'g', hh: 'h',
  jh: 'dʒ', k: 'k', l: 'l', m: 'm', n: 'n', ng: 'ŋ', p: 'p', r: 'ɹ',
  s: 's', sh: 'ʃ', t: 't', th: 'θ', v: 'v', w: 'w', y: 'j', z: 'z',
  zh: 'ʒ', sil: '·', sp: '·',
};

/** Vowel phoneme tokens (SAPI + IPA). */
const VOWELS = new Set<string>([
  'aa', 'ae', 'ah', 'ao', 'aw', 'ax', 'ay', 'eh', 'er', 'ey', 'ih', 'iy',
  'ow', 'oy', 'uh', 'uw', 'axr',
  'ɑ', 'æ', 'ʌ', 'ɔ', 'aʊ', 'ə', 'aɪ', 'ɛ', 'ɝ', 'eɪ', 'ɪ', 'i', 'iː',
  'oʊ', 'ɔɪ', 'ʊ', 'u', 'uː', 'ɜ', 'ɜː', 'ɑː', 'ɔː', 'əʊ', 'o',
]);

function clean(token: string): string {
  return token.toLowerCase().trim().replace(/[0-9ˈˌ]/g, '');
}

/** Render a phoneme token as IPA (returns the token itself if unknown). */
export function toIPA(token: string): string {
  const key = clean(token);
  if (key in SAPI_TO_IPA) return SAPI_TO_IPA[key];
  const noLen = key.replace(/ː/g, '');
  if (noLen in SAPI_TO_IPA) return SAPI_TO_IPA[noLen];
  return token;
}

/** True when the phoneme token denotes a vowel. */
export function isVowel(token: string): boolean {
  const key = clean(token);
  if (VOWELS.has(key)) return true;
  return VOWELS.has(key.replace(/ː/g, ''));
}

/** 'vowel' | 'consonant' classification used in the LLM payload. */
export function phonemeType(token: string): 'vowel' | 'consonant' {
  return isVowel(token) ? 'vowel' : 'consonant';
}
