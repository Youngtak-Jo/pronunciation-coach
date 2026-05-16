'use client';

/**
 * Step 3 — Diagnosis & Prescription (SPEC §1, §4, §7).
 * Runs the full timing-alignment pipeline, then reveals the six
 * visualization panels with a staggered entrance.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAppStore } from '@/lib/store';
import { runDiagnosis, type DiagnosisResult } from '@/lib/diagnosis';
import { OverallScore } from '@/components/panels/OverallScore';
import { DualWaveform } from '@/components/panels/DualWaveform';
import { DTWMatrix } from '@/components/panels/DTWMatrix';
import { VowelSpace } from '@/components/panels/VowelSpace';
import { Spectrogram } from '@/components/panels/Spectrogram';
import { CoachingCards } from '@/components/panels/CoachingCards';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
};

type Phase = 'running' | 'done' | 'error';

export function Step3Diagnosis() {
  const sentence = useAppStore((s) => s.sentence);
  const targetAudioBlob = useAppStore((s) => s.targetAudioBlob);
  const attemptAudioBlob = useAppStore((s) => s.attemptAudioBlob);
  const targetWords = useAppStore((s) => s.targetWords);
  const nativeLanguage = useAppStore((s) => s.nativeLanguage);
  const diagnosis = useAppStore((s) => s.diagnosis);
  const setDiagnosis = useAppStore((s) => s.setDiagnosis);
  const reset = useAppStore((s) => s.reset);

  const [phase, setPhase] = useState<Phase>(diagnosis ? 'done' : 'running');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('진단을 준비하는 중…');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(diagnosis);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (diagnosis) {
      setResult(diagnosis);
      setPhase('done');
      return;
    }
    if (!sentence || !targetAudioBlob || !attemptAudioBlob) {
      setError('녹음 데이터가 없습니다. Step 2부터 다시 진행해 주세요.');
      setPhase('error');
      return;
    }
    runDiagnosis({
      sentence,
      targetBlob: targetAudioBlob,
      attemptBlob: attemptAudioBlob,
      targetWords,
      nativeLanguage,
      onProgress: (m, p) => {
        setMessage(m);
        setProgress(p);
      },
    })
      .then((res) => {
        setResult(res);
        setDiagnosis(res);
        setPhase('done');
      })
      .catch((e: Error) => {
        setError(e.message);
        setPhase('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'running') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto w-full max-w-xl"
      >
        <Card>
          <CardContent className="flex flex-col items-center gap-5 py-12">
            <div className="relative">
              <Sparkles className="h-10 w-10 animate-pulse text-primary" />
            </div>
            <div className="w-full space-y-2">
              <Progress value={progress} />
              <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>{message}</span>
                <span>{Math.round(progress)}%</span>
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              두 오디오를 Azure 발음 평가에 보내고, 브라우저에서 포먼트·피치
              시계열을 추출한 뒤 Hybrid Segmented DTW로 정렬합니다.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (phase === 'error' || !result) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto w-full max-w-xl"
      >
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <AlertCircle className="h-9 w-9 text-destructive" />
            <p className="text-center text-sm text-destructive">
              {error || '진단에 실패했습니다.'}
            </p>
            <Button onClick={reset} variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Step 2부터 다시 하기
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto flex w-full max-w-5xl flex-col gap-5"
    >
      <motion.div variants={item}>
        <OverallScore result={result} />
      </motion.div>

      <motion.div variants={item}>
        <DualWaveform result={result} />
      </motion.div>

      <div className="grid gap-5 lg:grid-cols-2">
        <motion.div variants={item}>
          <DTWMatrix result={result} />
        </motion.div>
        <motion.div variants={item}>
          <VowelSpace result={result} />
        </motion.div>
      </div>

      <motion.div variants={item}>
        <Spectrogram result={result} />
      </motion.div>

      <motion.div variants={item}>
        <CoachingCards result={result} />
      </motion.div>

      <motion.div variants={item} className="flex justify-center pb-6 pt-2">
        <Button onClick={reset} variant="outline" size="lg" className="gap-2">
          <RotateCcw className="h-4 w-4" />
          새 문장으로 다시 연습하기
        </Button>
      </motion.div>
    </motion.div>
  );
}
