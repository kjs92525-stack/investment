// Command-line parser. Pure functions (also run under node:test).
//
// Accepts Bloomberg-style input:
//   AAPL DES            AAPL US EQUITY GP <GO>      GP AAPL 1Y
//   005930 KS DES       WEI      FX      W ADD NVDA   HELP
//   A bare ticker opens DES.

export const FUNCS = {
  DES: { ticker: 'required', title: '종목 개요', help: '가격·등락·52주 범위·수익률' },
  GP: { ticker: 'required', title: '차트', help: '캔들 차트. 봉: 5분 15분 60분 일봉 주봉 월봉' },
  N: { ticker: 'optional', title: '뉴스', help: '종목 뉴스 (종목 없으면 시장 뉴스)' },
  WEI: { ticker: 'none', title: '세계 지수', help: '미국·유럽·아시아 주요 지수' },
  FX: { ticker: 'none', title: '환율', help: '원·달러 등 주요 통화' },
  CMDTY: { ticker: 'none', title: '원자재', help: '원유·금·은·구리·천연가스' },
  CRYPTO: { ticker: 'none', title: '암호화폐', help: '비트코인·이더리움 등' },
  GC: { ticker: 'none', title: '미 국채 금리', help: '3개월·5년·10년·30년 금리 곡선' },
  W: { ticker: 'optional', title: '관심 종목', help: 'W ADD 티커 / W DEL 티커' },
  HELP: { ticker: 'none', title: '도움말', help: '명령어 목록' },
};

export const ALIASES = { Q: 'DES', GIP: 'GP', CN: 'N', TOP: 'N', FXC: 'FX', WB: 'GC', BTC: 'CRYPTO', H: 'HELP', '?': 'HELP' };

// Candle sizes for GP, in button order. Keys are what the API takes.
export const INTERVALS = [
  ['5MIN', '5분'], ['15MIN', '15분'], ['60MIN', '60분'], ['D', '일봉'], ['W', '주봉'], ['M', '월봉'],
];
export const IV_LABEL = Object.fromEntries(INTERVALS);
const IV_WORDS = {
  '5MIN': '5MIN', '5분': '5MIN', '5분봉': '5MIN',
  '15MIN': '15MIN', '15분': '15MIN', '15분봉': '15MIN',
  '60MIN': '60MIN', '1H': '60MIN', '60분': '60MIN', '60분봉': '60MIN', '시간봉': '60MIN',
  D: 'D', DAY: 'D', DAILY: 'D', '일': 'D', '일봉': 'D',
  W: 'W', WK: 'W', WEEK: 'W', WEEKLY: 'W', '주': 'W', '주봉': 'W',
  M: 'M', MO: 'M', MONTH: 'M', MONTHLY: 'M', '월': 'M', '월봉': 'M',
  // older period words still work
  '1D': '5MIN', '5D': '15MIN', '1M': '60MIN', '6M': 'D', '1Y': 'D', '5Y': 'W', MAX: 'M',
};
const ACTIONS = ['ADD', 'DEL'];

// Bloomberg market-sector words that carry no meaning here.
const NOISE = new Set(['EQUITY', 'INDEX', 'CURNCY', 'COMDTY', 'CORP', 'GOVT', '<GO>', 'GO']);

// Bloomberg exchange code -> Yahoo suffix
const EXCH = { US: '', UN: '', UW: '', UQ: '', KS: '.KS', KQ: '.KQ', JP: '.T', JT: '.T', LN: '.L', HK: '.HK', GR: '.DE', GY: '.DE', FP: '.PA', CN: '.TO', AU: '.AX' };

const TICKER_RE = /^[A-Z0-9^=.\-]{1,20}$/;

function funcOf(tok) {
  if (FUNCS[tok]) return tok;
  if (ALIASES[tok]) return ALIASES[tok];
  return null;
}

/**
 * @returns {{ok:true, func:string, ticker:string|null, iv:string|null, action:string|null}
 *          | {ok:false, error:string}}
 */
export function parseCommand(input) {
  let toks = String(input || '')
    .toUpperCase()
    .replace(/<GO>/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t));
  if (!toks.length) return { ok: false, error: '명령을 입력하세요. HELP 를 입력하면 목록이 나옵니다.' };

  // Exchange codes right after a ticker: "005930 KS" -> "005930.KS"
  const merged = [];
  for (const t of toks) {
    const prev = merged[merged.length - 1];
    if (prev && t in EXCH && !funcOf(prev) && !prev.includes('.')) {
      merged[merged.length - 1] = prev + EXCH[t];
    } else merged.push(t);
  }
  toks = merged;

  // Candle size ("NVDA GP 주봉", "NVDA W"). Never the first word, so tickers
  // like D (Dominion) or W (Wayfair) and the W watchlist still work.
  let iv = null;
  if (!toks.some((t) => ACTIONS.includes(t))) {
    for (let i = toks.length - 1; i >= 1; i--) {
      if (IV_WORDS[toks[i]]) {
        iv = IV_WORDS[toks[i]];
        toks.splice(i, 1);
        break;
      }
    }
  }

  // The function is the LAST function word, so a ticker that looks like a
  // function ("W DES" = Wayfair) still works. "W ADD NVDA" -> W.
  let fIdx = -1;
  for (let i = toks.length - 1; i >= 0; i--) {
    if (funcOf(toks[i])) {
      fIdx = i;
      break;
    }
  }
  const action = toks.find((t) => ACTIONS.includes(t)) || null;
  const rest = toks.filter((t, i) => i !== fIdx && t !== action);

  let func = fIdx >= 0 ? funcOf(toks[fIdx]) : null;
  let ticker = rest[0] || null;
  if (rest.length > 1) return { ok: false, error: `알 수 없는 입력: ${rest.slice(1).join(' ')}` };

  if (!func) func = iv ? 'GP' : 'DES';
  const spec = FUNCS[func];
  if (ticker) {
    if (/^\d{6}$/.test(ticker)) ticker += '.KS'; // Korean code without suffix
    if (!TICKER_RE.test(ticker)) return { ok: false, error: `잘못된 티커: ${ticker}` };
  }
  if (spec.ticker === 'required' && !ticker) return { ok: false, error: `${func} 는 종목이 필요합니다. 예: AAPL ${func}` };
  if (spec.ticker === 'none' && ticker) return { ok: false, error: `${func} 는 종목 없이 입력합니다.` };
  if (func === 'W' && action && !ticker) return { ok: false, error: `예: W ${action} NVDA` };
  if (func === 'W' && ticker && !action) return { ok: false, error: '예: W ADD NVDA 또는 W DEL NVDA' };
  if (iv && func !== 'GP') return { ok: false, error: '봉(일봉·주봉 등)은 GP 와 함께 씁니다.' };

  return { ok: true, func, ticker, iv: func === 'GP' ? iv || 'D' : null, action };
}

/** Text shown in a panel header, Bloomberg style: "AAPL US Equity  GP". */
export function describe(cmd) {
  const t = cmd.ticker ? `${cmd.ticker} ` : '';
  return `${t}${cmd.func}${cmd.iv && cmd.iv !== 'D' ? ' ' + IV_LABEL[cmd.iv] : ''}`;
}

/** Suggestions for the autocomplete dropdown (functions only; tickers come from search). */
export function suggestFuncs(input) {
  const last = String(input || '').toUpperCase().trim().split(/\s+/).pop() || '';
  return Object.entries(FUNCS)
    .filter(([k]) => !last || k.startsWith(last))
    .map(([k, v]) => ({ key: k, title: v.title, help: v.help }));
}
