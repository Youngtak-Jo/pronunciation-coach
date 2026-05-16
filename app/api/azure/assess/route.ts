/**
 * POST /api/azure/assess
 * Server-side Azure Pronunciation Assessment proxy (SPEC §3, §4).
 * Accepts a 16 kHz mono WAV + reference text, returns word/phoneme scores,
 * timings (seconds) and n-best "perceived as" phonemes. Keys stay server-side.
 */
import { NextResponse } from 'next/server';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import type { AzureEval, AzurePhoneme, AzureWord } from '@/lib/types';
import { toIPA } from '@/lib/phonemes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

/** Azure offsets are in 100-nanosecond ticks; convert to seconds. */
const TICKS_PER_SECOND = 1e7;

interface WavData {
  pcm: Buffer;
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
}

/** Parse a PCM WAV buffer (fmt + data chunks). */
function parseWav(buf: Buffer): WavData {
  if (
    buf.length < 44 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('유효한 WAV 파일이 아닙니다.');
  }
  let offset = 12;
  let sampleRate = 16000;
  let bitsPerSample = 16;
  let channels = 1;
  let pcm: Buffer | null = null;

  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bitsPerSample = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      pcm = buf.subarray(body, Math.min(buf.length, body + size));
    }
    offset = body + size + (size % 2);
  }
  if (!pcm) throw new Error('WAV data 청크를 찾지 못했습니다.');
  return { pcm, sampleRate, bitsPerSample, channels };
}

type Json = Record<string, unknown>;

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Parse one phoneme node from the Azure detailed JSON. */
function parsePhoneme(p: Json): AzurePhoneme {
  const pa = (p['PronunciationAssessment'] as Json) || {};
  const token = String(p['Phoneme'] ?? '');
  let soundLike = token;
  const nbest = p['NBestPhonemes'];
  if (Array.isArray(nbest) && nbest.length > 0) {
    const top = nbest[0] as Json;
    if (top && top['Phoneme'] != null) soundLike = String(top['Phoneme']);
  }
  const offset = num(p['Offset']);
  const duration = num(p['Duration']);
  return {
    phoneme: token,
    ipa: toIPA(token),
    score: num(pa['AccuracyScore']),
    start: offset / TICKS_PER_SECOND,
    end: (offset + duration) / TICKS_PER_SECOND,
    soundLike,
  };
}

/** Parse one word node from the Azure detailed JSON. */
function parseWord(w: Json): AzureWord {
  const pa = (w['PronunciationAssessment'] as Json) || {};
  const offset = num(w['Offset']);
  const duration = num(w['Duration']);
  const phonemes = Array.isArray(w['Phonemes'])
    ? (w['Phonemes'] as Json[]).map(parsePhoneme)
    : [];
  return {
    word: String(w['Word'] ?? ''),
    start: offset / TICKS_PER_SECOND,
    end: (offset + duration) / TICKS_PER_SECOND,
    score: num(pa['AccuracyScore']),
    errorType: String(pa['ErrorType'] ?? 'None'),
    phonemes,
  };
}

