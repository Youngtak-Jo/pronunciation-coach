# 영어 발음 진단 코치 — 빌드 사양서

영어 학습자가 AI 합성 음성을 듣고 따라 읽으면, 음소 단위 음향 시계열을 LLM이 분석해 "물리적 교정 처방"을 내려주는 단일 페이지 웹앱.
시각적 임팩트가 최우선 — 결과 화면을 본 사람이 5초 안에 "오 이거 진짜 분석하네"라고 느껴야 함.

## 사용자 플로우 (3-step Wizard)

### Step 1 — Voice Clone
- 10초 영어 발화 녹음(MediaRecorder) → Cartesia로 voice clone → `voice.id` 메모리 저장

### Step 2 — Listen & Shadow
- 30개 영어 문장 풀(발음 학습용 — tongue twisters, minimal pairs)에서 랜덤 1개. 문장 생성에 LLM 비사용
- Cartesia TTS로 클론된 목소리 재생. 단어 단위 타임스탬프 응답으로 viseme 동기화 + 현재 단어 하이라이트
- 사용자 녹음

### Step 3 — Diagnosis & Prescription
- 파이프라인은 §4 참조

## Viseme 자원 (사전 배치)

**Azure Speech의 표준 22-viseme 스키마(ID 0–21)**를 그대로 사용. 작업 폴더 정적 자원 경로에 22장이 이미 들어있음:

```
public/images/viseme/viseme-id-0.jpg
public/images/viseme/viseme-id-1.jpg
…
public/images/viseme/viseme-id-21.jpg
```

런타임 경로: `/images/viseme/viseme-id-{0..21}.jpg`.

**참고: 원본 이미지는 `../viseme/viseme-id-{N}.jpg` 에 있음. 프로젝트 셋업 시 `public/images/viseme/`로 복사할 것.**

### Phoneme → Viseme ID 매핑 (Azure 공식 스키마)

```
0  silence (sil, sp, '', '-')
1  æ, ə, ʌ (ae, ax, ah)
2  ɑ (aa, ɑː)
3  ɔ (ao, ɔː)
4  ɛ, ʊ (eh, uh)
5  ɝ (er, ɜː, ɜ, axr)
6  j, i, ɪ (y, iy, iː, ih)
7  w, u (uw, uː)
8  o (ow, oʊ, əʊ)
9  aʊ (aw)
10 ɔɪ (oy)
11 aɪ (ay)
12 h (hh)
13 ɹ, r
14 l
15 s, z
16 ʃ, tʃ, dʒ, ʒ (sh, ch, jh, zh)
17 ð (dh)
18 f, v
19 d, t, n, θ (th)
20 k, g, ŋ (ng)
21 p, b, m
```

### 매핑 함수 요구사항
- 입력 phoneme을 lowercase + trim 후 위 테이블 직접 조회
- 못 찾으면 length marker `ː` 제거 후 재조회
- 그래도 없으면 0(silence) 반환
- 이미지 경로 헬퍼: `getVisemeImagePath(id)` → ID를 [0, 21]로 clamp 후 `/images/viseme/viseme-id-${id}.jpg`

### 재생 동기화
- Azure PA(또는 Azure TTS visemeReceived 이벤트)에서 얻은 음소 타임라인을 centisecond 단위로 가지고, 재생 currentTime을 centisecond로 변환해 현재 음소 구간을 찾고 → `getVisemeId(phoneme)` → `<img src>` 교체

## 필수 외부 의존성

웹앱이면 됨. 프레임워크·번들러·언어는 본인 판단. 단 다음만 그대로 사용:

- **shadcn/ui**
- **Cartesia API** (`CARTESIA_API_KEY`)
  - `POST https://api.cartesia.ai/voices/clone` (multipart, `mode=similarity`, `language=en`, Content-Type 헤더 직접 설정 ❌)
  - `POST https://api.cartesia.ai/tts/sse` + `add_timestamps: true` → 단어별 start/end 초 단위 타임스탬프 + 오디오 청크 (`model_id=sonic-english`, mp3 44.1kHz 128kbps)
  - 헤더: `X-API-Key`, `Cartesia-Version: 2024-06-10`
- **Azure Speech SDK** (`AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`)
  - `microsoft-cognitiveservices-speech-sdk`
  - `PronunciationAssessmentConfig` granularity=Phoneme, 100점제, miscue 활성, prosody 활성, nbestPhonemeCount=5
  - WAV 16kHz 16bit mono 변환 필요. target/attempt 두 오디오 모두 평가 (target도 같은 refText로 돌려 음소 타이밍 확보)
- **OpenAI API** (`OPENAI_API_KEY`)
  - `gpt-4o` 또는 `gpt-4o-mini`, `response_format: { type: "json_object" }`, temperature 0.2

API 키 셋 다 **서버 사이드 프록시**(클라이언트 노출 금지). 그 외 라이브러리·상태관리·차트는 본인 판단.

