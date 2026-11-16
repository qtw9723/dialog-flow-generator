# DialogFlow Generator

요구 문서를 넣으면 **대화형 봇의 흐름 JSON**을 만들어 주는 생성기입니다. LLM이 설계하고, 코드가 검증·보정·확장합니다.

> 운영 중인 시스템을 일반화한 공개본입니다. 운영 환경 정보와 실제 샘플은 제거했고, 노드 종류 이름(`greeting`·`subflow`·`fallback`·`llmchat`·`docquery`)은 일반 이름으로 바꿨습니다.

**데모(실운영 아님)**: [실행 기록 재생 페이지](web/index.html) — 검증·보정·확장 구간을 실제 소스로 실행한 기록입니다. LLM 호출 2번만 스크립트로 대신했습니다.

## 핵심 설계: LLM과 코드의 역할 분리

| 단계 | 담당 | 하는 일 |
|---|---|---|
| 흐름 설계 | LLM | 요구 문서 → 추상 노드 그래프(`FlowSpec`) |
| 검증·보정 | 코드 | 미지의 노드 종류·끊긴 참조·무한 반복 가능 루프를 적발하고, 코드로 고칠 수 있는 것만 고침. 못 고치는 오류는 피드백으로 LLM에 되돌림 |
| 노드 확장 | 코드 (LLM 0회) | 노드 스펙 골격에 값을 채워 실제 노드 JSON으로 펼침 |
| 값 채우기 | LLM | 멘트·변수 값 |
| 스키마 도출 | LLM | 저장·API 스키마 |
| 안전장치 | 코드 + DB 규칙 엔진 | 인사 노드 보장, 변수 선언-후-사용 강제, 반복 플래그 초기화 등 |

- **규칙은 데이터로 관리합니다.** 흐름 구조·변수·멘트 규칙은 프롬프트 코드에 박지 않고 DB의 규칙 테이블에 두며, 프롬프트는 거기서 동적으로 주입받습니다. "규칙 문구는 DB, 강제 로직은 코드"가 원칙입니다.
- **왕복 무손실이 최상위 불변식입니다.** 업로드한 봇을 편집해 다시 내려받을 때, 이 도구가 모르는 필드를 잃지 않습니다(`src/lib/flow/roundTrip.test.js`).
- **LLM이 흔들려도 결과가 깨지지 않게** 결정론 구간이 양쪽을 감쌉니다.

## 구성

- 프론트: React 19, Vite, React Router, Tailwind CSS 4, React Flow
- 백엔드: Supabase Edge Functions(Deno/TypeScript), PostgreSQL
- LLM: OpenAI API (모델 호출은 `supabase/functions/_shared/llmCall.ts`로 한곳에 모음)
- 배포: 프론트 Vercel, 백엔드 Supabase

```
src/                                   프론트 (화면, 흐름 편집기, 순수 로직 src/lib)
supabase/functions/dialogflow-generator/flow/   생성 파이프라인 (설계·검증·확장·안전장치)
supabase/functions/_shared/            LLM 호출·공통 유틸
supabase/migrations/                   스키마와 규칙 시드
demo/                                  결정론 구간 실행 기록 생성 (run-demo.ts, build-page.py)
web/                                   데모 정적 페이지
```

## 실행과 테스트

```sh
npm install
cp .env.example .env.local    # Supabase URL·anon key 등을 채운다
npm run dev
```

```sh
deno test --allow-read --allow-env src/lib/
deno test --allow-read --allow-env supabase/functions/dialogflow-generator/
deno run --allow-write --allow-read demo/run-demo.ts && python3 demo/build-page.py   # 데모 재생성
```

`--allow-env`가 빠지면 YAML 파싱이 조용히 실패해 무관한 테스트가 오답을 낼 수 있습니다.

## 배포 메모

- 앱 배포용 Vercel 설정은 `vercel.app.json`이다(앱을 Vercel에 올릴 때 `vercel.json`으로 복사). 저장소 루트에 `vercel.json`을 두지 않는 이유는 `web/`(정적 데모)를 같은 저장소에서 따로 배포하기 때문이다.

## 라이선스

MIT

## 데모 (실제 앱 화면)
`npm run build:demo`는 `VITE_DEMO=true`로 앱을 빌드해 `web/`에 넣습니다. 서버 대신 `src/demo/demoBackend.js`가 브라우저 안에서 `/functions/v1/*` 호출에 답하며, 생성 결과는 `demo/run-demo.ts`가 실제 검증·보정·확장 코드를 실행해 기록한 `demo/recorded/bot.json`입니다. LLM 호출 자리만 스크립트 응답이고 실운영이 아닙니다. 이전의 실행 기록 재생 페이지는 `web/replay.html`입니다.
