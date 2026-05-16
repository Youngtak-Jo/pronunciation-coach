/**
 * POST /api/openai/prescribe
 * Server-side OpenAI proxy producing the "Physical Correction Prescription"
 * (SPEC §5 payload in, §6 JSON out). OPENAI_API_KEY stays server-side.
 */
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { buildSystemPrompt } from '@/lib/llm-prompt';
import type { LlmIssue, LlmResult, LlmWord } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

interface PrescribeRequest {
  payload?: string;
  nativeLanguage?: string;
}

/** Coerce arbitrary parsed JSON into a well-formed LlmResult. */
function normalize(raw: unknown): LlmResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
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
      score: typeof wo['score'] === 'number' ? (wo['score'] as number) : 0,
      issues,
    };
  });

  return {
    words,
    overallFeedback: String(obj['overallFeedback'] ?? ''),
  };
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요.' },
      { status: 500 },
    );
  }

  let body: PrescribeRequest;
  try {
    body = (await req.json()) as PrescribeRequest;
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 요청입니다.' }, { status: 400 });
  }

  const payload = (body.payload || '').trim();
  if (!payload) {
    return NextResponse.json(
      { error: 'payload(분석 데이터)가 필요합니다.' },
      { status: 400 },
    );
  }
  const nativeLanguage = (body.nativeLanguage || '한국어').trim() || '한국어';

  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(nativeLanguage) },
        { role: 'user', content: payload },
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

    return NextResponse.json(normalize(parsed));
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json(
      { error: `OpenAI 처방 생성 실패: ${err.message || 'unknown error'}` },
      { status: err.status && err.status >= 400 ? err.status : 502 },
    );
  }
}
