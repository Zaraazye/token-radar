// The token radar's model, radar-3: a size curve fitted to the snapshot's own live tokens.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and
// every other rankable pre-token protocol the list leaves out: the early rows the radar exists
// to find. A protocol is pre-token when its record carries no token (no market cap, no CoinGecko
// id, no symbol); the live-token protocols are kept apart and shown at the market's own values,
// never mixed into the ranked board.
//
// The implied value follows only from the snapshot's own figures, in three steps, none of which
// names a protocol:
//
//   1. Size curve. On the 128 live-token protocols, log10(market cap) is fitted by ordinary
//      least squares on log10(TVL): log10(mcap) = a + b * log10(tvl). The fit is computed at
//      run time from the snapshot, never pasted in. The slope comes out near 0.52: a protocol
//      ten times larger in TVL is worth about 3.3x more, not 10x. Multiples fall with size
//      (correlation of log TVL with log multiple is -0.41), so a flat multiple misprices both
//      ends of the board. A flat median multiple is the starter's 0.25x for every protocol;
//      this fit replaces it.
//   2. Category tilt. Each category gets its own intercept, the mean of
//      (log10(mcap) - b * log10(tvl)) over its live tokens, shrunk toward the global intercept
//      with weight n / (n + 5). A category with fifteen live tokens keeps most of its own
//      level (Dexs sit above Lending by about 2.6x at the same TVL); a category with one live
//      token keeps almost none of it, so a single outlier cannot set a whole category's price.
//      The tilt is then capped at 0.30 in log10 (about 2x): no category, however thin its live
//      set, moves the curve by more than that.
//   3. Small adjustments. Seven-day TVL growth, damped (weight 0.25, clamped to -60..+120%),
//      and maturity: 0.6 + min(age, 1095) / 1095 * 0.4, so a protocol tracked for three years
//      counts fully and a brand-new one counts 0.6x. No chain-count term: on the live tokens
//      the number of chains correlates -0.02 with the multiple, so it adds nothing and is left
//      out rather than kept as decoration.
//
// The range around each implied value is the backtest's own central-50% interval: the 25th and
// 75th percentiles of the log residuals when the fitted model predicts the live tokens' market
// caps. It is wide on purpose — token multiples vary a hundredfold — and it is computed, not
// chosen.
//
// Every claim above is checked, not asserted: backtest() runs a deterministic 5-fold
// cross-validation over the live tokens and reports, for the global median multiple, the
// category-median model of radar-2 and this size curve, the median absolute log error and the
// share of predictions within 2x and 3x of the true market cap. The dashboard's Model tab
// prints that table, so a reader can see what the model gets wrong as well as what it gets.