**음향 분석 추천**: 직접 FFT 구현 대신 Meyda + Pitchy 조합. LPC 포먼트는 spectral envelope peak picking으로 충분.

## §4 타이밍 정렬 파이프라인 (★ 핵심 ★)

세 가지 시간축을 정확히 매핑해야 LLM 페이로드와 시각화가 의미를 가짐:

| 출처 | 단위 | 입자도 | 내용 |
|---|---|---|---|
| Cartesia tts/sse (target) | 초 | 단어 | `{ word, start, end }` |
| Azure PA on attempt | centisecond | 단어 + 음소 | `word.span`, `phoneme.{start, end}`, pronunciation, sound_like |
| Azure PA on target | centisecond | 단어 + 음소 | target 음소 `{start, end}` (시계열 슬라이싱 + viseme 큐) |

### 4.1 단계별 처리
1. Cartesia TTS SSE로 target 오디오 합성 + 단어 타임스탬프 수집 → `targetWords[]: { word, start, end }` (초)
2. 사용자 녹음 → attempt blob
3. 두 오디오 모두 WAV 16kHz mono로 변환 → Azure PA 호출 (refText는 동일 문장)
   - `attemptEval`, `targetEval` (word.span + phoneme spans + score + sound_like)
4. 단위 통일: centisecond → 초 (/100). attempt와 target의 단어 리스트를 인덱스 + 정규화 텍스트(소문자·구두점 제거)로 매칭
5. 브라우저 음향 분석: target/attempt 각각에서 전체 STFT spectrogram + 프레임별 F0·F1·F2·F3·voicingConfidence 시계열 추출
6. Hybrid Segmented DTW (▼ 4.2)
7. 음소별 시계열 슬라이싱: 매칭된 단어 쌍 내부에서 target 음소 span으로 target 시계열을, attempt 음소 span으로 attempt 시계열을 자름. 음소당 30프레임 정도. 길이는 균등 리샘플로 같게 맞춤
8. LLM 페이로드 조립 (§5)

### 4.2 Hybrid Segmented DTW

전체 utterance를 한 번에 DTW 돌리면 단어 경계가 흐려져 정확도가 떨어짐. 대신:

- **시작 앵커** (targetTime=0, attemptTime=0)
- 매칭된 단어 쌍 각각에:
  - **단어 시작 앵커** (`tWord.start`, `aWord.span.start`)
  - target spectrogram의 `[tWord.start, tWord.end]` 구간과 attempt spectrogram의 `[aWord.span.start, aWord.span.end]` 구간에 **국소 DTW** 수행
  - Sakoe-Chiba band(window 20%), cosine distance
  - 세그먼트 100프레임 초과 시 다운샘플
  - DTW path를 약 10개 포인트로 샘플링해 전역 좌표로 환산 후 TimeMap에 추가
  - **단어 끝 앵커** (`tWord.end`, `aWord.span.end`)
- **끝 앵커** (targetDuration, attemptDuration)
- 결과 `TimeMap[]`은 targetTime 기준 정렬

TimeMap이 시각화의 Dual Waveform DTW Alignment 근거가 되고, 음소 시계열 정렬 보정에도 쓰임. `lookupTimeMap(t)` / `lookupTargetTime(t)`는 이분탐색 + 선형보간 양방향 매핑.

## §5 LLM 페이로드 구조

```
Word: "{word}"
--- Phoneme: /{IPA}/ (Score: {azure score}%, Type: vowel|consonant) ---

Perceived As: /{sound_like}/   ← sound_like ≠ phoneme이고 score<95일 때만
Duration: Too long|short by {ms}ms (~{pct}%)
Formant Summary: F1 {±diff}Hz, F2 {±diff}Hz, F3 {±diff}Hz
(Attempt: F1=… F2=… F3=…)   (Target: F1=… F2=… F3=…)
[Time-Series Data]
TimeOffset | Amt F1 | Amt F2 | Amt F3 | Amt Voice | Tgt F1 | Tgt F2 | Tgt F3 | Tgt Voice
0.00s | 412 | 1987 | 2845 | 0.92 | 398 | 2103 | 2901 | 0.95
0.03s | …
… (10 행, 3프레임 간격 다운샘플)

Voicing Analysis: Attempt avg=0.87, Target avg=0.93 (Too little voicing - needs vocal cord vibration)   ← 자음에 한해
```

음소 score=100 AND duration 차이 ≤30%면 페이로드에서 제외(LLM 부담 ↓).

### LLM 시스템 프롬프트 (이 구조 그대로)

