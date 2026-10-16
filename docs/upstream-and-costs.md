# 원본 확인 및 비용

확인일: 2026-10-16 (한국 시간). 조회 당시 원격 HEAD:
`78b779c1389e2d1452dc29606d2c4126d859b964` (aihf 2.5.0).

## 직접 확인한 1차 자료

- [최신 README](https://github.com/virattt/ai-hedge-fund/blob/78b779c1389e2d1452dc29606d2c4126d859b964/README.md)
- [라이선스](https://github.com/virattt/ai-hedge-fund/blob/78b779c1389e2d1452dc29606d2c4126d859b964/LICENSE): MIT, Virat Singh 저작권 표시 보존. [로컬 사본](licenses/ai-hedge-fund-MIT.txt).
- [실행·의존성](https://github.com/virattt/ai-hedge-fund/blob/78b779c1389e2d1452dc29606d2c4126d859b964/pyproject.toml): Python ^3.11, Poetry 패키지, `aihf` → `hedge_fund.run:main`, Textual TUI. FastAPI 서버가 원본에 내장되어 있다고 가정하지 않음.
- [분석가 구현](https://github.com/virattt/ai-hedge-fund/tree/78b779c1389e2d1452dc29606d2c4126d859b964/hedge_fund/signals), [데이터](https://github.com/virattt/ai-hedge-fund/tree/78b779c1389e2d1452dc29606d2c4126d859b964/hedge_fund/data), [모델 등록 목록](https://github.com/virattt/ai-hedge-fund/blob/78b779c1389e2d1452dc29606d2c4126d859b964/hedge_fund/llm/api_models.json).

원본 `hedge_fund/README.md`에는 구버전 `src/`, `app/`과 병행 개발 중이라는 설명도 남아 있으나, 확인한 HEAD의 실제 패키지는 `hedge_fund/`입니다. 구버전 LangGraph API를 가정하지 않고 현재 설치 가능한 코드의 인터페이스를 호출합니다.

원본 등록 공급자: Anthropic, OpenAI, DeepSeek, Google, xAI, Kimi, TypeSafe. 등록 모델 ID 예: `claude-opus-5-5`, `claude-fable-5-1`, `gpt-6-sol`, `gpt-6-astra`, `deepseek-flash`, `gemini-3.8-flash`, `grok-4.7`, `kimi-k3`, `jev-1.13.0`. 이는 **원본 파일에 등록된 식별자**이며 공급자 API에서 실제 사용 가능함을 확인한 목록은 아닙니다. 이 앱은 등록된 텍스트 모델만 허용하며 typed assessment 전용 TypeSafe/Jev는 자유 형식 한국어 종합 보고서를 지원하지 않아 차단합니다.

원본 `.env.example`은 Kimi 키를 `MOONSHOT_API_KEY`로 안내하지만 현재 registry/client는 `KIMI_API_KEY`를 요구합니다. 이 앱은 실제 registry를 따릅니다. 사용 키 이름은 `/health`로 확인하세요.

## 데이터와 출처

실제 제공자: Financial Datasets (`api.financialdatasets.ai`). 이 최소 구현은 `financial-metrics`, `company/facts`, `prices`만 사용합니다. 원본의 뉴스·내부자 거래·실적 발표 API는 호출하지 않습니다. F1은 원본이 구성한 재무 snapshot(공시일/보고기간 포함), A1은 원본 AI 분석가 의견, P1은 실제 가격에서 계산한 지표입니다. A1은 독립적인 사실 출처가 아닙니다.

## 요금 확인 결과와 예상 비용 계산

[Financial Datasets](https://www.financialdatasets.ai/pricing), [Anthropic](https://www.anthropic.com/pricing), [OpenAI](https://openai.com/api/pricing/) 공식 가격 페이지를 직접 조회했지만 환경 네트워크 정책의 `403 Forbidden`으로 내용을 확인하지 못했습니다. DeepSeek [공식 요금 문서](https://api-docs.deepseek.com/quick_start/pricing) 조회도 같은 403으로 차단되었습니다. 사용자가 공식 페이지 및 계정 요금을 확인해야 합니다. **최신 단가·무료 티커·무료 사용량을 검증하지 못했으므로 무료 또는 특정 달러 금액이라고 제시하지 않습니다.** 가입·구독·유료 서버 생성은 수행하지 않았습니다.

콜드 캐시에서 정상 경로 예상 호출량:

- 데이터: 재무지표 1회, 기업정보 1회, 가격 1회. 원본이 빈/누락 응답을 재사용하지 않는 경우 반복 조회가 추가될 수 있습니다.
- 모델: 분석가 3회 + 한국어 종합 1회 = 보통 4회. 실패 시 원본 클라이언트의 재시도에 따른 추가 호출 가능. Anthropic 외 일부 원본 제공자는 `max_tokens` 인자를 전송하지 않으므로 2,500 토큰이 전체 제공자의 출력 상한이라고 가정하면 안 됩니다.
- 6시간 결과 캐시 적중: 데이터·모델 추가 호출 0회.
- 원본 prompt 캐시 적중: 같은 프롬프트의 분석가 호출 생략. 종합 보고서는 결과 캐시 미적중 시 다시 호출합니다.

실행 1건 예상 비용은 다음 식으로 산정하세요. 제공자 실제 청구 내역에서 입력/출력 토큰을 확인해야 합니다.

```text
모델 비용 = Σ(입력 토큰 × 입력 단가 + 출력 토큰 × 출력 단가) / 1,000,000
총 비용 = 모델 비용 + 데이터 호출/구독 비용 + 선택한 서버/Cloudflare 비용
```

앱 기본 일일 한도는 서버 전체 신규 작업 5개입니다. 이는 **달러 단위의 하드 예산 제한이 아닙니다.** 재시도·토큰 수·모델 단가에 따라 비용이 달라집니다. 별도로 공급자 콘솔의 지출 한도를 설정하세요. Supabase 비용은 이 구현에서 발생하지 않습니다. 실제 사용 전에 현재 데이터 플랜의 지원 티커·호출 한도·캐시/표시 권한도 확인하세요.

## 실제 분석 완료를 위해 남은 검증

기존 API 키의 안전한 서버 설정 → 공식 요금/계정 한도 확인 → 티커 1개 실제 실행 → 한국어 본문·공시일·가격일·캐시 재사용 확인. 이 검증 전에는 실제 분석 연동이 검증 완료되었다고 주장할 수 없습니다.
