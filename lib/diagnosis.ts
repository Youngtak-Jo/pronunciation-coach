/**
 * Step 3 diagnosis pipeline orchestrator (SPEC §4).
 * Runs entirely client-side, calling the Azure / OpenAI server proxies.
 */
import type {
  AzureEval,
  DtwSegment,
  LlmResult,
  MatchedWord,
  TimeMapPoint,
  CartesiaWord,
} from './types';
import { prepareAudio } from './audio/wav';
import { analyzeAudio, type AudioAnalysis } from './audio/analysis';
import {
  alignTracks,
  buildMatchedWords,
  wordPairsForDTW,
  type AlignedTracks,
} from './alignment';
import { buildHybridDTW } from './dtw';
import { buildPayload } from './llm-payload';

export interface DiagnosisResult {
  sentence: string;
  overallScore: number;
  scoreBreakdown: {
    accuracy: number;
    fluency: number;
    completeness: number;
    prosody: number;
  };
  azureTarget: AzureEval;
  azureAttempt: AzureEval;
  targetAnalysis: AudioAnalysis;
  attemptAnalysis: AudioAnalysis;
  targetSamples: Float32Array;
  attemptSamples: Float32Array;
  sampleRate: number;
  targetDuration: number;
  attemptDuration: number;
  timeMap: TimeMapPoint[];
  segments: DtwSegment[];
  matchedWords: MatchedWord[];
  tracks: AlignedTracks;
  llm: LlmResult;
  payloadText: string;
}

export type ProgressFn = (message: string, pct: number) => void;

async function callAzure(wav: Blob, refText: string): Promise<AzureEval> {
  const fd = new FormData();
  fd.append('audio', wav, 'audio.wav');
  fd.append('refText', refText);
  const res = await fetch('/api/azure/assess', { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Azure 발음 평가 실패 (${res.status})`);
  }
  return res.json();
}

async function callOpenAI(
  payload: string,
  nativeLanguage: string,
): Promise<LlmResult> {
  const res = await fetch('/api/openai/prescribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, nativeLanguage }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `OpenAI 처방 생성 실패 (${res.status})`);
  }
  return res.json();
}

/** Execute the full target/attempt diagnosis pipeline. */
export async function runDiagnosis(params: {
  sentence: string;
  targetBlob: Blob;
  attemptBlob: Blob;
  targetWords: CartesiaWord[];
  nativeLanguage: string;
  onProgress?: ProgressFn;
}): Promise<DiagnosisResult> {
  const { sentence, targetBlob, attemptBlob, targetWords, nativeLanguage } =
    params;
  const progress: ProgressFn = params.onProgress ?? (() => {});

  // 1. decode + resample both clips to 16 kHz mono
  progress('오디오를 16kHz mono로 변환하는 중…', 8);
  const [targetPrep, attemptPrep] = await Promise.all([
    prepareAudio(targetBlob),
    prepareAudio(attemptBlob),
  ]);

  // 2. Azure Pronunciation Assessment on BOTH clips (SPEC §3)
  progress('Azure 발음 평가를 실행하는 중… (target + attempt)', 24);
  const [azureTarget, azureAttempt] = await Promise.all([
    callAzure(targetPrep.wav16k, sentence),
    callAzure(attemptPrep.wav16k, sentence),
  ]);

  if (azureAttempt.words.length === 0) {
    throw new Error(
      '음성에서 단어를 인식하지 못했어요. 더 또렷하게 다시 녹음해 주세요.',
    );
  }

  // 3. browser acoustic analysis — STFT + formants + pitch (SPEC §4.1 step 5)
  progress('브라우저에서 스펙트로그램·포먼트·피치를 추출하는 중…', 52);
  const targetAnalysis = analyzeAudio(
    targetPrep.samples16k,
    targetPrep.sampleRate,
  );
  const attemptAnalysis = analyzeAudio(
    attemptPrep.samples16k,
    attemptPrep.sampleRate,
  );

  // 4. word matching across the three time axes (SPEC §4.1 step 4)
  const tracks = alignTracks(
    sentence,
    targetWords,
    azureTarget.words,
    azureAttempt.words,
  );

  // 5. Hybrid Segmented DTW -> TimeMap (SPEC §4.2)
  progress('Hybrid Segmented DTW로 두 발화를 정렬하는 중…', 70);
  const pairs = wordPairsForDTW(tracks);
  const { timeMap, segments } = buildHybridDTW(
    targetAnalysis.spectrogram,
    attemptAnalysis.spectrogram,
    pairs,
    targetPrep.duration,
    attemptPrep.duration,
  );

  // 6. per-phoneme time-series slicing (SPEC §4.1 step 7)
  const matchedWords = buildMatchedWords(
    tracks,
    targetAnalysis.series,
    attemptAnalysis.series,
  );

  // 7. assemble LLM payload (SPEC §5) and request the prescription (SPEC §6)
  progress('AI 발음 코치가 물리적 교정 처방을 작성하는 중…', 86);
  const { text: payloadText } = buildPayload(sentence, matchedWords);
  const llm = await callOpenAI(payloadText, nativeLanguage);

  progress('진단 완료', 100);

  return {
    sentence,
    overallScore: Math.round(azureAttempt.pronScore),
    scoreBreakdown: {
      accuracy: Math.round(azureAttempt.accuracyScore),
      fluency: Math.round(azureAttempt.fluencyScore),
      completeness: Math.round(azureAttempt.completenessScore),
      prosody: Math.round(azureAttempt.prosodyScore),
    },
    azureTarget,
    azureAttempt,
    targetAnalysis,
    attemptAnalysis,
    targetSamples: targetPrep.samples16k,
    attemptSamples: attemptPrep.samples16k,
    sampleRate: targetPrep.sampleRate,
    targetDuration: targetPrep.duration,
    attemptDuration: attemptPrep.duration,
    timeMap,
    segments,
    matchedWords,
    tracks,
    llm,
    payloadText,
  };
}
