/**
 * POST /api/openai/demo
 * Demo-mode shortcut: skip Azure + audio pipeline, ask GPT to invent
 * plausible Azure-style scores and a tongue/jaw/lips articulation prescription
 * for a given sentence. Used by Step 3 to render a believable diagnosis fast.
 */
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { LlmIssue, LlmWord } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface DemoRequest {
  sentence?: string;
  nativeLanguage?: string;
}

interface DemoResponse {
  overallScore: number;
  scoreBreakdown: {
    accuracy: number;
    fluency: number;
    completeness: number;
    prosody: number;
  };
  words: LlmWord[];
  overallFeedback: string;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalize(raw: unknown, sentence: string): DemoResponse {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const breakdownRaw = (obj['scoreBreakdown'] ?? {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

  const accuracy = clamp(Math.round(num(breakdownRaw['accuracy'], 78)), 0, 100);
  const fluency = clamp(Math.round(num(breakdownRaw['fluency'], 80)), 0, 100);
  const completeness = clamp(
    Math.round(num(breakdownRaw['completeness'], 92)),
    0,
    100,
  );
  const prosody = clamp(Math.round(num(breakdownRaw['prosody'], 75)), 0, 100);

  const overallScore = clamp(
    Math.round(
      num(
        obj['overallScore'],
        Math.round(accuracy * 0.5 + fluency * 0.2 + completeness * 0.1 + prosody * 0.2),
      ),
    ),
    0,
    100,
  );

  const rawWords = Array.isArray(obj['words']) ? (obj['words'] as unknown[]) : [];
  const words: LlmWord[] = rawWords.map((w) => {
    const wo = (w ?? {}) as Record<string, unknown>;
    const rawIssues = Array.isArray(wo['issues'])
      ? (wo['issues'] as unknown[])
      : [];
    const issues: LlmIssue[] = rawIssues.map((is) => {
      const io = (is ?? {}) as Record<string, unknown>;
      const type = io['type'] === 'duration' ? 'duration' : 'pronunciation';
      const imp = io['importance'];
      const importance =
        imp === 'high' || imp === 'medium' || imp === 'low' ? imp : 'medium';
      return {
        phoneme: String(io['phoneme'] ?? ''),
        ipa: String(io['ipa'] ?? ''),
        type,
        diagnosis: String(io['diagnosis'] ?? ''),
        correction: String(io['correction'] ?? ''),
        importance,
      };
    });
    return {
      word: String(wo['word'] ?? ''),
      score: clamp(Math.round(num(wo['score'], 80)), 0, 100),
      issues,
    };
  });

  return {
    overallScore,
    scoreBreakdown: { accuracy, fluency, completeness, prosody },
    words: words.length > 0 ? words : [{ word: sentence, score: overallScore, issues: [] }],
    overallFeedback: String(obj['overallFeedback'] ?? ''),
  };
}

function buildDemoPrompt(nativeLanguage: string): string {
  const lang = nativeLanguage && nativeLanguage.trim() ? nativeLanguage : '한국어';
  return `You are an expert English pronunciation coach (Phonetician) specializing in helping ${lang} speakers. The user has just read an English sentence aloud. Without listening to actual audio, simulate a plausible Azure-style pronunciation assessment AND produce a "Physical Correction Prescription" for 2-4 of the most commonly-difficult words for ${lang} speakers in this sentence.

Generate believable, slightly varied numbers — do NOT always give the same score. Different sentences should produce different scores. Use ranges that feel realistic for an intermediate ${lang} learner:
- overallScore: 65-88
- accuracy: 60-90
- fluency: 65-92
- completeness: 88-100
- prosody: 60-88
- per-word score: 55-95 (vary across words; pick 2-4 words to flag as problematic with score < 85)

Pick the 2-4 words MOST LIKELY to challenge a ${lang} speaker (e.g. for Korean: words with /r/, /l/, /θ/, /ð/, /f/, /v/, /z/, /æ/, consonant clusters, schwa reduction). For each problematic word produce 1-2 issues.

Output STRICT JSON only:
{
  "overallScore": number,
  "scoreBreakdown": {
    "accuracy": number,
    "fluency": number,
    "completeness": number,
    "prosody": number
  },
  "words": [{
    "word": "actual word from the sentence",
    "score": number,
    "issues": [{
      "phoneme": "e.g. R, L, TH, AE, V",
      "ipa": "e.g. ɹ, l, θ, æ, v",
      "type": "duration" | "pronunciation",
      "diagnosis": "in ${lang}",
      "correction": "in ${lang}, 3 stages",
      "importance": "high" | "medium" | "low"
    }]
  }],
  "overallFeedback": "in ${lang}, 1-2 sentences"
}

Rules for diagnosis / correction (CRITICAL):
- Write "diagnosis" and "correction" in ${lang}.
- Describe ONLY physical articulation. MUST use concrete expressions about the tongue ("혀가"), jaw ("턱이"), and lips ("입술이").
- NEVER use technical terms like F1, F2, formant, Hz, spectrogram.
- "correction" must have 3 stages labeled ①②③: ① current physical state (what the speaker is probably doing), ② target physical state (what they should do), ③ a concrete physical drill or cue.
- Importance: "high" for sound-like mismatches or core sounds (th/r/l/v/f/æ); "medium" for moderate issues; "low" for minor polish.
- Include ${lang} L1 interference reasoning (e.g. for Korean: /r/-/l/ confusion, /θ/→/s/, /f/→/p/, /v/→/b/, lack of /æ/ contrast, final consonant deletion, vowel epenthesis after stops).
- Output ONLY valid JSON, no markdown, no commentary.`;
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요.' },
      { status: 500 },
    );
  }

  let body: DemoRequest;
  try {
    body = (await req.json()) as DemoRequest;
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 요청입니다.' }, { status: 400 });
  }

  const sentence = (body.sentence || '').trim();
  if (!sentence) {
    return NextResponse.json(
      { error: 'sentence(문장)가 필요합니다.' },
      { status: 400 },
    );
  }
  const nativeLanguage = (body.nativeLanguage || '한국어').trim() || '한국어';

  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildDemoPrompt(nativeLanguage) },
        { role: 'user', content: `Sentence: "${sentence}"` },
      ],
    });

    const content = completion.choices[0]?.message?.content || '{}';
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: 'OpenAI 응답을 JSON으로 파싱하지 못했습니다.' },
        { status: 502 },
      );
    }

    return NextResponse.json(normalize(parsed, sentence));
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json(
      { error: `OpenAI 처방 생성 실패: ${err.message || 'unknown error'}` },
      { status: err.status && err.status >= 400 ? err.status : 502 },
    );
  }
}
