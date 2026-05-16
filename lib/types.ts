/** Shared data types across the timing-alignment + diagnosis pipeline. */

/** Cartesia TTS word timestamp (seconds). */
export interface CartesiaWord {
  word: string;
  start: number;
  end: number;
}

/** A single phoneme from Azure Pronunciation Assessment (times in seconds). */
export interface AzurePhoneme {
  phoneme: string; // Azure internal phoneme token (also used as InternalID)
  ipa: string; // best-effort IPA rendering for display
  score: number; // 0-100 accuracy
  start: number; // seconds
  end: number; // seconds
  soundLike: string; // top n-best alternative phoneme ("perceived as")
}

/** A word from Azure Pronunciation Assessment (times in seconds). */
export interface AzureWord {
  word: string;
  start: number; // word.span.start
  end: number; // word.span.end
  score: number; // accuracy score 0-100
  errorType: string; // None | Mispronunciation | Omission | Insertion
  phonemes: AzurePhoneme[];
}

/** Full Azure PA result for one audio file. */
export interface AzureEval {
  words: AzureWord[];
  pronScore: number;
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  prosodyScore: number;
  recognizedText: string;
}

/** Per-STFT-frame acoustic feature vector. */
export interface FrameFeat {
  t: number; // frame center time, seconds
  f0: number; // fundamental frequency, Hz (0 = unvoiced)
  f1: number; // first formant, Hz
  f2: number; // second formant, Hz
  f3: number; // third formant, Hz
  voicing: number; // voicing confidence 0..1
}

/** One point on the target<->attempt time map. */
export interface TimeMapPoint {
  targetTime: number;
  attemptTime: number;
}

/** Local DTW result retained for one matched word (for the heatmap panel). */
export interface DtwSegment {
  word: string;
  tStart: number;
  tEnd: number;
  aStart: number;
  aEnd: number;
  /** local cosine-distance cost matrix, matrix[i][j], i over target frames. */
  matrix: number[][];
  /** optimal warping path as [targetIdx, attemptIdx] pairs. */
  path: Array<[number, number]>;
  /** Sakoe-Chiba band width actually used (in cells). */
  band: number;
}

/** A simple {word, start, end} span (seconds). */
export interface WordSpan {
  word: string;
  start: number;
  end: number;
}

/** Downsampled waveform envelope for the Dual Waveform panel. */
export interface WaveformData {
  /** peak amplitude per bucket, normalized to 0..1. */
  peaks: number[];
  duration: number;
}

/** A vowel observed in both target and attempt — for the Vowel Space scatter. */
export interface VowelPair {
  phoneme: string;
  ipa: string;
  word: string;
  targetF1: number;
  targetF2: number;
  attemptF1: number;
  attemptF2: number;
}

/** A resampled phoneme-length time series (fixed frame count). */
export interface PhonemeSeries {
  f1: number[];
  f2: number[];
  f3: number[];
  voicing: number[];
  f0: number[];
}

/** Per-phoneme aligned slice (target vs attempt). */
export interface PhonemeSlice {
  phoneme: string;
  ipa: string;
  type: 'vowel' | 'consonant';
  score: number;
  soundLike: string;
  targetStart: number;
  targetEnd: number;
  attemptStart: number;
  attemptEnd: number;
  target: PhonemeSeries;
  attempt: PhonemeSeries;
}

/** A word matched across Cartesia target / Azure target / Azure attempt. */
export interface MatchedWord {
  word: string;
  /** target word interval (Cartesia, seconds) */
  tStart: number;
  tEnd: number;
  /** attempt word interval (Azure attempt, seconds) */
  aStart: number;
  aEnd: number;
  /** attempt accuracy score */
  score: number;
  errorType: string;
  phonemes: PhonemeSlice[];
}

/** LLM prescription output (SPEC §6). */
export interface LlmIssue {
  phoneme: string;
  ipa: string;
  type: 'duration' | 'pronunciation';
  diagnosis: string;
  correction: string;
  importance: 'high' | 'medium' | 'low';
}

export interface LlmWord {
  word: string;
  score: number;
  issues: LlmIssue[];
}

export interface LlmResult {
  words: LlmWord[];
  overallFeedback: string;
}
