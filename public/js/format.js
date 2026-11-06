export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function num(v, d) {
  if (v == null || !isFinite(v)) return '—';
  if (d == null) d = Math.abs(v) >= 10 || v === 0 ? 2 : 4;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Decimals that suit a price level (FX 1.0834 vs stocks 231.40). */
export const decFor = (price, currency) =>
  ['KRW', 'JPY'].includes(currency) ? 0 : price != null && Math.abs(price) < 10 ? 4 : 2;

export const signed = (v, d) => (v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + num(v, d));
export const pct = (v) => (v == null || !isFinite(v) ? '—' : signed(v, 2) + '%');
export const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'dn' : 'flat');

export function big(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(Math.round(v));
}

export function ago(sec) {
  if (!sec) return '';
  const m = Math.round((Date.now() / 1000 - sec) / 60);
  if (m < 60) return `${Math.max(m, 0)}분 전`;
  if (m < 1440) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
}

/** Inline SVG sparkline. */
export function spark(values, w = 80, h = 20) {
  const v = (values || []).filter((x) => x != null && isFinite(x));
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - ((x - lo) / span) * h).toFixed(1)}`).join(' ');
  const c = v[v.length - 1] >= v[0] ? 'var(--up)' : 'var(--dn)';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none"><polyline fill="none" stroke="${c}" stroke-width="1.2" points="${pts}"/></svg>`;
}
