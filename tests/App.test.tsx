// @vitest-environment jsdom
// Synthetic fixtures only; these tests do not call real providers.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("never starts paid analysis on load", () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  render(<App />);
  expect(screen.getByText("아직 실행한 분석이 없습니다.")).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});
it("shows missing configuration instead of simulated investment results", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ detail: "서버 키 설정 필요" }), {
      status: 503,
    }),
  );
  render(<App />);
  await userEvent.type(screen.getByLabelText("분석할 미국주식 티커"), "AAPL");
  await userEvent.click(screen.getByRole("button", { name: "분석 실행 ↗" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "서버 키 설정 필요",
  );
  expect(screen.queryByText("실제 API 분석")).toBeNull();
});
it("renders Korean report and source data from the async contract", async () => {
  const fixture = {
    mode: "live",
    ticker: "TEST",
    as_of: "2025-01-01",
    model: "synthetic-test-model",
    opinion: "중립·의견 혼재",
    analysts: [
      {
        name: "buffett",
        signal: "neutral",
        confidence: 60,
        reasoning: "합성 테스트 의견",
        abstained: false,
      },
    ],
    sections: {
      summary: { text: "테스트 전용 한국어 종합", evidence: ["F1"] },
    },
    evidence: {
      F1: { provider: "synthetic-test-only", filing_date: "2024-11-01" },
    },
    limitations: ["합성 테스트"],
  };
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "fixture-job", cached: true })),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "completed", result: fixture })),
    );
  render(<App />);
  await userEvent.type(screen.getByLabelText("분석할 미국주식 티커"), "TEST");
  await userEvent.click(screen.getByRole("button", { name: "분석 실행 ↗" }));
  expect(await screen.findByText("테스트 전용 한국어 종합")).toBeTruthy();
  expect(
    screen.getByText("모델 판단 강도 60/100 · 상승 확률 아님"),
  ).toBeTruthy();
  expect(screen.getByText(/2024-11-01/)).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
