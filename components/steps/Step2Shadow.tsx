'use client';

/**
 * Step 2 — Listen & Shadow (SPEC §1).
 * Synthesizes the cloned voice reading a random practice sentence, plays it
 * with viseme + word-highlight sync, then records the learner's attempt.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Play, Pause, RefreshCw, Volume2 } from 'lucide-react';
import { RecorderControls } from '@/components/RecorderControls';
import { VisemeAvatar } from '@/components/VisemeAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/lib/store';
import { pickRandomSentence } from '@/lib/sentences';
import { wordToVisemeSequence } from '@/lib/viseme';
import type { CartesiaWord } from '@/lib/types';

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

type Phase = 'generating' | 'ready' | 'error';

export function Step2Shadow() {
  const sentence = useAppStore((s) => s.sentence);
  const targetAudioUrl = useAppStore((s) => s.targetAudioUrl);
  const targetWords = useAppStore((s) => s.targetWords);
  const voiceId = useAppStore((s) => s.voiceId);
  const setSentence = useAppStore((s) => s.setSentence);
  const setTarget = useAppStore((s) => s.setTarget);
  const setAttempt = useAppStore((s) => s.setAttempt);
  const setStep = useAppStore((s) => s.setStep);

  const [phase, setPhase] = useState<Phase>('generating');
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hasListened, setHasListened] = useState(false);
  const [wordIdx, setWordIdx] = useState(-1);
  const [visemeId, setVisemeId] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  const generate = useCallback(
    async (text: string) => {
      setPhase('generating');
      setError(null);
      try {
        const res = await fetch('/api/cartesia/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: text, voiceId }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `TTS 실패 (${res.status})`);
        }
        const blob = base64ToBlob(data.audio as string, data.mime || 'audio/mpeg');
        setTarget(blob, (data.words as CartesiaWord[]) || []);
        setPhase('ready');
      } catch (e) {
        setError((e as Error).message);
        setPhase('error');
      }
    },
    [voiceId, setTarget],
  );

  // pick a sentence + synthesize once on mount
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (sentence && targetAudioUrl) {
      setPhase('ready');
      return;
    }
    const text = sentence || pickRandomSentence();
    if (!sentence) setSentence(text);
    void generate(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reroll = () => {
    const audio = audioRef.current;
    if (audio) audio.pause();
    setPlaying(false);
    setHasListened(false);
    setWordIdx(-1);
    setVisemeId(0);
    const text = pickRandomSentence();
    setSentence(text);
    void generate(text);
  };

  // viseme + word-highlight sync loop driven by audio.currentTime
  const syncLoop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.currentTime;
    let idx = -1;
    for (let i = 0; i < targetWords.length; i++) {
      if (t >= targetWords[i].start && t < targetWords[i].end) {
        idx = i;
        break;
      }
    }
    setWordIdx(idx);
    if (idx >= 0) {
      const w = targetWords[idx];
      const dur = Math.max(0.001, w.end - w.start);
      const prog = Math.min(0.999, Math.max(0, (t - w.start) / dur));
      const seq = wordToVisemeSequence(w.word);
      setVisemeId(seq[Math.min(seq.length - 1, Math.floor(prog * seq.length))]);
    } else {
      setVisemeId(0);
    }
    rafRef.current = requestAnimationFrame(syncLoop);
  }, [targetWords]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.currentTime = 0;
      void audio.play();
    }
  };

  const onPlay = () => {
    setPlaying(true);
    setHasListened(true);
    rafRef.current = requestAnimationFrame(syncLoop);
  };
  const onPauseOrEnd = () => {
    setPlaying(false);
    setWordIdx(-1);
    setVisemeId(0);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleAttempt = (blob: Blob) => {
    setAttempt(blob);
    setStep(3);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[260px_1fr]"
    >
      {/* Avatar */}
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">AI 입모양</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col items-center justify-center gap-3">
          <VisemeAvatar visemeId={visemeId} size={200} speaking={playing} />
          <p className="text-center text-xs text-muted-foreground">
            Azure 22-viseme 스키마로 입모양을 재생과 동기화합니다.
          </p>
        </CardContent>
      </Card>

      {/* Sentence + controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">
              Step 2 · 듣고 따라 읽기
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={reroll}
              disabled={phase === 'generating'}
              className="gap-1.5 text-muted-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              다른 문장
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            예시 음성을 듣고, 같은 문장을 똑같이 따라 읽어 녹음하세요.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* sentence with live word highlight */}
          <div className="rounded-xl border border-border bg-secondary/40 p-5 text-lg leading-relaxed">
            {phase === 'ready' && targetWords.length > 0 ? (
              <p className="flex flex-wrap gap-x-1.5 gap-y-1">
                {targetWords.map((w, i) => (
                  <span
                    key={`${w.word}-${i}`}
                    className={
                      i === wordIdx
                        ? 'rounded bg-primary px-1 text-primary-foreground transition-colors'
                        : 'rounded px-1 text-foreground/85 transition-colors'
                    }
                  >
                    {w.word}
                  </span>
                ))}
              </p>
            ) : (
              <p className="text-foreground/85">{sentence}</p>
            )}
          </div>

          {phase === 'generating' && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              클론 음성으로 예시 오디오를 합성하는 중…
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              <Button
                variant="outline"
                onClick={() => sentence && generate(sentence)}
              >
                다시 시도
              </Button>
            </div>
          )}

          {phase === 'ready' && (
            <>
              <div className="flex items-center gap-3">
                <Button onClick={togglePlay} variant="accent" className="gap-2">
                  {playing ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {playing ? '일시정지' : '예시 음성 듣기'}
                </Button>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Volume2 className="h-3.5 w-3.5" />
                  {hasListened ? '들었어요 — 이제 따라 읽어 보세요' : '먼저 들어보세요'}
                </span>
              </div>

              <div className="border-t border-border pt-4">
                <p className="mb-3 text-sm font-medium">
                  내 발음 녹음하기
                </p>
                <RecorderControls
                  maxSeconds={14}
                  minSeconds={1}
                  onComplete={handleAttempt}
                  onError={setError}
                  idleLabel="따라 읽기 녹음"
                  processingLabel="분석 준비 중…"
                />
              </div>
            </>
          )}

          {targetAudioUrl && (
            <audio
              ref={audioRef}
              src={targetAudioUrl}
              onPlay={onPlay}
              onPause={onPauseOrEnd}
              onEnded={onPauseOrEnd}
              hidden
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
