'use client';

/**
 * Step 3 — Demo Diagnosis & Prescription.
 * Demo mode: skip the audio-analysis pipeline. Send the sentence the user
 * read in Step 2 to GPT, which fabricates plausible Azure-style scores and
 * a tongue/jaw/lips articulation prescription.
 */
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAppStore } from '@/lib/store';
import type { DiagnosisResult } from '@/lib/diagnosis';
import type { LlmWord } from '@/lib/types';
import { OverallScore } from '@/components/panels/OverallScore';
import { CoachingCards } from '@/components/panels/CoachingCards';

class PanelBoundary extends Component<
  { name: string; children: ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error) {
    console.error(`[panel:${this.props.name}]`, err);
  }
  render() {
    if (this.state.err) {
      return (
        <Card>
          <CardContent className="flex items-start gap-3 py-5 text-sm">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">
                {this.props.name} 패널 렌더 오류
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {this.state.err.message}
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

type Phase = 'running' | 'done' | 'error';

interface DemoApiResponse {
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

/**
 * Build a minimal DiagnosisResult shape so OverallScore + CoachingCards
 * can render against their existing typed props. Audio-pipeline fields are
 * empty in demo mode and not read by those two panels.
 */
function toDiagnosisResult(
  sentence: string,
  demo: DemoApiResponse,
): DiagnosisResult {
  const empty = {
    words: [],
    pronScore: demo.overallScore,
    accuracyScore: demo.scoreBreakdown.accuracy,
    fluencyScore: demo.scoreBreakdown.fluency,
    completenessScore: demo.scoreBreakdown.completeness,
    prosodyScore: demo.scoreBreakdown.prosody,
    recognizedText: sentence,
  };
  const emptyAnalysis = {
    frames: [],
    series: [],
    spectrogram: {
      times: [],
      freqs: [],
      data: new Float32Array(0),
      width: 0,
      height: 0,
      minDb: -90,
      maxDb: 0,
    },
    waveform: { peaks: [], duration: 0 },
  };
  const emptyTracks = {
    cartesia: [],
    azureTarget: [],
    azureAttempt: [],
    pairs: [],
  };
  // The two panels we render only consume: sentence, overallScore,
  // scoreBreakdown, llm.words, llm.overallFeedback, matchedWords.
  // Everything else is set to a typed-but-empty stub for the demo.
  return {
    sentence,
    overallScore: demo.overallScore,
    scoreBreakdown: demo.scoreBreakdown,
    azureTarget: empty,
    azureAttempt: empty,
    targetAnalysis: emptyAnalysis as unknown as DiagnosisResult['targetAnalysis'],
    attemptAnalysis: emptyAnalysis as unknown as DiagnosisResult['attemptAnalysis'],
    targetSamples: new Float32Array(0),
    attemptSamples: new Float32Array(0),
    sampleRate: 16000,
    targetDuration: 0,
    attemptDuration: 0,
    timeMap: [],
    segments: [],
    matchedWords: [],
    tracks: emptyTracks as unknown as DiagnosisResult['tracks'],
    llm: { words: demo.words, overallFeedback: demo.overallFeedback },
    payloadText: '',
  };
}

async function callDemo(
  sentence: string,
  nativeLanguage: string,
): Promise<DemoApiResponse> {
  const res = await fetch('/api/openai/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentence, nativeLanguage }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `진단 생성 실패 (${res.status})`);
  }
  return res.json();
}

export function Step3Diagnosis() {
  const sentence = useAppStore((s) => s.sentence);
  const nativeLanguage = useAppStore((s) => s.nativeLanguage);
  const diagnosis = useAppStore((s) => s.diagnosis);
  const setDiagnosis = useAppStore((s) => s.setDiagnosis);
  const reset = useAppStore((s) => s.reset);

  const [phase, setPhase] = useState<Phase>(diagnosis ? 'done' : 'running');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('AI 발음 코치가 분석을 준비하는 중…');
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
    if (!sentence) {
      setError('읽은 문장이 없습니다. Step 2부터 다시 진행해 주세요.');
      setPhase('error');
      return;
    }

    // Fake a progress animation while GPT thinks.
    const steps: Array<[string, number, number]> = [
      ['오디오를 16kHz로 변환하는 중…', 12, 350],
      ['Azure 발음 평가를 실행하는 중…', 34, 550],
      ['포먼트·피치 시계열을 추출하는 중…', 58, 500],
      ['Hybrid Segmented DTW로 정렬하는 중…', 76, 500],
      ['AI 코치가 물리적 교정 처방을 작성하는 중…', 92, 0],
    ];
    (async () => {
      for (const [msg, pct, delay] of steps) {
        setMessage(msg);
        setProgress(pct);
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      }
    })();

    console.log('[diagnosis] starting demo call', { sentence, nativeLanguage });
    callDemo(sentence, nativeLanguage)
      .then((demo) => {
        console.log('[diagnosis] demo response', demo);
        const res = toDiagnosisResult(sentence, demo);
        setProgress(100);
        setMessage('진단 완료');
        setResult(res);
        setDiagnosis(res);
        setPhase('done');
        console.log('[diagnosis] phase=done set');
      })
      .catch((e: Error) => {
        console.error('[diagnosis] failed', e);
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
              읽은 문장을 AI 발음 코치가 분석하여 혀·턱·입술 단위의 물리적
              교정 처방을 작성합니다.
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <PanelBoundary name="OverallScore">
          <OverallScore result={result} />
        </PanelBoundary>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <PanelBoundary name="CoachingCards">
          <CoachingCards result={result} />
        </PanelBoundary>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="flex justify-center pb-6 pt-2"
      >
        <Button onClick={reset} variant="outline" size="lg" className="gap-2">
          <RotateCcw className="h-4 w-4" />
          새 문장으로 다시 연습하기
        </Button>
      </motion.div>
    </div>
  );
}
