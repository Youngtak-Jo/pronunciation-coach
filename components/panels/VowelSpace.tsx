'use client';

/**
 * Panel 4 — Vowel Space (F1/F2 scatter) — SPEC §7.4.
 * X axis = F2 reversed (2500 -> 500), Y axis = F1 reversed (800 -> 200),
 * standard English vowels labelled in grey, target vs attempt in two colors,
 * cluster centroids joined by a dotted line. Rendered as crisp SVG.
 */
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { VowelPair } from '@/lib/types';
import type { DiagnosisResult } from '@/lib/diagnosis';

const VB_W = 540;
const VB_H = 380;
const ML = 52;
const MR = 22;
const MT = 26;
const MB = 44;
const PLOT_W = VB_W - ML - MR;
const PLOT_H = VB_H - MT - MB;

const F2_MAX = 2500;
const F2_MIN = 500;
const F1_MIN = 200;
const F1_MAX = 800;

const TARGET_COLOR = 'hsl(199 89% 62%)';
const ATTEMPT_COLOR = 'hsl(28 92% 60%)';

/** Standard English monophthong formant references (Hz). */
const STANDARD: Array<{ ipa: string; f1: number; f2: number }> = [
  { ipa: 'i', f1: 280, f2: 2250 },
  { ipa: 'ɪ', f1: 400, f2: 1920 },
  { ipa: 'ɛ', f1: 550, f2: 1770 },
  { ipa: 'æ', f1: 690, f2: 1660 },
  { ipa: 'ɑ', f1: 710, f2: 1100 },
  { ipa: 'ʊ', f1: 450, f2: 1030 },
  { ipa: 'u', f1: 310, f2: 870 },
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

function xForF2(f2: number): number {
  return ML + ((F2_MAX - clamp(f2, F2_MIN, F2_MAX)) / (F2_MAX - F2_MIN)) * PLOT_W;
}
function yForF1(f1: number): number {
  return MT + ((clamp(f1, F1_MIN, F1_MAX) - F1_MIN) / (F1_MAX - F1_MIN)) * PLOT_H;
}

function avgMid(arr: number[]): number {
  const lo = Math.floor(arr.length / 3);
  const hi = Math.max(lo + 1, Math.ceil((arr.length * 2) / 3));
  let s = 0;
  let c = 0;
  for (let i = lo; i < hi && i < arr.length; i++) {
    s += arr[i];
    c++;
  }
  return c ? s / c : 0;
}

export function VowelSpace({ result }: { result: DiagnosisResult }) {
  const pairs = useMemo<VowelPair[]>(() => {
    const out: VowelPair[] = [];
    for (const w of result.matchedWords) {
      for (const p of w.phonemes) {
        if (p.type !== 'vowel') continue;
        const tF1 = avgMid(p.target.f1);
        const tF2 = avgMid(p.target.f2);
        const aF1 = avgMid(p.attempt.f1);
        const aF2 = avgMid(p.attempt.f2);
        if (tF1 <= 0 || aF1 <= 0) continue;
        out.push({
          phoneme: p.phoneme,
          ipa: p.ipa,
          word: w.word,
          targetF1: tF1,
          targetF2: tF2,
          attemptF1: aF1,
          attemptF2: aF2,
        });
      }
    }
    return out;
  }, [result]);

  const centroid = useMemo(() => {
    if (pairs.length === 0) return null;
    const sum = pairs.reduce(
      (acc, p) => ({
        tF1: acc.tF1 + p.targetF1,
        tF2: acc.tF2 + p.targetF2,
        aF1: acc.aF1 + p.attemptF1,
        aF2: acc.aF2 + p.attemptF2,
      }),
      { tF1: 0, tF2: 0, aF1: 0, aF2: 0 },
    );
    const n = pairs.length;
    return {
      tF1: sum.tF1 / n,
      tF2: sum.tF2 / n,
      aF1: sum.aF1 / n,
      aF2: sum.aF2 / n,
    };
  }, [pairs]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Vowel Space · F1 / F2</span>
          <span className="flex gap-3 text-xs font-normal">
            <span className="flex items-center gap-1">
              <Dot color={TARGET_COLOR} /> Target
            </span>
            <span className="flex items-center gap-1">
              <Dot color={ATTEMPT_COLOR} /> You
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {pairs.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            분석할 모음을 찾지 못했습니다.
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="block w-full"
            role="img"
            aria-label="Vowel space scatter plot"
          >
            {/* plot frame */}
            <rect
              x={ML}
              y={MT}
              width={PLOT_W}
              height={PLOT_H}
              fill="hsl(222 47% 8%)"
              stroke="hsl(217 33% 22%)"
            />
            {/* grid */}
            {[0.25, 0.5, 0.75].map((g) => (
              <g key={g}>
                <line
                  x1={ML + g * PLOT_W}
                  y1={MT}
                  x2={ML + g * PLOT_W}
                  y2={MT + PLOT_H}
                  stroke="hsl(217 33% 16%)"
                />
                <line
                  x1={ML}
                  y1={MT + g * PLOT_H}
                  x2={ML + PLOT_W}
                  y2={MT + g * PLOT_H}
                  stroke="hsl(217 33% 16%)"
                />
              </g>
            ))}

            {/* standard vowel references */}
            {STANDARD.map((v) => (
              <text
                key={v.ipa}
                x={xForF2(v.f2)}
                y={yForF1(v.f1)}
                fill="hsl(215 16% 52%)"
                fontSize={17}
                fontStyle="italic"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {v.ipa}
              </text>
            ))}

            {/* per-vowel target -> attempt drift connectors */}
            {pairs.map((p, i) => (
              <line
                key={`link-${i}`}
                x1={xForF2(p.targetF2)}
                y1={yForF1(p.targetF1)}
                x2={xForF2(p.attemptF2)}
                y2={yForF1(p.attemptF1)}
                stroke="hsl(215 20% 55%)"
                strokeWidth={1}
                strokeOpacity={0.5}
              />
            ))}

            {/* target points */}
            {pairs.map((p, i) => (
              <circle
                key={`t-${i}`}
                cx={xForF2(p.targetF2)}
                cy={yForF1(p.targetF1)}
                r={4.5}
                fill={TARGET_COLOR}
                fillOpacity={0.9}
              />
            ))}
            {/* attempt points */}
            {pairs.map((p, i) => (
              <g key={`a-${i}`}>
                <circle
                  cx={xForF2(p.attemptF2)}
                  cy={yForF1(p.attemptF1)}
                  r={4.5}
                  fill={ATTEMPT_COLOR}
                  fillOpacity={0.9}
                />
                <text
                  x={xForF2(p.attemptF2) + 7}
                  y={yForF1(p.attemptF1) + 3}
                  fill={ATTEMPT_COLOR}
                  fontSize={10}
                >
                  {p.ipa}
                </text>
              </g>
            ))}

            {/* cluster centroids joined by a dotted line */}
            {centroid && (
              <>
                <line
                  x1={xForF2(centroid.tF2)}
                  y1={yForF1(centroid.tF1)}
                  x2={xForF2(centroid.aF2)}
                  y2={yForF1(centroid.aF1)}
                  stroke="hsl(210 40% 92%)"
                  strokeWidth={1.6}
                  strokeDasharray="5 4"
                />
                <circle
                  cx={xForF2(centroid.tF2)}
                  cy={yForF1(centroid.tF1)}
                  r={8}
                  fill="none"
                  stroke={TARGET_COLOR}
                  strokeWidth={2.5}
                />
                <circle
                  cx={xForF2(centroid.aF2)}
                  cy={yForF1(centroid.aF1)}
                  r={8}
                  fill="none"
                  stroke={ATTEMPT_COLOR}
                  strokeWidth={2.5}
                />
              </>
            )}

            {/* axes labels */}
            <text
              x={ML + PLOT_W / 2}
              y={VB_H - 10}
              fill="hsl(215 20% 62%)"
              fontSize={12}
              textAnchor="middle"
            >
              F2 (Hz) · 혀 앞뒤  ←앞 2500 ···· 500 뒤→
            </text>
            <text
              x={14}
              y={MT + PLOT_H / 2}
              fill="hsl(215 20% 62%)"
              fontSize={12}
              textAnchor="middle"
              transform={`rotate(-90 14 ${MT + PLOT_H / 2})`}
            >
              F1 (Hz) · 턱 열림  ↑닫힘 200 ···· 800 열림↓
            </text>
          </svg>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          점선은 전체 모음 클러스터의 중심 이동입니다. 회색 기호는 표준 영어
          모음 위치입니다.
        </p>
      </CardContent>
    </Card>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: color }}
    />
  );
}