/** Run Azure Pronunciation Assessment over one WAV clip. */
function assess(wav: WavData, refText: string): Promise<AzureEval> {
  const key = process.env.AZURE_SPEECH_KEY as string;
  const region = process.env.AZURE_SPEECH_REGION as string;

  return new Promise<AzureEval>((resolve, reject) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = 'en-US';
    speechConfig.outputFormat = sdk.OutputFormat.Detailed;

    const format = sdk.AudioStreamFormat.getWaveFormatPCM(
      wav.sampleRate,
      wav.bitsPerSample,
      wav.channels,
    );
    const pushStream = sdk.AudioInputStream.createPushStream(format);
    const pcmCopy = Uint8Array.from(wav.pcm);
    pushStream.write(pcmCopy.buffer as ArrayBuffer);
    pushStream.close();

    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

    // granularity=Phoneme, 100-point scale, miscue enabled (SPEC §3)
    const paConfig = new sdk.PronunciationAssessmentConfig(
      refText,
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      true,
    );
    paConfig.enableProsodyAssessment = true;
    paConfig.nbestPhonemeCount = 5;

    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    paConfig.applyTo(recognizer);

    const words: AzureWord[] = [];
    let recognizedText = '';
    // weighted accumulation of the per-segment overall scores
    let wAcc = 0;
    let sAccuracy = 0;
    let sFluency = 0;
    let sCompleteness = 0;
    let sProsody = 0;
    let sPron = 0;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try {
        recognizer.close();
      } catch {
        /* ignore */
      }
      fn();
    };

    recognizer.recognized = (_s, e) => {
      if (e.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
      const raw = e.result.properties.getProperty(
        sdk.PropertyId.SpeechServiceResponse_JsonResult,
      );
      if (!raw) return;
      let json: Json;
      try {
        json = JSON.parse(raw) as Json;
      } catch {
        return;
      }
      const nbestArr = json['NBest'];
      const nbest =
        Array.isArray(nbestArr) && nbestArr.length > 0
          ? (nbestArr[0] as Json)
          : null;
      if (!nbest) return;

      const display = String(nbest['Display'] ?? nbest['Lexical'] ?? '');
      if (display) {
        recognizedText += (recognizedText ? ' ' : '') + display;
      }

      const segWords = Array.isArray(nbest['Words'])
        ? (nbest['Words'] as Json[]).map(parseWord)
        : [];
      for (const w of segWords) words.push(w);

      const pa = (nbest['PronunciationAssessment'] as Json) || {};
      const weight = Math.max(1, segWords.length);
      wAcc += weight;
      sAccuracy += num(pa['AccuracyScore']) * weight;
      sFluency += num(pa['FluencyScore']) * weight;
      sCompleteness += num(pa['CompletenessScore']) * weight;
      sProsody += num(pa['ProsodyScore']) * weight;
      sPron += num(pa['PronScore']) * weight;
    };

    recognizer.canceled = (_s, e) => {
      if (e.reason === sdk.CancellationReason.Error) {
        finish(() =>
          reject(
            new Error(
              e.errorDetails || 'Azure 음성 인식이 오류로 취소되었습니다.',
            ),
          ),
        );
      } else {
        recognizer.stopContinuousRecognitionAsync();
      }
    };

    recognizer.sessionStopped = () => {
      recognizer.stopContinuousRecognitionAsync(
        () => {
          finish(() => {
            const w = wAcc || 1;
            resolve({
              words,
              accuracyScore: sAccuracy / w,
              fluencyScore: sFluency / w,
              completenessScore: sCompleteness / w,
              prosodyScore: sProsody / w,
              pronScore: sPron / w,
              recognizedText,
            });
          });
        },
        () => {
          finish(() => {
            const w = wAcc || 1;
            resolve({
              words,
              accuracyScore: sAccuracy / w,
              fluencyScore: sFluency / w,
              completenessScore: sCompleteness / w,
              prosodyScore: sProsody / w,
              pronScore: sPron / w,
              recognizedText,
            });
          });
        },
      );
    };

    recognizer.startContinuousRecognitionAsync(undefined, (err) => {
      finish(() => reject(new Error(String(err))));
    });
  });
}

export async function POST(req: Request) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    return NextResponse.json(
      {
        error:
          'AZURE_SPEECH_KEY / AZURE_SPEECH_REGION이 설정되지 않았습니다. .env.local을 확인하세요.',
      },
      { status: 500 },
    );
  }

  let wavBuf: Buffer;
  let refText: string;
  try {
    const form = await req.formData();
    const audio = form.get('audio');
    refText = String(form.get('refText') ?? '').trim();
    if (!(audio instanceof Blob)) {
      return NextResponse.json(
        { error: 'audio(WAV) 파일이 필요합니다.' },
        { status: 400 },
      );
    }
    if (!refText) {
      return NextResponse.json(
        { error: 'refText(참조 문장)가 필요합니다.' },
        { status: 400 },
      );
    }
    wavBuf = Buffer.from(await audio.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: '요청 본문을 읽지 못했습니다.' },
      { status: 400 },
    );
  }

  let wav: WavData;
  try {
    wav = parseWav(wavBuf);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    const result = await assess(wav, refText);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: `Azure 발음 평가 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
