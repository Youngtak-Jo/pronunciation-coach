'use client';

/**
 * Step 1 — Voice Clone (SPEC §1).
 * Records ~10 s of English speech, sends it to the Cartesia clone proxy,
 * and stores the returned voice id in memory.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Quote } from 'lucide-react';
import { RecorderControls } from '@/components/RecorderControls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/lib/store';
import { blobToWavNative } from '@/lib/audio/wav';

const CLONE_PASSAGE =
  "Hello! I'm learning English pronunciation today. I will read a few " +
  'sentences out loud so the app can learn exactly how my voice sounds. ' +
  "Let's begin practicing together right now.";

export function Step1Clone() {
  const setVoiceId = useAppStore((s) => s.setVoiceId);
  const setStep = useAppStore((s) => s.setStep);

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleComplete = async (blob: Blob) => {
    setError(null);
    setProcessing(true);
    try {
      const wav = await blobToWavNative(blob);
      const fd = new FormData();
      fd.append('audio', wav, 'clone.wav');
      const res = await fetch('/api/cartesia/clone', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Voice clone 실패 (${res.status})`);
      }
      setVoiceId(data.voiceId as string);
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
      setProcessing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto w-full max-w-2xl"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            Step 1 · 내 목소리 복제하기
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            아래 문단을 또렷하게 약 10초간 읽어 주세요. 이 목소리로 학습용 예시
            음성이 합성됩니다.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="relative rounded-xl border border-border bg-secondary/40 p-5">
            <Quote className="absolute -top-2.5 left-4 h-5 w-5 rounded bg-card p-0.5 text-primary" />
            <p className="text-[15px] leading-relaxed text-foreground/90">
              {CLONE_PASSAGE}
            </p>
          </div>

          <RecorderControls
            maxSeconds={10}
            minSeconds={4}
            onComplete={handleComplete}
            onError={setError}
            processing={processing}
            idleLabel="10초 녹음 시작"
            processingLabel="음성 복제 중…"
          />

          {processing && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" />
              녹음 완료 — Cartesia로 음성을 복제하고 있어요.
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            팁: 환경변수 <code className="text-primary">DEMO_VOICE_ID</code>를
            설정하고 주소에 <code className="text-primary">?demo=1</code>을 붙이면
            이 단계를 건너뜁니다.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
