/**
 * POST /api/cartesia/clone
 * Server-side proxy for Cartesia voice cloning (SPEC §1 Step 1, §3).
 * The CARTESIA_API_KEY never reaches the client.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CARTESIA_VERSION = '2024-06-10';

export async function POST(req: Request) {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'CARTESIA_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요.' },
      { status: 500 },
    );
  }

  let audio: Blob;
  try {
    const inForm = await req.formData();
    const file = inForm.get('audio');
    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: '녹음 오디오(audio 필드)가 필요합니다.' },
        { status: 400 },
      );
    }
    audio = file;
  } catch {
    return NextResponse.json(
      { error: '요청 본문을 읽지 못했습니다.' },
      { status: 400 },
    );
  }

  // Build the multipart body for Cartesia. Content-Type is intentionally NOT
  // set manually — fetch adds the multipart boundary itself (SPEC §3).
  const outForm = new FormData();
  outForm.append('clip', audio, 'clip.wav');
  outForm.append('name', 'Pronunciation Coach Learner');
  outForm.append('description', 'Cloned learner voice for shadowing practice');
  outForm.append('language', 'en');
  outForm.append('mode', 'similarity');

  let res: Response;
  try {
    res = await fetch('https://api.cartesia.ai/voices/clone', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Cartesia-Version': CARTESIA_VERSION,
      },
      body: outForm,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Cartesia 연결 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg =
      (data as { error?: string; message?: string }).error ||
      (data as { message?: string }).message ||
      `Cartesia voice clone 실패 (${res.status})`;
    return NextResponse.json({ error: msg }, { status: res.status });
  }

  const obj = data as { id?: string; voice?: { id?: string } };
  const voiceId = obj.id || obj.voice?.id;
  if (!voiceId) {
    return NextResponse.json(
      { error: 'Cartesia 응답에서 voice id를 찾지 못했습니다.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ voiceId });
}