import { farmSteps } from './farm.ts';

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: the dashboard states them and the backtest justifies them. */
export interface ModelConstants {
  shrink_k: number;
  tilt_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 5,
  tilt_cap: 0.3,
  growth_weight: 0.25,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  low_value_usd: number;
  high_value_usd: number;
  model: {
    curve_value_usd: number;
    tilt: number;
    category_live_n: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  low_value_usd: number;
  high_value_usd: number;
  curve_value_usd: number;
  tilt: number;
  category_live_n: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's fitted level: how its live tokens sit against the global size curve. */
export interface CategoryBenchmark {
  category: string;
  live_n: number;
  intercept: number;
  median_multiple: number;
}

/** One model's backtest line: 5-fold cross-validation over the live tokens. */
export interface BacktestLine {
  model: string;
  median_log_error: number;
  within_2x: number;
  within_3x: number;
  n: number;
}

/** The backtest's whole result, printed on the dashboard's Model tab. */
export interface BacktestResult {
  lines: BacktestLine[];
  range_low_factor: number;
  range_high_factor: number;
  residual_p25: number;
  residual_p75: number;
  live_n: number;
}

/** Everything the dashboard needs: the board, the live set, the fit and its backtest. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  fit: { intercept: number; slope: number; live_n: number };
  benchmarks: CategoryBenchmark[];
  backtest: BacktestResult;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  live_all: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list. */
function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length;
  return m % 2 === 1 ? v[(m - 1) / 2]! : (v[m / 2 - 1]! + v[m / 2]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Ordinary least squares of y on x; returns [intercept, slope]. */
function ols(xs: number[], ys: number[]): [number, number] {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let vx = 0;
  let cxy = 0;
  for (let i = 0; i < n; i++) {
    vx += (xs[i]! - mx) * (xs[i]! - mx);
    cxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const b = vx > 0 ? cxy / vx : 0;
  return [my - b * mx, b];
}

/** The live tokens: a market cap and a TVL, both positive. */
export function liveTokens(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** The global size curve, fitted on the live tokens at run time. */
export function fitCurve(live: SnapshotProtocol[]): { intercept: number; slope: number } {
  const xs = live.map((p) => Math.log10(p.tvl_usd));
  const ys = live.map((p) => Math.log10(p.mcap_usd!));
  const [a, b] = ols(xs, ys);
  return { intercept: a, slope: b };
}

/** Each category's intercept, shrunk toward the global one by n / (n + k), then capped so no
 *  category tilts the curve by more than the cap (0.30 in log10, about 2x): a single live token
 *  with a 400x multiple must not set its whole category's price. */
export function categoryTilts(
  live: SnapshotProtocol[],
  fit: { intercept: number; slope: number },
  k: number,
  cap: number,
): Map<string, { n: number; intercept: number; medianMultiple: number }> {
  const byCat = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    const c = p.category ?? 'Uncategorised';
    const arr = byCat.get(c);
    if (arr) arr.push(p);
    else byCat.set(c, [p]);
  }
  const out = new Map<string, { n: number; intercept: number; medianMultiple: number }>();
  for (const [c, ps] of byCat) {
    const raw = ps.reduce((s, p) => s + (Math.log10(p.mcap_usd!) - fit.slope * Math.log10(p.tvl_usd)), 0) / ps.length;
    const w = ps.length / (ps.length + k);
    const shrunk = w * raw + (1 - w) * fit.intercept;
    const intercept = Math.min(fit.intercept + cap, Math.max(fit.intercept - cap, shrunk));
    out.set(c, { n: ps.length, intercept, medianMultiple: median(ps.map((p) => p.mcap_usd! / p.tvl_usd)) });
  }
  return out;
}

/** The growth and maturity multipliers for one protocol. */
export function adjustments(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  return { growthPct, growthMult, maturityMult, age };
}

/** The full implied value: curve, tilt, growth and maturity, with the backtest's range around it. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  fit: { intercept: number; slope: number },
  tilts: Map<string, { n: number; intercept: number; medianMultiple: number }>,
  range: { low: number; high: number },
  model: ModelConstants,
): {
  implied: number;
  low: number;
  high: number;
  curve: number;
  tilt: number;
  categoryLiveN: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const t = tilts.get(p.category ?? 'Uncategorised');
  const intercept = t !== undefined ? t.intercept : fit.intercept;
  const tilt = intercept - fit.intercept;
  const curve = Math.pow(10, intercept + fit.slope * Math.log10(Math.max(1, p.tvl_usd)));
  const { growthPct, growthMult, maturityMult, age } = adjustments(p, asOf, model);
  const implied = Math.max(1, Math.round(curve * growthMult * maturityMult));
  const low = Math.max(1, Math.round(implied * range.low));
  const high = Math.max(low + 1, Math.round(implied * range.high));
  return { implied, low, high, curve: Math.round(curve), tilt, categoryLiveN: t !== undefined ? t.n : 0, growthPct, growthMult, maturityMult, age };
}

/** A deterministic shuffle: a linear congruential generator with a fixed seed, so two runs agree. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

const LOG2 = Math.log10(2);
const LOG3 = Math.log10(3);

/** One model's cross-validation line: median absolute log error and the shares within 2x and 3x. */
function cvLine(errors: number[]): { medianLogError: number; within2: number; within3: number } {
  const sorted = [...errors].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    medianLogError: median(errors),
    within2: sorted.filter((e) => e <= LOG2).length / n,
    within3: sorted.filter((e) => e <= LOG3).length / n,
  };
}

/**
 * The backtest: deterministic 5-fold cross-validation over the live tokens, comparing three ways
 * of pricing a token from TVL — the global median multiple, the category-median model of radar-2,
 * and this size curve — plus the fitted model's residual quartiles, which set the board's ranges.
 */
export function backtest(live: SnapshotProtocol[], asOf: string, model: ModelConstants): BacktestResult {
  const order = shuffled(live, 20261114);
  const folds: SnapshotProtocol[][] = [[], [], [], [], []];
  order.forEach((p, i) => folds[i % 5]!.push(p));

  const errGlobal: number[] = [];
  const errCategory: number[] = [];
  const errCurve: number[] = [];

  for (let f = 0; f < 5; f++) {
    const test = folds[f]!;
    const train = folds.flatMap((fold, i) => (i === f ? [] : fold));
    const globalMult = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
    const fit = fitCurve(train);
    const tilts = categoryTilts(train, fit, model.shrink_k, model.tilt_cap);
    for (const p of test) {
      const actual = p.mcap_usd!;
      // Global median multiple, no adjustments.
      errGlobal.push(Math.abs(Math.log10((p.tvl_usd * globalMult) / actual)));
      // Category median multiple (radar-2): winsorised, with its growth, maturity and chain terms.
      const same = train.filter((q) => (q.category ?? 'Uncategorised') === (p.category ?? 'Uncategorised'));
      const mult = same.length >= 3 ? median(same.map((q) => q.mcap_usd! / q.tvl_usd)) : globalMult;
      const clamped = Math.max(0.02, Math.min(3.0, mult));
      const { growthMult, maturityMult } = adjustments(p, asOf, { ...model, growth_weight: 0.5 });
      const chainMult = 1 + Math.min(p.chains.length - 1, 4) * 0.02;
      errCategory.push(Math.abs(Math.log10((p.tvl_usd * clamped * growthMult * maturityMult * chainMult) / actual)));
      // This size curve: fitted curve, shrunk category tilt, damped growth and maturity.
      const iv = impliedValue(p, asOf, fit, tilts, { low: 1, high: 1 }, model);
      errCurve.push(Math.abs(Math.log10(iv.implied / actual)));
    }
  }

  // The range: the fitted model's residuals on all live tokens, central-50% interval.
  const fullFit = fitCurve(live);
  const fullTilts = categoryTilts(live, fullFit, model.shrink_k, model.tilt_cap);
  const residuals = live
    .map((p) => {
      const iv = impliedValue(p, asOf, fullFit, fullTilts, { low: 1, high: 1 }, model);
      return Math.log10(p.mcap_usd! / iv.implied);
    })
    .sort((a, b) => a - b);
  const q = (x: number): number => residuals[Math.min(residuals.length - 1, Math.max(0, Math.floor(x * residuals.length)))]!;
  const rangeLow = Math.pow(10, q(0.25));
  const rangeHigh = Math.pow(10, q(0.75));

  const g = cvLine(errGlobal);
  const c = cvLine(errCategory);
  const v = cvLine(errCurve);
  return {
    lines: [
      { model: 'Global median multiple', median_log_error: g.medianLogError, within_2x: g.within2, within_3x: g.within3, n: live.length },
      { model: 'Category median + adjustments (radar-2)', median_log_error: c.medianLogError, within_2x: c.within2, within_3x: c.within3, n: live.length },
      { model: 'Size curve + shrunk tilt (radar-3)', median_log_error: v.medianLogError, within_2x: v.within2, within_3x: v.within3, n: live.length },
    ],
    range_low_factor: rangeLow,
    range_high_factor: rangeHigh,
    residual_p25: q(0.25),
    residual_p75: q(0.75),
    live_n: live.length,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word, wrapped, staked or staking, in a name: a product of a token that already trades. */
const WRAPPED = /\b(wrapped|staked|staking)\b/i;

/** Categories that are a wrapped, staked or bridged product, never a launch of their own. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol must not start with: an exchange's own product, not a launch. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not a wrapped/staked/bridged product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
function stepText(step: { text: string; cost: string; time: string }): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  fit: { intercept: number; slope: number },
  tilts: Map<string, { n: number; intercept: number; medianMultiple: number }>,
  range: { low: number; high: number },
  model: ModelConstants = MODEL,
): BoardRow[] {
  // Every rankable pre-token protocol is in: the watchlist is the floor, and the early radar is
  // every rankable protocol the list leaves out too — including the twenty rankable protocols
  // above the floor that the watchlist's own rule leaves out. A watchlist slug the snapshot no
  // longer carries cannot happen, but coverage is never gambled on a missing record: it is
  // checked again in boardIssue.
  const chosen = snapshot.protocols.filter((p) => isRankable(p));

  const scored = chosen.map((p) => ({ p, iv: impliedValue(p, snapshot.as_of, fit, tilts, range, model) }));
  scored.sort((a, b) => b.iv.implied - a.iv.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.iv.age,
    implied_value_usd: s.iv.implied,
    low_value_usd: s.iv.low,
    high_value_usd: s.iv.high,
    model: {
      curve_value_usd: s.iv.curve,
      tilt: round4(s.iv.tilt),
      category_live_n: s.iv.categoryLiveN,
      growth_pct: s.iv.growthPct,
      growth_multiplier: round4(s.iv.growthMult),
      maturity_multiplier: round4(s.iv.maturityMult),
      age_days: s.iv.age,
    },
    farm_steps: farmSteps(s.p, s.iv.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    low_value_usd: row.low_value_usd,
    high_value_usd: row.high_value_usd,
    curve_value_usd: row.model.curve_value_usd,
    tilt: row.model.tilt,
    category_live_n: row.model.category_live_n,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const live = liveTokens(snapshot.protocols);
  const fit = fitCurve(live);
  const tilts = categoryTilts(live, fit, model.shrink_k, model.tilt_cap);
  const bt = backtest(live, snapshot.as_of, model);
  const range = { low: bt.range_low_factor, high: bt.range_high_factor };
  const board = buildBoard(snapshot, fit, tilts, range, model);
  const liveRowsOut = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const benchmarks: CategoryBenchmark[] = [...tilts.entries()]
    // Full precision here: the page recomputes every row from these numbers, and rounding them
    // to four decimals moved the recompute by ~0.1%. Display rounds them; the data does not.
    .map(([category, t]) => ({ category, live_n: t.n, intercept: t.intercept, median_multiple: round4(t.medianMultiple) }))
    .sort((a, b) => b.live_n - a.live_n || (a.category < b.category ? -1 : 1));
  const liveAll: LiveRow[] = live
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    fit: { intercept: fit.intercept, slope: fit.slope, live_n: live.length },
    benchmarks,
    backtest: bt,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: liveRowsOut.length,
    rows: board.map(radarRow),
    live: liveRowsOut,
    live_all: liveAll,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!Number.isSafeInteger(r.low_value_usd) || r.low_value_usd <= 0) return `${r.slug} has low value ${r.low_value_usd}`;
    if (!Number.isSafeInteger(r.high_value_usd) || r.high_value_usd <= r.low_value_usd) return `${r.slug} has high value ${r.high_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
