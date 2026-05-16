/**
 * LLM payload builder — SPEC §5.
 * Renders matched word/phoneme data as the structured text block the
 * pronunciation-coach LLM analyzes. Phonemes that are essentially perfect
 * (score 100 and duration within 30%) are excluded to reduce LLM load.
 */
import type { MatchedWord, PhonemeSeries, PhonemeSlice } from './types';

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function signed(n: number): string {
  const r = Math.round(n);
  return r >= 0 ? `+${r}` : `${r}`;
}

/** Should this phoneme be excluded from the payload? (SPEC §5 exclusion rule) */
function isPerfect(slice: PhonemeSlice): boolean {
  const tDur = slice.targetEnd - slice.targetStart;
  const aDur = slice.attemptEnd - slice.attemptStart;
  const pct = tDur > 1e-6 ? Math.abs(aDur - tDur) / tDur : 0;
  return slice.score >= 100 && pct <= 0.3;
}

/** Average each track of a phoneme series. */
function seriesAverages(s: PhonemeSeries) {
  return {
    f1: mean(s.f1),
    f2: mean(s.f2),
    f3: mean(s.f3),
    voicing: mean(s.voicing),
  };
}

/** Render the 10-row, 3-frame-downsampled time-series table. */
function timeSeriesTable(slice: PhonemeSlice): string {
  const lines: string[] = [];
  lines.push('[Time-Series Data]');
  lines.push(
    'TimeOffset | Amt F1 | Amt F2 | Amt F3 | Amt Voice | Tgt F1 | Tgt F2 | Tgt F3 | Tgt Voice',
  );
  for (let row = 0; row < 10; row++) {
    const i = Math.min(row * 3, slice.attempt.f1.length - 1);
    const offset = (row * 0.03).toFixed(2);
    const a = slice.attempt;
    const t = slice.target;
    lines.push(
      `${offset}s | ${Math.round(a.f1[i])} | ${Math.round(a.f2[i])} | ` +
        `${Math.round(a.f3[i])} | ${a.voicing[i].toFixed(2)} | ` +
        `${Math.round(t.f1[i])} | ${Math.round(t.f2[i])} | ` +
        `${Math.round(t.f3[i])} | ${t.voicing[i].toFixed(2)}`,
    );
  }
  return lines.join('\n');
}

/** Render one phoneme block. */
function phonemeBlock(slice: PhonemeSlice): string {
  const lines: string[] = [];
  lines.push(
    `--- Phoneme: /${slice.ipa}/  (InternalID: ${slice.phoneme}, ` +
      `Score: ${Math.round(slice.score)}%, Type: ${slice.type}) ---`,
  );

  // Perceived As — only when sound_like differs and score < 95
  if (
    slice.soundLike &&
    slice.soundLike.toLowerCase() !== slice.phoneme.toLowerCase() &&
    slice.score < 95
  ) {
    lines.push(`- Perceived As: /${slice.soundLike}/`);
  }

  // Duration
  const tDur = slice.targetEnd - slice.targetStart;
  const aDur = slice.attemptEnd - slice.attemptStart;
  const diffMs = Math.round((aDur - tDur) * 1000);
  const pct = tDur > 1e-6 ? Math.round(((aDur - tDur) / tDur) * 100) : 0;
  if (Math.abs(pct) > 5) {
    const dir = diffMs >= 0 ? 'long' : 'short';
    lines.push(
      `- Duration: Too ${dir} by ${Math.abs(diffMs)}ms (~${Math.abs(pct)}%)`,
    );
  } else {
    lines.push('- Duration: OK (within 5%)');
  }

  // Formant summary
  const a = seriesAverages(slice.attempt);
  const t = seriesAverages(slice.target);
  lines.push(
    `- Formant Summary: F1 ${signed(a.f1 - t.f1)}Hz, ` +
      `F2 ${signed(a.f2 - t.f2)}Hz, F3 ${signed(a.f3 - t.f3)}Hz`,
  );
  lines.push(
    `  (Attempt: F1=${Math.round(a.f1)} F2=${Math.round(a.f2)} ` +
      `F3=${Math.round(a.f3)})  (Target: F1=${Math.round(t.f1)} ` +
      `F2=${Math.round(t.f2)} F3=${Math.round(t.f3)})`,
  );
  lines.push('');
  lines.push(timeSeriesTable(slice));

  // Voicing analysis — consonants only
  if (slice.type === 'consonant') {
    let note: string;
    if (a.voicing < t.voicing - 0.12) {
      note = 'Too little voicing - needs vocal cord vibration';
    } else if (a.voicing > t.voicing + 0.12) {
      note = 'Too much voicing - should be more voiceless';
    } else {
      note = 'Voicing matches the target';
    }
    lines.push(
      `- Voicing Analysis: Attempt avg=${a.voicing.toFixed(2)}, ` +
        `Target avg=${t.voicing.toFixed(2)} (${note})`,
    );
  }

  return lines.join('\n');
}

export interface PayloadResult {
  text: string;
  /** number of words actually included after the exclusion rule. */
  includedWords: number;
}

/** Build the full SPEC §5 payload text from matched words. */
export function buildPayload(
  sentence: string,
  words: MatchedWord[],
): PayloadResult {
  const blocks: string[] = [];
  blocks.push(`[Pronunciation Assessment — Reference: "${sentence}"]`);
  blocks.push('');

  let includedWords = 0;
  for (const w of words) {
    const kept = w.phonemes.filter((p) => !isPerfect(p));
    if (kept.length === 0) continue;
    includedWords++;

    const wordLines: string[] = [];
    wordLines.push(`Word: "${w.word}"  (Word Score: ${Math.round(w.score)}%)`);
    for (const p of kept) {
      wordLines.push(phonemeBlock(p));
    }
    blocks.push(wordLines.join('\n'));
    blocks.push('');
  }

  if (includedWords === 0) {
    blocks.push(
      'All phonemes scored essentially perfect — no correction needed.',
    );
  }

  return { text: blocks.join('\n'), includedWords };
}
