'use client';

/**
 * In-memory app state (Zustand). Per SPEC §9 nothing is persisted — no DB,
 * no localStorage; a page reload starts a fresh session.
 */
import { create } from 'zustand';
import type { CartesiaWord } from './types';
import type { DiagnosisResult } from './diagnosis';

export type WizardStep = 1 | 2 | 3;

interface AppState {
  step: WizardStep;
  demoMode: boolean;
  nativeLanguage: string;

  voiceId: string | null;

  sentence: string | null;
  targetAudioBlob: Blob | null;
  targetAudioUrl: string | null;
  targetWords: CartesiaWord[];

  attemptAudioBlob: Blob | null;
  attemptAudioUrl: string | null;

  diagnosis: DiagnosisResult | null;

  setStep: (step: WizardStep) => void;
  setDemoMode: (demo: boolean) => void;
  setVoiceId: (id: string) => void;
  setSentence: (s: string) => void;
  setTarget: (blob: Blob, words: CartesiaWord[]) => void;
  setAttempt: (blob: Blob) => void;
  setDiagnosis: (d: DiagnosisResult) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  step: 1,
  demoMode: false,
  nativeLanguage: '한국어',

  voiceId: null,

  sentence: null,
  targetAudioBlob: null,
  targetAudioUrl: null,
  targetWords: [],

  attemptAudioBlob: null,
  attemptAudioUrl: null,

  diagnosis: null,

  setStep: (step) => set({ step }),
  setDemoMode: (demoMode) => set({ demoMode }),
  setVoiceId: (voiceId) => set({ voiceId }),
  setSentence: (sentence) => set({ sentence }),

  setTarget: (blob, words) => {
    const prev = get().targetAudioUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({
      targetAudioBlob: blob,
      targetAudioUrl: URL.createObjectURL(blob),
      targetWords: words,
    });
  },

  setAttempt: (blob) => {
    const prev = get().attemptAudioUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({
      attemptAudioBlob: blob,
      attemptAudioUrl: URL.createObjectURL(blob),
    });
  },

  setDiagnosis: (diagnosis) => set({ diagnosis }),

  reset: () => {
    const { targetAudioUrl, attemptAudioUrl } = get();
    if (targetAudioUrl) URL.revokeObjectURL(targetAudioUrl);
    if (attemptAudioUrl) URL.revokeObjectURL(attemptAudioUrl);
    set({
      step: 2,
      sentence: null,
      targetAudioBlob: null,
      targetAudioUrl: null,
      targetWords: [],
      attemptAudioBlob: null,
      attemptAudioUrl: null,
      diagnosis: null,
    });
  },
}));
