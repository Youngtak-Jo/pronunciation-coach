# English Pronunciation Coach

영어 학습자가 AI 합성 음성을 듣고 따라 읽으면, **음소 단위 음향 시계열**을 분석해
혀·턱·입술 중심의 **물리적 교정 처방**을 내려 주는 단일 페이지 웹앱.

> Next.js 14 (App Router) · TypeScript · Tailwind + shadcn/ui · framer-motion ·
> Meyda · Pitchy · Azure Speech SDK · Cartesia · OpenAI

---

## 빠른 시작

```bash
pnpm install            # 또는 npm install
cp .env.local.example .env.local   # 키 입력
pnpm dev                # http://localhost:3000
```

빌드 검증:

```bash
pnpm build && pnpm start
```

### 환경변수 (`.env.local`)

| 변수 | 용도 |
|---|---|
| `CARTESIA_API_KEY` | 음성 복제 + TTS |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | 발음 평가 (Pronunciation Assessment) |
| `OPENAI_API_KEY` | 물리적 교정 처방 생성 |
| `DEMO_VOICE_ID` | (선택) `?demo=1` 접속 시 Step 1 스킵 |

세 API 키(Cartesia/Azure/OpenAI)는 **모두 서버 사이드 라우트에서만** 사용되며
클라이언트 번들에 노출되지 않습니다.

---

## 3-Step 플로우

1. **Voice Clone** — 약 10초 영어 발화를 녹음 → `/api/cartesia/clone` →
   Cartesia `voices/clone` (multipart, `mode=similarity`) → `voice.id` 메모리 저장.
2. **Listen & Shadow** — 30개 하드코딩 문장 풀에서 랜덤 1개 선택 →
   `/api/cartesia/tts` → Cartesia `tts/sse` (`sonic-english`, mp3 44.1kHz,
   `add_timestamps`). 클론 음성 재생 중 **22-viseme 입모양 + 단어 하이라이트**
   동기화 → 사용자 녹음.
3. **Diagnosis & Prescription** — §4 파이프라인 실행 후 6개 시각화 패널이
   stagger 등장.

`?demo=1` + `DEMO_VOICE_ID` 설정 시 Step 1을 건너뜁니다.

---

## 타이밍 정렬 파이프라인 (§4)

```
Cartesia TTS  ─ 단어 타임스탬프(초) ─┐
사용자 녹음   ─ WAV 16kHz mono ──────┼─▶ Azure PA (attempt + target 모두)
Cartesia 오디오 ─ WAV 16kHz mono ────┘     단어/음소 span + score + sound_like
        │
        ├─▶ 브라우저 음향 분석: STFT 스펙트로그램 + 프레임별 F0/F1/F2/F3/voicing
        ├─▶ Hybrid Segmented DTW  (단어별 국소 DTW · 코사인 거리 · Sakoe-Chiba)
        │      → 양방향 TimeMap (이분탐색 + 선형보간)
        ├─▶ 음소별 시계열 슬라이싱 (음소당 30프레임, 균등 리샘플)
        ├─▶ LLM 페이로드 조립 (§5)
        └─▶ OpenAI 처방 (§6, JSON)  →  6개 패널
```

**Hybrid Segmented DTW**: 전체 발화를 한 번에 정렬하지 않고, 매칭된 단어 쌍마다
국소 DTW를 수행한 뒤 단어 경계 앵커와 함께 stitching 하여 단어 경계가 흐려지지
않도록 합니다 (`lib/dtw.ts`).

---

## 6개 시각화 패널 (§7)

