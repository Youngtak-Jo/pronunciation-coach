'use client';

/**
 * 3-step wizard root (SPEC §1).
 * Step 1 Voice Clone -> Step 2 Listen & Shadow -> Step 3 Diagnosis.
 * `?demo=1` skips Step 1 and routes the TTS proxy to DEMO_VOICE_ID (SPEC §8).
 */
import { useEffect } from 'react';
import { Check, Mic, Headphones, Activity } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { Step1Clone } from '@/components/steps/Step1Clone';
import { Step2Shadow } from '@/components/steps/Step2Shadow';
import { Step3Diagnosis } from '@/components/steps/Step3Diagnosis';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 1, label: '음성 복제', icon: Mic },
  { id: 2, label: '듣고 따라 읽기', icon: Headphones },
  { id: 3, label: '진단 & 처방', icon: Activity },
] as const;

export default function Page() {
  const step = useAppStore((s) => s.step);
  const demoMode = useAppStore((s) => s.demoMode);
  const setDemoMode = useAppStore((s) => s.setDemoMode);
  const setVoiceId = useAppStore((s) => s.setVoiceId);
  const setStep = useAppStore((s) => s.setStep);

  // honor ?demo=1 — skip the clone step (SPEC §8)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      setDemoMode(true);
      setVoiceId('__demo__');
      if (useAppStore.getState().step === 1) setStep(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        {/* header */}
        <header className="mb-8 text-center">
          <h1 className="bg-gradient-to-r from-sky-300 via-primary to-accent bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
            English Pronunciation Coach
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            AI 합성 음성을 따라 읽으면, 음소 단위 음향 시계열을 분석해 물리적
            교정 처방을 내려 드립니다.
          </p>
        </header>

        {/* step indicator */}
        <nav className="mb-8 flex items-center justify-center gap-2 sm:gap-3">
          {STEPS.map((s, i) => {
            const done = s.id < step;
            const active = s.id === step;
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center gap-2 sm:gap-3">
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm',
                    active &&
                      'border-primary bg-primary/15 text-primary',
                    done && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                    !active &&
                      !done &&
                      'border-border bg-secondary/40 text-muted-foreground',
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.id}</span>
                  {s.id === 1 && demoMode && (
                    <span className="hidden text-[10px] opacity-70 sm:inline">
                      (demo skip)
                    </span>
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'h-px w-5 sm:w-8',
                      s.id < step ? 'bg-emerald-500/50' : 'bg-border',
                    )}
                  />
                )}
              </div>
            );
          })}
        </nav>

        {/* active step */}
        {step === 1 && <Step1Clone />}
        {step === 2 && <Step2Shadow />}
        {step === 3 && <Step3Diagnosis />}

        <footer className="mt-12 text-center text-xs text-muted-foreground/70">
          Cartesia · Azure Speech · OpenAI — API 키는 모두 서버 사이드
          라우트에서만 사용됩니다.
        </footer>
      </div>
    </main>
  );
}
