# Investment · 다중 AI 투자 리서치

새 React + TypeScript 프로젝트입니다. 빈 `kjs92525-stack/investment`에서 시작했으며 기존 ALPHA TERMINAL 코드를 복제한 프로젝트가 아닙니다. 미국주식 티커 1개를 수동 입력하면 AI Hedge Fund 원본 분석가 3명이 분석하고 한국어 보고서를 생성합니다. 실제 주문·페이퍼 주문·포트폴리오 실행 코드는 호출하지 않습니다.

**현재 검증 범위:** 프런트 빌드, 인증 게이트웨이 타입 검사, 오프라인 테스트 및 로컬 서버 요청. 실제 데이터/모델 키가 없어 유료 API 분석은 미검증입니다. 화면에 데모·모의 분석을 제공하지 않습니다. 키가 없으면 설정 오류를 표시합니다.

## 구성

```text
React / Cloudflare Pages
  → Pages Function (Access JWT 서명·issuer·audience 검증)
  → 별도 Python FastAPI 서버 (서버 간 Bearer 토큰)
  → 원본 FDClient / CachedDataClient / build_snapshot
  → 원본 BuffettAgent / GrahamAgent / LynchAgent.predict
  → 한국어 JSON 종합 보고서
```

Python 3.11 이상, pandas/numpy/scipy 및 LangChain을 쓰는 원본을 Pages Functions의 JS 런타임에서 그대로 실행할 수 없습니다. Python API는 로컬 또는 별도 Linux 서버에서 실행합니다. **유료 서버·Cloudflare 리소스는 생성하지 않았고 배포도 하지 않았습니다.** Supabase를 사용하지 않습니다.

## 로컬 실행

