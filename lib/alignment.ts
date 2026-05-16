/**
 * Word matching + phoneme-level time-series slicing — SPEC §4.1 steps 4 & 7.
 *
 * Three time axes are reconciled:
 *  - Cartesia target word timestamps (seconds)
 *  - Azure PA on the target audio  (word + phoneme spans, seconds)
 *  - Azure PA on the attempt audio (word + phoneme spans + scores)
 * All derive from the same reference sentence, so words are matched by
 * reference position with a normalized-text guard.
 */
import type {
  AzureWord,
  CartesiaWord,
  FrameFeat,
  MatchedWord,
  PhonemeSeries,
  PhonemeSlice,
} from './types';
import { phonemeType, toIPA } from './phonemes';
import type { WordPair } from './dtw';

const PHONEME_FRAMES = 30; // SPEC §4.1 step 7: ~30 frames per phoneme

/** Lowercase + strip punctuation for robust word comparison. */
export function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Split a reference sentence into normalized word tokens. */
export function referenceWords(sentence: string): string[] {
  return sentence
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w.length > 0);
}

/**
 * Greedily align a list of items to the reference word sequence by
 * normalized text. Returns `aligned[i]` = item for reference word i, or null.
 */
function alignToReference<T>(
  refWords: string[],
  items: T[],
  getText: (item: T) => string,
): Array<T | null> {
  const aligned: Array<T | null> = new Array(refWords.length).fill(null);
  let ptr = 0;
  for (let i = 0; i < refWords.length; i++) {
    const target = refWords[i];
    // exact normalized match within a small look-ahead window
    let found = -1;
    for (let j = ptr; j < items.length && j <= ptr + 3; j++) {
      if (normalizeWord(getText(items[j])) === target) {
        found = j;
        break;
      }
    }
    // fall back to positional match if the texts simply diverged
    if (found === -1 && ptr < items.length) {
      found = ptr;
    }
    if (found >= 0) {
      aligned[i] = items[found];
      ptr = found + 1;
    }
  }
  return aligned;
}

/** Three reference-aligned word tracks. */
export interface AlignedTracks {
  refWords: string[];
  cartesia: Array<CartesiaWord | null>;
  azureTarget: Array<AzureWord | null>;
  azureAttempt: Array<AzureWord | null>;
}

/** Reconcile the three word lists against the reference sentence. */
export function alignTracks(
  sentence: string,
  cartesiaWords: CartesiaWord[],
  azureTargetWords: AzureWord[],
  azureAttemptWords: AzureWord[],
): AlignedTracks {
  const refWords = referenceWords(sentence);
  return {
    refWords,
    cartesia: alignToReference(refWords, cartesiaWords, (w) => w.word),
    azureTarget: alignToReference(refWords, azureTargetWords, (w) => w.word),
    azureAttempt: alignToReference(refWords, azureAttemptWords, (w) => w.word),
  };
}

/**
 * Word pairs feeding the Hybrid Segmented DTW: Cartesia target word interval
 * paired with the Azure attempt word interval.
 */
export function wordPairsForDTW(tracks: AlignedTracks): WordPair[] {
  const pairs: WordPair[] = [];
  for (let i = 0; i < tracks.refWords.length; i++) {
    const t = tracks.cartesia[i];
    const a = tracks.azureAttempt[i];
    if (!t || !a) continue;
    if (!(t.end > t.start) || !(a.end > a.start)) continue;
    pairs.push({
      word: t.word,
      tStart: t.start,
      tEnd: t.end,
      aStart: a.start,
      aEnd: a.end,
    });
  }
  return pairs;
}

/** Linearly resample a collected frame run to a fixed feature series. */
function resampleSeries(frames: FrameFeat[]): PhonemeSeries {
  const empty = (): PhonemeSeries => ({
    f1: new Array(PHONEME_FRAMES).fill(0),
    f2: new Array(PHONEME_FRAMES).fill(0),
    f3: new Array(PHONEME_FRAMES).fill(0),
    voicing: new Array(PHONEME_FRAMES).fill(0),
    f0: new Array(PHONEME_FRAMES).fill(0),
  });
  if (frames.length === 0) return empty();

  const out = empty();
  const L = frames.length;
  for (let k = 0; k < PHONEME_FRAMES; k++) {
    const pos = L === 1 ? 0 : (k * (L - 1)) / (PHONEME_FRAMES - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(L - 1, lo + 1);
    const frac = pos - lo;
    const lerp = (a: number, b: number) => a + (b - a) * frac;
    out.f1[k] = lerp(frames[lo].f1, frames[hi].f1);
    out.f2[k] = lerp(frames[lo].f2, frames[hi].f2);
    out.f3[k] = lerp(frames[lo].f3, frames[hi].f3);
    out.voicing[k] = lerp(frames[lo].voicing, frames[hi].voicing);
    out.f0[k] = lerp(frames[lo].f0, frames[hi].f0);
  }
  return out;
}

/** Slice a feature series to [start, end] and resample to PHONEME_FRAMES. */
function sliceSeries(
  series: FrameFeat[],
  start: number,
  end: number,
): PhonemeSeries {
  let frames = series.filter((f) => f.t >= start && f.t <= end);
  if (frames.length === 0 && series.length > 0) {
    // fall back to the single nearest frame
    const mid = (start + end) / 2;
    let best = series[0];
    let bestD = Infinity;
    for (const f of series) {
      const d = Math.abs(f.t - mid);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    frames = [best];
  }
  return resampleSeries(frames);
}

/**
 * Build per-word, per-phoneme aligned slices (SPEC §4.1 step 7).
 * `targetSeries` is the analysis of the Cartesia target audio; `attemptSeries`
 * the analysis of the learner recording.
 */
export function buildMatchedWords(
  tracks: AlignedTracks,
  targetSeries: FrameFeat[],
  attemptSeries: FrameFeat[],
): MatchedWord[] {
  const matched: MatchedWord[] = [];

  for (let i = 0; i < tracks.refWords.length; i++) {
    const tgt = tracks.azureTarget[i];
    const att = tracks.azureAttempt[i];
    const cart = tracks.cartesia[i];
    if (!att) continue;

    const slices: PhonemeSlice[] = [];
    const tgtPhones = tgt?.phonemes ?? [];
    const attPhones = att.phonemes ?? [];
    const count = Math.max(tgtPhones.length, attPhones.length);

    for (let k = 0; k < count; k++) {
      const tp = tgtPhones[k];
      const ap = attPhones[k];
      if (!ap) continue;
      const token = ap.phoneme || tp?.phoneme || '';
      const tStart = tp?.start ?? ap.start;
      const tEnd = tp?.end ?? ap.end;

      slices.push({
        phoneme: token,
        ipa: ap.ipa || toIPA(token),
        type: phonemeType(token),
        score: ap.score,
        soundLike: ap.soundLike,
        targetStart: tStart,
        targetEnd: tEnd,
        attemptStart: ap.start,
        attemptEnd: ap.end,
        target: sliceSeries(targetSeries, tStart, tEnd),
        attempt: sliceSeries(attemptSeries, ap.start, ap.end),
      });
    }

    matched.push({
      word: att.word || cart?.word || tracks.refWords[i],
      tStart: cart?.start ?? tgt?.start ?? att.start,
      tEnd: cart?.end ?? tgt?.end ?? att.end,
      aStart: att.start,
      aEnd: att.end,
      score: att.score,
      errorType: att.errorType,
      phonemes: slices,
    });
  }

  return matched;
}
