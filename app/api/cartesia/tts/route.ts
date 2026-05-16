/**
 * POST /api/cartesia/tts
 * Server-side proxy for Cartesia streaming TTS with word timestamps
 * (SPEC §1 Step 2, §3). Accumulates the SSE stream and returns the full
 * MP3 (base64) plus per-word timestamps.
 */
import { NextResponse } from 'next/server';
import type { CartesiaWord } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CARTESIA_VERSION = '2024-06-10';
const DEMO_SENTINEL = '__demo__';

interface TtsRequest {
  transcript?: string;
  voiceId?: string;
}

export async function POST(req: Request) {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'CARTESIA_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요.' },
      { status: 500 },
    );
  }

  let body: TtsRequest;
  try {
    body = (await req.json()) as TtsRequest;
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 요청입니다.' }, { status: 400 });
  }

  const transcript = (body.transcript || '').trim();
  if (!transcript) {
    return NextResponse.json(
      { error: 'transcript가 필요합니다.' },
      { status: 400 },
    );
  }

  // Demo fallback: an absent / sentinel voiceId uses DEMO_VOICE_ID (SPEC §8).
  let voiceId = body.voiceId;
  if (!voiceId || voiceId === DEMO_SENTINEL) {
    voiceId = process.env.DEMO_VOICE_ID;
  }
  if (!voiceId) {
    return NextResponse.json(
      {
        error:
          'voiceId가 없습니다. Step 1에서 음성을 복제하거나 DEMO_VOICE_ID를 설정하세요.',
      },
      { status: 400 },
    );
  }

  const payload = {
    model_id: 'sonic-english',
    transcript,
    voice: { mode: 'id', id: voiceId },
    language: 'en',
    output_format: {
      container: 'mp3',
      sample_rate: 44100,
      bit_rate: 128000,
    },
    add_timestamps: true,
  };

  let res: Response;
  try {
    res = await fetch('https://api.cartesia.ai/tts/sse', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Cartesia-Version': CARTESIA_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Cartesia 연결 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    let msg = `Cartesia TTS 실패 (${res.status})`;
    try {
      const j = JSON.parse(errText);
      msg = j.error || j.message || msg;
    } catch {
      if (errText) msg = errText.slice(0, 300);
    }
    return NextResponse.json({ error: msg }, { status: res.status || 502 });
  }

  // Accumulate the SSE stream.
  const audioParts: Buffer[] = [];
  const words: CartesiaWord[] = [];
  let streamError: string | null = null;

  const fullText = await res.text();
  for (const rawLine of fullText.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) continue;
    const jsonStr = line.slice(5).trim();
    if (!jsonStr || jsonStr === '[DONE]') continue;

    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(jsonStr);
    } catch {
      continue;
    }

    const type = evt['type'];
    if (type === 'chunk' && typeof evt['data'] === 'string') {
      audioParts.push(Buffer.from(evt['data'] as string, 'base64'));
    } else if (type === 'timestamps') {
      const wt = evt['word_timestamps'] as
        | { words?: string[]; start?: number[]; end?: number[] }
        | undefined;
      if (wt && Array.isArray(wt.words)) {
        for (let i = 0; i < wt.words.length; i++) {
          words.push({
            word: wt.words[i],
            start: wt.start?.[i] ?? 0,
            end: wt.end?.[i] ?? 0,
          });
        }
      }
    } else if (type === 'error') {
      streamError =
        (evt['error'] as string) ||
        (evt['message'] as string) ||
        'Cartesia 스트림 오류';
    }
  }

  if (streamError) {
    return NextResponse.json({ error: streamError }, { status: 502 });
  }
  if (audioParts.length === 0) {
    return NextResponse.json(
      { error: 'Cartesia가 오디오를 반환하지 않았습니다.' },
      { status: 502 },
    );
  }

  const audio = Buffer.concat(audioParts);
  return NextResponse.json({
    audio: audio.toString('base64'),
    mime: 'audio/mpeg',
    words,
  });
}
