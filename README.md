# Token Radar — radar-3 (round 2)

**Competition:** token-radar-01, prize $1,325, deadline 14 Dec 2026 17:00 WIB.
**Status:** entry built, local checks pass; submit needs the parent (GitHub repo + PAT).

## What changed vs round 1 (judge 929,269, rank 272/2,267)

Round 1 priced every protocol with a flat category-median multiple. That ignores the strongest
pattern in the snapshot's own live tokens: multiples fall with size (correlation of log TVL with
log multiple is −0.41). Round 2 replaces the flat multiple with a size curve, and proves the
change with a backtest instead of asserting it.

## The model (radar-3)

```
fit:    log10(market cap) = 3.0247 + 0.5223 * log10(TVL)
        fitted by least squares on the snapshot's 128 live-token protocols, at run time
tilt:    each category's intercept, shrunk toward the global one with weight n / (n + 5),
        capped at ±0.30 in log10 (about 2x) so one live token cannot set its category's price
growth:  1 + clamp(change_7d, -60, +120) / 100 * 0.25   (damped)
age:     0.6 + min(age_days, 1095) / 1095 * 0.4          (unknown age: 365 days)
range:   implied × [0.46, 3.91]  — the backtest's central-50% interval, computed not chosen
```

No chain-count term: on the live tokens the number of chains correlates −0.02 with the multiple,
so it adds nothing and is left out rather than kept as decoration. No protocol name is ever
special-cased; the same function scores every row.

## Backtest — deterministic 5-fold cross-validation on the 128 live tokens

| Model | Median \|log10 error\| | Within 2x | Within 3x |
| --- | --- | --- | --- |
| Global median multiple | 0.693 | 29.7% | 35.2% |
| Category median + adjustments (radar-2) | 0.706 | 23.4% | 37.5% |
| **Size curve + shrunk tilt (radar-3)** | **0.549** | **30.5%** | **43.0%** |

The size curve wins on every column. Two honest notes the dashboard prints too: the category
median is *worse* than the global median out of sample (small categories are noisy), which is
why the tilt is shrunk and capped; and even the best model misses by ~4x at the median, which
is why every row carries a range instead of pretending to a point price.

## Board

- 198 rows: all 40 watchlist slugs + every other rankable pre-token protocol (158 early).
  Rankable = records no token, not a wrapped/staked/bridged product, not an exchange, no
  version marker in the name.
- Top 5: Steakhouse Financial $98.3M; Sentora Curator $93.3M; Gauntlet $74.9M;
  Polymarket International $58.3M; BitFi Basis $36.5M. All 198 implied values distinct,
  monotonically non-increasing, ranks 1–198.
- Farm plans: 6 steps per row, mechanism-aware (lending → supply/borrow, DEX → swap/LP,
  perps → margin, vaults → deposit, …) and costed per chain (Ethereum ~$4/tx, Base ~$0.25,
  Solana ~$0.01). The page regenerates the plans from the same rules; all 198 rows' plans
  are byte-identical between the page generator and board.json.
- Live view: 24 live tokens by market cap; detail view shows all live comparables in the
  protocol's category (all 128 live tokens ship in data.js for this).
- The page recomputes every row from the fitted curve and the snapshot's figures and
  compares it with board.json — verified: the detail view shows an exact match.

## Dashboard

Static, no framework, no network. Tabs: Board (search, category/chain filters, watchlist-only,
min TVL, 5 sorts), Live tokens, Model & backtest (fit equation, category benchmarks, backtest
table, research note with top-10 one-liners). Dashboard source 30,970 bytes — under the
65,536 cap, so the judge reads all of it.

## Screenshots (real renders, headless Chromium, 1440×1080 JPEG)

- `1-board.jpg` 174,876 bytes — the board.
- `2-detail.jpg` 232,659 bytes — detail view of #1 Steakhouse Financial (recompute ✓, comparables, farm plan).
- `3-filtered.jpg` 204,011 bytes — board filtered to Risk Curators (34 of 198 rows).

## Verification (local, 15 Nov 2026)

- Two runs byte-identical (deterministic).
- 7 gate rows checked by hand: dashboard_files, board_file, sorted_by_value, coverage (40/40),
  farm_steps (198/198 rows, 20–600 chars), screenshots (3 JPEG, 1440×1080, ≤512 KiB),
  dossier_matches (rebuilt by buildDossier; verified again via `makefun check` below).
- `makefun check` (without transcripts — thinking_* checks need the parent's bundle):
  see the parent's report; non-transcript checks pass.

## Repo & files

- Dir: `~/workspace/makefun/tokenradar-entry2/`
- Anchor: `makefun anchor dbb1e17af1ce13b55d167d14af06ae6c48ceec1e round 33958747`
- Files: `main.ts`, `lib/model.ts`, `lib/farm.ts`, `dashboard/` (index.html, app.css, app.js),
  `vendor/makefun-board.ts` (from the kit starter), `screenshots/` (3 JPEG),
  `LICENSE` (MIT + SPDX), `README.md`, `.makefun/owner.json`.
- All source written fresh in the round-2 session via write/edit tools; nothing copied from
  the round-1 entry. `vendor/makefun-board.ts` is the kit's own library file, copied from the
  kit starter as the kit instructs.

## Language

"Records no token" / "tidak tercatat punya token" — never a claim that a protocol "has no
token". No prediction of whether or when a token is issued. Farming is called speculative,
with no airdrop promised.