필요 도구: Node 24, npm, Python 3.12(3.11 이상), [uv](https://docs.astral.sh/uv/).

```bash
cd /workspace/investment  # 일반 PC에서는 clone한 디렉터리
npm ci
uv venv .venv
uv pip sync --python .venv/bin/python backend/requirements.lock
cp .env.example .env  # 이미 파일이 있으면 덮어쓰지 마세요
```

`.env`에 서버 설정을 입력합니다. **비밀값은 채팅·GitHub·VITE_*에 넣지 마세요.**

- `ANALYSIS_SERVICE_TOKEN`: `python -c 'import secrets; print(secrets.token_urlsafe(32))'`로 로컬에서 생성한 랜덤 값. 32자 이상 필수.
- `FINANCIAL_DATASETS_API_KEY`: 가격·기업정보·공시 재무 API에 접근 가능한 기존 키.
- `HEDGE_FUND_LLM_MODEL`: 고정한 원본 `hedge_fund/llm/api_models.json`에 등록된 모델 ID.
- 모델 공급자 키: 예시 기본값 `deepseek-flash`에는 `DEEPSEEK_API_KEY`가 필요합니다. 모델 사용 가능 여부와 요금을 계정에서 먼저 확인하세요. 제공자 추천이나 무료 보장이 아닙니다.
- `ANALYSIS_DAILY_LIMIT=5`: 서버 전체 UTC 날짜당 신규 작업 제한. 실패한 작업도 포함합니다. 캐시 조회는 제외.

터미널 두 개에서 각각 실행합니다.

```bash
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --workers 1 --env-file .env
```

```bash
npm run dev
```

Vite 개발 서버가 같은 `.env`의 서버 토큰을 프록시 요청에 넣습니다. 토큰은 브라우저 코드에 포함되지 않습니다. 로컬 개발 서버를 공용 네트워크에 노출하지 마세요. 키 변경 후 두 프로세스를 재시작하세요.

`GET http://127.0.0.1:8000/health`는 키 값 없이 누락된 설정 **이름**을 알려줍니다. `configured`는 설정 존재만 의미하며 실제 API 접근 성공을 보장하지 않습니다.

## 실제 분석 확인

1. 데이터·모델 키의 권한과 결제·사용 한도를 확인합니다.
2. 서버 및 프런트를 켜고 `AAPL` 등 지원되는 티커 1개를 수동 실행합니다.
3. 세 분석가 의견·한국어 보고서·F1 공시일·P1 가격 마지막 날짜를 확인합니다.
4. 동일 티커를 다시 실행하면 6시간 이내 결과 캐시를 재사용합니다. 분석 도중 같은 티커 요청은 같은 작업 ID를 반환합니다.

보고서는 뉴욕 기준 전날까지의 데이터를 조회합니다. 당일 장 마감 이후에도 당일은 제외합니다. 휴일에는 마지막 가격 관측일이 더 오래될 수 있습니다. 조회 기준일과 실제 공시/가격 기준일은 다릅니다.

## Cloudflare 및 별도 서버 (설정 방법만 제공, 배포하지 않음)

- Pages 빌드: `npm ci && npm run build`, 출력 `dist`. `functions/api/[[path]].ts`를 Pages Functions로 함께 배포해야 합니다. 정적 파일만 업로드하면 API가 작동하지 않습니다.
- Pages **서버 환경설정/Secrets**: `ANALYSIS_BACKEND_URL`(HTTPS origin, 경로 없음), `ANALYSIS_SERVICE_TOKEN`, `ACCESS_TEAM_DOMAIN`(`your-team.cloudflareaccess.com`), `ACCESS_AUD`.
- Cloudflare Access에 허용 사용자만 접근하도록 사이트 및 `/api/*` 경로를 보호합니다. 게이트웨이는 JWT를 직접 검증하고 설정이 없으면 503, 위조/누락이면 401로 차단합니다. Cloudflare 계정 플랜과 한도는 별도 확인해야 합니다.
- Python 서버에 데이터·모델 키 및 동일 서비스 토큰을 넣습니다. HTTPS 리버스 프록시 뒤에서 `uvicorn ... --host 127.0.0.1 --port 8000 --workers 1 --env-file .env`로 실행합니다. 키를 이미지나 Git에 포함하지 마세요.
- 한 프로세스/한 워커/한 서버만 지원합니다. 분석 스레드는 1개입니다. 여러 인스턴스를 쓰려면 공유 작업 큐·분산 잠금·예산 제어를 먼저 구현해야 합니다.
- `.state`와 원본 prompt/data 캐시는 서버 영속 디스크에 두세요. 작업 상태·결과는 SQLite에 저장하며 7일 지난 작업은 다음 신규 요청 시 제거됩니다. 원본 캐시는 자동 만료되지 않으므로 용량을 모니터링하고 오래된 캐시는 서버 정지 후 정리하세요. 캐시 삭제 후 재분석은 과금될 수 있습니다.
- 백엔드 재시작 시 중단된 작업은 실패로 기록하고 자동 재실행하지 않습니다. 외부 API 장애 후에도 자동으로 새 작업을 생성하지 않습니다.

## 검증 명령

```bash
npm run build
npm run typecheck:functions
npm run lint
npm test
.venv/bin/python -m pytest tests -q
```

테스트의 합성 응답은 `tests/` 안에서만 사용합니다. 실제 제공자 연결·요금·모델 가용성·배포 후 Access 로그인을 검증한 것은 아닙니다.

## 원본과 추가 기능

| 원본 코드 재사용 | 이번에 추가 |
|---|---|
| Financial Datasets 클라이언트 및 원본 디스크 캐시 | 인증된 비동기 HTTP 작업 API |
| 공시 시점별 fundamentals snapshot | React 한국어 리서치 화면 |
| Buffett·Graham·Lynch 원본 predict/파서/프롬프트 캐시 | 원본 시스템 프롬프트에 한국어·근거 제한 지침 추가 |
| 원본 LLM 공급자 라우팅 | 한국어 종합 보고서·분석가 의견 차이 |
| 원본 신호와 판단 강도 | 결과 캐시·중복 요청 방지·일일 작업 제한 |
| MIT 라이선스 | 가격 변화 지표·상승 초입 관점·출처 ID 검사 |

사업별 매출, 제품, 뉴스, 확정된 향후 촉매는 현재 수집하지 않습니다. 관련 근거가 부족한 항목은 판단 불가여야 합니다. LLM의 근거 ID 유효성 검사는 문장 자체의 사실성을 보장하지 않습니다. 실제 공시를 확인해야 합니다. 최종 의견은 유효 분석가의 방향 단순 투표이며 두 명 미만이면 판단 불가입니다. `confidence`는 원본 모델 판단 강도이지 상승 확률이 아닙니다. 목표주가를 생성하지 않도록 지시합니다.

[원본·라이선스·모델·비용 조사](docs/upstream-and-costs.md) · [PR 설명](docs/PR.md)
