'use client';

/**
 * Panel 6 — AI Coaching Cards (SPEC §7.6).
 * Per-word cards with importance badges, the physical diagnosis and the
 * 3-stage correction; each issue expands to a phoneme time-series mini-chart.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, Sparkles, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { normalizeWord } from '@/lib/alignment';
import type { LlmIssue, LlmWord, MatchedWord, PhonemeSlice } from '@/lib/types';
import type { DiagnosisResult } from '@/lib/diagnosis';

const IMPORTANCE_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Phoneme formant time-series mini-chart (attempt vs target). */
function MiniChart({ slice }: { slice: PhonemeSlice }) {
  const W = 280;
  const H = 130;
  const PAD_L = 30;
  const PAD_B = 18;
  const PAD_T = 8;
  const plotW = W - PAD_L - 8;
  const plotH = H - PAD_B - PAD_T;
  const MAX_HZ = 3600;
  const n = slice.attempt.f1.length;

  const x = (i: number) => PAD_L + (n > 1 ? i / (n - 1) : 0) * plotW;
  const y = (hz: number) =>
    PAD_T + plotH - (Math.max(0, Math.min(MAX_HZ, hz)) / MAX_HZ) * plotH;

  const path = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');

  const tracks: Array<{ key: keyof typeof colors; t: number[]; a: number[] }> = [
    { key: 'f1', t: slice.target.f1, a: slice.attempt.f1 },
    { key: 'f2', t: slice.target.f2, a: slice.attempt.f2 },
    { key: 'f3', t: slice.target.f3, a: slice.attempt.f3 },
  ];
  const colors = {
    f1: 'hsl(199 89% 62%)',
    f2: 'hsl(152 60% 52%)',
    f3: 'hsl(28 92% 60%)',
  };

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        {[0, 1200, 2400, 3600].map((hz) => (
          <g key={hz}>
            <line
              x1={PAD_L}
              y1={y(hz)}
              x2={W - 8}
              y2={y(hz)}
              stroke="hsl(217 33% 18%)"
            />
            <text x={2} y={y(hz) + 3} fill="hsl(215 16% 52%)" fontSize={8}>
              {hz >= 1000 ? `${hz / 1000}k` : hz}
            </text>
          </g>
        ))}
        {tracks.map((tr) => (
          <g key={tr.key}>
            <path
              d={path(tr.t)}
              fill="none"
              stroke={colors[tr.key]}
              strokeWidth={1.2}
              strokeOpacity={0.5}
              strokeDasharray="3 3"
            />
            <path
              d={path(tr.a)}
              fill="none"
              stroke={colors[tr.key]}
              strokeWidth={2}
            />
          </g>
        ))}
        <text x={PAD_L} y={H - 5} fill="hsl(215 16% 52%)" fontSize={8}>
          phoneme duration →
        </text>
      </svg>
      <div className="flex gap-3 px-1 text-[10px] text-muted-foreground">
        <span>
          <span style={{ color: colors.f1 }}>━</span> F1
        </span>
        <span>
          <span style={{ color: colors.f2 }}>━</span> F2
        </span>
        <span>
          <span style={{ color: colors.f3 }}>━</span> F3
        </span>
        <span className="ml-auto">실선 = 나 · 점선 = AI</span>
      </div>
    </div>
  );
}

/** Split the 3-stage correction string into stages for tidy rendering. */
function correctionStages(text: string): string[] {
  const parts = text
    .split(/(?=[①②③])|(?:^|\s)(?=\(?[123]\)?[.)]\s)/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [text];
}

function IssueRow({
  issue,
  slice,
}: {
  issue: LlmIssue;
  slice: PhonemeSlice | undefined;
}) {
  const [open, setOpen] = useState(false);
  const stages = correctionStages(issue.correction);

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 p-3 text-left"
      >
        <Badge variant={issue.importance}>
          {issue.importance.toUpperCase()}
        </Badge>
        <span className="font-mono text-sm text-foreground">
          /{issue.ipa}/
        </span>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {issue.type === 'duration' ? '길이' : '발음'}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div className="space-y-2.5 px-3 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            진단
          </p>
          <p className="text-sm leading-relaxed text-foreground/90">
            {issue.diagnosis}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            교정 처방
          </p>
          <ol className="mt-1 space-y-1">
            {stages.map((s, i) => (
              <li
                key={i}
                className="text-sm leading-relaxed text-foreground/90"
              >
                {s}
              </li>
            ))}
          </ol>
        </div>

        <AnimatePresence initial={false}>
          {open && slice && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <p className="mb-1.5 mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                음소 포먼트 시계열
              </p>
              <MiniChart slice={slice} />
            </motion.div>
          )}
          {open && !slice && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-muted-foreground"
            >
              이 음소의 시계열 데이터를 찾지 못했습니다.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function WordCard({
  word,
  matched,
}: {
  word: LlmWord;
  matched: MatchedWord | undefined;
}) {
  const issues = [...word.issues].sort(
    (a, b) => IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance],
  );
  const findSlice = (issue: LlmIssue): PhonemeSlice | undefined =>
    matched?.phonemes.find(
      (p) =>
        p.phoneme.toLowerCase() === issue.phoneme.toLowerCase() ||
        p.ipa === issue.ipa,
    );

  const scoreColor =
    word.score >= 85
      ? 'hsl(152 60% 52%)'
      : word.score >= 70
        ? 'hsl(42 92% 56%)'
        : 'hsl(0 72% 60%)';

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-lg font-semibold">{word.word}</h4>
        <span
          className="font-mono text-sm tabular-nums"
          style={{ color: scoreColor }}
        >
          {Math.round(word.score)}
        </span>
      </div>
      {issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          이 단어는 큰 문제가 없었어요.
        </p>
      ) : (
        <div className="space-y-2">
          {issues.map((issue, i) => (
            <IssueRow key={i} issue={issue} slice={findSlice(issue)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CoachingCards({ result }: { result: DiagnosisResult }) {
  const { words, overallFeedback } = result.llm;

  const matchedByWord = useMemo(() => {
    const map = new Map<string, MatchedWord>();
    for (const w of result.matchedWords) {
      const key = normalizeWord(w.word);
      if (!map.has(key)) map.set(key, w);
    }
    return map;
  }, [result.matchedWords]);

  const wordsWithIssues = words.filter((w) => w.issues.length > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Coaching · 물리적 교정 처방
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {overallFeedback && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3.5 text-sm leading-relaxed text-foreground/90">
            {overallFeedback}
          </div>
        )}

        {wordsWithIssues.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            교정이 필요한 음소가 없습니다. 아주 잘 발음했어요!
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {wordsWithIssues.map((w, i) => (
              <WordCard
                key={`${w.word}-${i}`}
                word={w}
                matched={matchedByWord.get(normalizeWord(w.word))}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
