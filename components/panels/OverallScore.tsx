'use client';

/**
 * Panel 1 — Overall Score (SPEC §7.1).
 * Large number + radial progress + count-up animation, with the Azure
 * sub-score breakdown.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { DiagnosisResult } from '@/lib/diagnosis';

/** Animate a value from 0 to `target` with an ease-out cubic curve. */
function useCountUp(target: number, duration = 1500): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function scoreHsl(score: number): string {
  if (score >= 85) return 'hsl(152 60% 50%)';
  if (score >= 70) return 'hsl(42 92% 56%)';
  return 'hsl(0 72% 58%)';
}

function scoreLabel(score: number): string {
  if (score >= 90) return '훌륭해요';
  if (score >= 80) return '좋아요';
  if (score >= 65) return '연습이 필요해요';
  return '많이 연습해 봐요';
}

const R = 78;
const CIRC = 2 * Math.PI * R;

interface PanelProps {
  result: DiagnosisResult;
}

function SubScore({ label, value }: { label: string; value: number }) {
  const animated = useCountUp(value, 1400);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums" style={{ color: scoreHsl(value) }}>
          {Math.round(animated)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${Math.max(0, Math.min(100, animated))}%`,
            background: scoreHsl(value),
          }}
        />
      </div>
    </div>
  );
}

export function OverallScore({ result }: PanelProps) {
  const score = result.overallScore;
  const animated = useCountUp(score, 1600);
  const color = scoreHsl(score);
  const offset = CIRC * (1 - Math.min(100, Math.max(0, animated)) / 100);

  return (
    <Card>
      <CardContent className="grid items-center gap-6 py-7 md:grid-cols-[200px_1fr]">
        {/* radial gauge */}
        <div className="relative mx-auto h-[200px] w-[200px]">
          <svg width={200} height={200} className="-rotate-90">
            <circle
              cx={100}
              cy={100}
              r={R}
              fill="none"
              stroke="hsl(var(--secondary))"
              strokeWidth={14}
            />
            <circle
              cx={100}
              cy={100}
              r={R}
              fill="none"
              stroke={color}
              strokeWidth={14}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={offset}
              style={{ filter: `drop-shadow(0 0 6px ${color})` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="font-mono text-5xl font-bold tabular-nums"
              style={{ color }}
            >
              {Math.round(animated)}
            </span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
        </div>

        {/* label + breakdown */}
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Overall Pronunciation Score
            </p>
            <p className="text-2xl font-semibold" style={{ color }}>
              {scoreLabel(score)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              문장: &ldquo;{result.sentence}&rdquo;
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SubScore label="정확도 Accuracy" value={result.scoreBreakdown.accuracy} />
            <SubScore label="유창성 Fluency" value={result.scoreBreakdown.fluency} />
            <SubScore
              label="완성도 Completeness"
              value={result.scoreBreakdown.completeness}
            />
            <SubScore label="운율 Prosody" value={result.scoreBreakdown.prosody} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