```
You are an expert English pronunciation coach (Phonetician) specializing in helping {nativeLanguage} speakers. Analyze the provided Formant Time-Series Data comparing User (Attempt) vs AI (Target) to provide a "Physical Correction Prescription".

Analysis Logic:
- Vowels: F1 = jaw opening. F2 = tongue front-back. F3 = lip rounding/retroflex.
- Consonants: voicingConfidence로 voiced/voiceless 판정. Stop은 voice bar timing, fricative는 turbulence duration.
- Sound-like 일치하지 않으면 최우선 교정 대상.
- {nativeLanguage} L1 간섭 패턴(예: 한국어 → /r/-/l/, /θ/→/s/, /f/→/p/, /v/→/b/)을 고려해 진단.

Output JSON only:
{
  "words": [{
    "word": "...",
    "score": 0-100,
    "issues": [{
      "phoneme": "...",        // 입력 InternalID 그대로
      "ipa": "...",
      "type": "duration" | "pronunciation",
      "diagnosis": "...",      // {nativeLanguage}, F1/F2 같은 기술용어 금지, 물리적 원인만
      "correction": "...",     // 3단계: ① 현재 상태 ② 목표 상태 ③ 구체적 동작 — {nativeLanguage}
      "importance": "high" | "medium" | "low"
    }]
  }],
  "overallFeedback": "..."
}
```

Importance: high = sound-like 불일치 OR score<80 OR 핵심 음 (th/r/l/모음). medium = 80-99. low = 미세하지만 보고. diagnosis와 correction은 반드시 "혀가/턱이/입술이" 같은 물리적 표현으로, F1/F2/formant 단어 사용 금지.

## §6 시각화 요구 (승부처)

Step 3에 다음 패널이 **stagger로 등장**:

1. **Overall Score** — 큰 숫자 + radial progress + 카운트업
2. **Dual Waveform with DTW Alignment** — target/attempt 위아래, §4.2 TimeMap에서 12~20개 앵커를 골라 두 파형 사이에 선 연결. 잘 맞으면 녹색 / 틀어지면 빨강. **시그니처 비주얼**
3. **DTW Cost Matrix Heatmap** — 단어 1개를 선택했을 때의 국소 DTW cost 매트릭스를 plasma colormap + optimal path 흰 선, stroke-dashoffset 애니메이션
4. **Vowel Space (F1/F2 Scatter)** — X축 F2 역방향(2500→500), Y축 F1 역방향(800→200), 영어 모음 표준 위치(i ɪ ɛ æ ɑ ʊ u) 회색 라벨, target/attempt 점 다른 색, 클러스터 중심 점선 연결
5. **Spectrogram + Pitch Contour** — target/attempt 스펙트로그램 위아래(viridis, log freq 0–4kHz) + pitch contour 오버레이, 단어 경계 세로선
6. **AI Coaching Cards** — 단어별 카드, importance 배지(high=빨강/medium=황색/low=회색), 진단 + 3단계 교정, expand로 음소 시계열 mini-chart

스펙트로그램·DTW 매트릭스·정렬선은 **차트 라이브러리 말고 canvas 직접** (성능과 자유도). devicePixelRatio 대응 필수.

## 데모 안전장치
- 환경변수 `DEMO_VOICE_ID` 존재 시 `?demo=1`로 Step 1 스킵
- `/images/viseme/` 22장은 사전 배치되어 있으므로 별도 폴백 불필요

## 방향성 가이드
- 상태는 메모리 한정 — 영속화·DB 도입 안 함
- 문장 풀은 코드 하드코딩 — 문장 생성에 LLM 외부 API 의존 안 함
- 음성 합성은 Cartesia 한 곳, 다른 TTS 도입 안 함
- 언어는 영어 학습 한정 — 진단 출력은 학습자 모국어(한국어 디폴트)
- 음소 점수·sound_like·타이밍은 Azure Speech, 물리적 처방은 OpenAI — 두 역할 분리 유지
- 시간 매핑은 §4 파이프라인 그대로 — 단순 등간격 분할이나 단일 글로벌 DTW로 대체하지 말 것
- Viseme은 Azure 22-스키마 그대로(13개 축약 같은 임의 변형 금지) — 매핑 테이블과 ID 0–21 이미지 경로 그대로
- 아바타는 2D 입모양 이미지 전환 — 3D rigging이나 face mesh 도입 안 함
- 기능을 끝까지 동작 상태로 — 미구현 TODO 주석 남기지 않음
- 정해진 3-step 플로우와 6개 시각화 패널의 완성도에 집중

## 완료 조건
실행 후:
- 녹음 → voice 클론 성공
- 랜덤 문장 → 클론 음성 재생 + `/images/viseme/viseme-id-{0..21}.jpg`로 입모양 동기화 → 사용자 녹음
- Analyze → target/attempt 두 오디오 모두 Azure PA → 브라우저 포먼트 시계열 추출 → Hybrid Segmented DTW로 TimeMap 생성 → OpenAI 처방 → 6개 패널 stagger 등장
- AI Coaching Card에 단어별 진단(예: "혀가 너무 뒤에 있고 턱이 살짝 닫혔어요")과 3단계 교정이 한국어로 표시
- Dual Waveform 정렬선이 단어 경계에서 정확히 만나고, 틀어진 음소 구간이 빨강으로 표시됨
- Vowel space 스캐터에 학습자 모음이 표준에서 어디로 벗어났는지 한눈에 보임

이 6개가 막힘없이 흘러가면 완성.
