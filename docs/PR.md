# Investment: AI Hedge Fund 원본 기반 한국어 다중 분석 리서치

빈 investment 저장소에 React/TypeScript 웹 앱과 Python 분석 API를 추가합니다. 티커 한 개를 수동 실행하면 고정한 AI Hedge Fund 원본의 Buffett/Graham/Lynch 분석가가 Financial Datasets snapshot을 분석하고 한국어 보고서로 종합합니다. API 키가 없으면 설정 오류를 표시하며 모의 결과를 실제 분석으로 표시하지 않습니다.

- Pages Function은 Cloudflare Access JWT 검증 후 서버 간 토큰으로 Python 서버에 요청합니다. 키는 브라우저 번들에 넣지 않습니다.
- 비동기 작업/결과 조회, 중복 요청 방지, 6시간 결과 캐시, 서버 전체 일일 5건 기본 제한을 구현합니다. Supabase와 주문 기능을 사용하지 않습니다.
- 최종 의견/분석가 차이/재무/밸류에이션/성장/모멘텀/촉매/위험/6~12개월 스토리/상승 초입 관점을 표시합니다. 데이터 부족 항목은 판단 불가로 지시하며 가격 이력이 없으면 모멘텀·상승 초입은 강제로 판단 불가 처리합니다. 유효한 출처 ID인지 검사하지만 LLM 본문 사실성은 보장하지 않습니다.
- 원본 MIT 고지, 고정 SHA 의존성, 환경변수 예시, 로컬 및 별도 Python 서버 구성 방법과 비용 계산식을 문서화합니다.

검증: 프런트 build, Pages Function 타입 검사, lint, JS/화면 테스트 7개, Python 테스트 7개 통과. 실제 원본 predict/snapshot/parser/cache 경로를 가짜 데이터·LLM 테스트 공급자와 함께 실행했습니다. 실제 로컬 HTTP 프런트·health·API 프록시 요청도 확인했습니다.

제한: 실제 데이터/모델 키가 없어 실제 분석 미검증. 공식 가격 페이지가 네트워크 정책 403으로 차단되어 최신 단가 미확인. 제공자 API 모델 가용성과 데이터 사용 권한도 실제 계정으로 확인해야 합니다. 뉴스·제품별 사업 자료는 미수집. 유료 자원 생성·운영 배포·main 병합은 하지 않았습니다.
