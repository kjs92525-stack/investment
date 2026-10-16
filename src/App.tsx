import { useEffect, useRef, useState } from "react";
import "./App.css";

type Section = { text: string; evidence: string[] };
type Report = {
  ticker: string;
  as_of: string;
  model: string;
  opinion: string;
  mode: "live";
  analysts: {
    name: string;
    signal: string;
    confidence: number | null;
    reasoning: string;
    abstained: boolean;
  }[];
  sections: Record<string, Section>;
  evidence: Record<string, unknown>;
  limitations: string[];
};
const labels: Record<string, string> = {
  summary: "최종 의견과 핵심 이유",
  disagreements: "분석가 의견과 쟁점",
  story: "사업 구조 · 6–12개월 스토리",
  financials: "재무 건전성",
  valuation: "밸류에이션",
  growth: "실적과 성장성",
  momentum: "가격과 모멘텀",
  catalysts: "변화의 촉매",
  risks: "하락 위험",
  early_stage: "상승 초입 관점",
};
const personas = [
  ["B", "Warren Buffett", "지속 가능한 경쟁력과 이익의 질"],
  ["G", "Benjamin Graham", "안전마진과 재무 건전성"],
  ["L", "Peter Lynch", "실적 성장과 가격의 균형"],
];
const signals: Record<string, string> = {
  bullish: "긍정",
  bearish: "부정",
  neutral: "중립",
  unavailable: "판단 불가",
};
async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : body?.error ||
            `요청 실패 (${response.status}). 서버 설정과 접근 권한을 확인하세요.`,
    );
  return body;
}
export default function App() {
  const [ticker, setTicker] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [cached, setCached] = useState(false);
  const [phase, setPhase] = useState("");
  const cancel = useRef(false);
  useEffect(() => {
    cancel.current = false;
    return () => {
      cancel.current = true;
    };
  }, []);
  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setReport(null);
    setPhase("분석 요청을 확인하고 있습니다.");
    try {
      const job = await request("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      setCached(job.cached);
      setPhase(
        "공시 데이터를 읽고 세 분석가의 의견을 종합하고 있습니다. 수 분이 걸릴 수 있습니다.",
      );
      const deadline = Date.now() + 15 * 60 * 1000;
      while (!cancel.current && Date.now() < deadline) {
        const state = await request(`/api/analysis/${job.id}`);
        if (state.status === "failed") throw new Error(state.result.error);
        if (state.status === "completed") {
          if (state.result.mode !== "live")
            throw new Error("실제 분석 결과가 아닌 응답입니다.");
          setReport(state.result);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      if (!cancel.current)
        throw new Error(
          "대기 시간이 지났습니다. 분석이 서버에서 진행 중일 수 있습니다. 같은 티커를 다시 요청하면 진행 중인 작업을 재사용합니다.",
        );
    } catch (err) {
      if (!cancel.current)
        setError(
          err instanceof Error ? err.message : "분석 요청에 실패했습니다.",
        );
    } finally {
      if (!cancel.current) setBusy(false);
    }
  }
  return (
    <div className="shell">
      <header>
        <a className="brand" href="/">
          i<span>investment</span>
          <small>RESEARCH TERMINAL</small>
        </a>
        <span className="private">
          <i /> ANALYSIS ONLY
        </span>
      </header>
      <main>
        <div className="eyebrow">01 / MULTI-AGENT RESEARCH</div>
        <section className="intro">
          <div>
            <h1>
              좋은 기업의
              <br />
              <em>변화가 시작되는 순간.</em>
            </h1>
            <p>
              하나의 종목, 서로 다른 투자 관점.
              <br />
              숫자와 근거를 읽고, 판단의 차이를 살펴보세요.
            </p>
          </div>
          <aside>
            <span>OUR LENS</span>
            <p>
              오랜 하락과 횡보 뒤,
              <br />
              사업과 실적이 개선되는
              <br />
              <strong>상승 초입을 탐색합니다.</strong>
            </p>
            <small>근거가 충분하지 않으면 ‘판단 불가’로 남깁니다.</small>
          </aside>
        </section>
        <section className="search-panel">
          <form onSubmit={analyze}>
            <label htmlFor="ticker">분석할 미국주식 티커</label>
            <div className="input-row">
              <span className="search-icon">⌕</span>
              <input
                id="ticker"
                name="ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="AAPL, MSFT, NVDA"
                maxLength={7}
                pattern="[A-Za-z]{1,5}([.\-][A-Za-z])?"
                required
                disabled={busy}
                autoComplete="off"
                aria-describedby="cost-note"
              />
              <button disabled={busy}>
                {busy ? "분석 진행 중…" : "분석 실행 ↗"}
              </button>
            </div>
            <p id="cost-note">
              수동 실행 · 최대 3명 분석가 + 종합 보고서 · 동일 결과 6시간 캐시
              <br />
              실행 시 모델·데이터 API 비용이 발생할 수 있습니다. 자동
              실행·주문은 없습니다.
            </p>
          </form>
          <div className="engine">
            <i /> AI Hedge Fund 원본 엔진<span>한국어 리서치 확장</span>
          </div>
        </section>
        {busy && (
          <div role="status" className="notice">
            <span className="spinner" />
            {phase}
          </div>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
            <small>
              모의 결과는 표시하지 않습니다. 서버 API 키·모델 설정은 README를
              확인하세요.
            </small>
          </div>
        )}
        {report ? (
          <section className="results">
            <div className="result-head">
              <div className="eyebrow">RESEARCH / {report.ticker}</div>
              <h2>{report.opinion}</h2>
              <p>
                조회 기준 {report.as_of} · {report.model} ·{" "}
                {cached ? "캐시 결과" : "실제 API 분석"}
              </p>
            </div>
            <div className="analyst-grid">
              {report.analysts.map((a) => (
                <article key={a.name}>
                  <span className="eyebrow">{a.name}</span>
                  <h3>{signals[a.signal] || "판단 불가"}</h3>
                  <p>{a.reasoning}</p>
                  <small>
                    {a.abstained
                      ? "분석 보류"
                      : `모델 판단 강도 ${a.confidence}/100 · 상승 확률 아님`}
                  </small>
                </article>
              ))}
            </div>
            <div className="report-grid">
              {Object.entries(labels).map(([key, label], i) => (
                <article
                  className={key === "early_stage" ? "highlight" : ""}
                  key={key}
                >
                  <span className="eyebrow">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3>{label}</h3>
                  <p>{report.sections[key]?.text || "판단 불가"}</p>
                  <small>
                    근거: {report.sections[key]?.evidence.join(", ") || "없음"}
                  </small>
                </article>
              ))}
            </div>
            <details>
              <summary>사용한 데이터 · 출처 · 공시 기준일</summary>
              {Object.entries(report.evidence).map(([id, item]) => (
                <div key={id}>
                  <h4>{id}</h4>
                  <pre>{JSON.stringify(item, null, 2)}</pre>
                </div>
              ))}
            </details>
            <ul className="limitations">
              {report.limitations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="analysts">
            <div className="section-heading">
              <h2>세 가지 시선, 하나의 리서치</h2>
              <span>THE ANALYST DESK</span>
            </div>
            <div className="analyst-grid">
              {personas.map(([initial, name, desc]) => (
                <article key={name}>
                  <div className="avatar">{initial}</div>
                  <h3>{name}</h3>
                  <p>{desc}</p>
                  <small>
                    원본 투자 철학을 활용한 AI 분석 · 실제 인물의 의견 아님
                  </small>
                </article>
              ))}
            </div>
            <div className="empty-state">
              <span>◎</span>
              <div>
                <h3>아직 실행한 분석이 없습니다.</h3>
                <p>
                  티커를 입력하고 분석을 실행하면, 출처와 기준일을 포함한 한국어
                  보고서가 표시됩니다.
                </p>
              </div>
            </div>
          </section>
        )}
        <footer>
          <span>INVESTMENT / RESEARCH WITH CONTEXT</span>
          <p>
            AI의 판단 강도는 실제 상승 확률이 아닙니다. 자료가 부족한 항목은
            판단 불가로 표시합니다.
          </p>
        </footer>
      </main>
    </div>
  );
}