| # | 패널 | 렌더링 |
|---|---|---|
| 1 | Overall Score | radial progress + 카운트업 |
| 2 | Dual Waveform · DTW Alignment | **canvas** — TimeMap 앵커 정렬선 (녹색/빨강) |
| 3 | DTW Cost Matrix Heatmap | **canvas** — plasma 컬러맵 + 경로 애니메이션 |
| 4 | Vowel Space (F1/F2) | SVG — 축 역방향 + 표준 모음 + 클러스터 중심선 |
| 5 | Spectrogram + Pitch Contour | **canvas** — viridis · 로그 주파수 · F0 오버레이 |
| 6 | AI Coaching Cards | 단어별 진단 + 3단계 교정 + 음소 mini-chart |

canvas 패널은 모두 `devicePixelRatio` 대응 (`lib/canvas.ts`).

---

## 디렉토리 구조

```
app/
  api/cartesia/clone/route.ts     음성 복제 프록시
  api/cartesia/tts/route.ts       SSE TTS 프록시 (오디오 + 단어 타임스탬프)
  api/azure/assess/route.ts       Azure 발음 평가 프록시
  api/openai/prescribe/route.ts   OpenAI 처방 프록시
  page.tsx                        3-step wizard
components/
  steps/        Step1Clone · Step2Shadow · Step3Diagnosis
  panels/       6개 시각화 패널 + useCanvas 훅
  VisemeAvatar.tsx · RecorderControls.tsx · ui/ (shadcn)
lib/
  viseme.ts       Azure 22-viseme 매핑 + 이미지 경로
  sentences.ts    30문장 하드코딩 풀
  audio/          recorder · wav · stft · formants · pitch · analysis
  dtw.ts          Hybrid Segmented DTW + TimeMap
  alignment.ts    단어 매칭 + 음소 시계열 슬라이싱
  llm-payload.ts  §5 페이로드 빌더
  llm-prompt.ts   §6 시스템 프롬프트
  diagnosis.ts    Step 3 파이프라인 오케스트레이터
  store.ts        Zustand (메모리 한정 상태)
public/images/viseme/   viseme-id-{0..21}.jpg (사전 배치)
```

---

## 구현 메모

- **상태는 메모리 한정** — DB·localStorage 없음. 새로고침 시 초기화 (SPEC §9).
- **STFT/포먼트**: SPEC은 `fft.js`를 제안하나, 본 환경의 의존성 정책상 직접 FFT
  구현·외부 FFT 패키지 대신 **Meyda의 오프라인 `extract()` API**로 진폭
  스펙트럼을 얻습니다 (window 1024 / hop 160). 포먼트는 그 스펙트럼을
  로그 변환·이동평균 스무딩한 spectral envelope에서 저주파부터 F1/F2/F3를
  peak-picking 합니다. 피치(F0)·voicingConfidence는 **Pitchy**.
- **WAV 변환**: WebAudio `OfflineAudioContext`로 16kHz mono 리샘플 후 16-bit
  PCM WAV 인코딩 (`lib/audio/wav.ts`).
- **Azure PA**: 서버에서 SDK push-stream으로 호출. granularity=Phoneme,
  100점제, miscue·prosody 활성, `nbestPhonemeCount=5`. target/attempt 두
  오디오를 모두 평가합니다.
- **에러 처리**: API 키 누락·외부 호출 실패 시 각 Step UI에 한국어 메시지 표시.

---

## 완료 조건 체크 (SPEC §10)

1. 녹음 → Cartesia voice clone ✔
2. 랜덤 문장 → 클론 음성 재생 + viseme 입모양 동기화 → 사용자 녹음 ✔
3. Analyze → target/attempt Azure PA → 포먼트 시계열 → Hybrid Segmented DTW →
   OpenAI 처방 → 6개 패널 stagger 등장 ✔
4. AI Coaching Card에 단어별 물리적 진단 + 3단계 교정 (한국어) ✔
5. Dual Waveform 정렬선 — 어긋난 구간 빨강 ✔
6. Vowel Space 스캐터로 모음 이탈 시각화 ✔

> API 키가 없으면 외부 호출 단계에서 명확한 에러가 표시됩니다. 키만 채우면
> 전체 플로우가 end-to-end로 동작합니다.
