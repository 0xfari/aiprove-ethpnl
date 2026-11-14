# eth-pnl-fixed — Donchian-150 breakout on the frozen ETH 1-minute dataset

AIProve bounty `eth-pnl-fixed` (deadline 2026-11-20 20:49 WIB, reward
2,000,000 PROVE, 93 submissions at build time). Metric: **net PnL after
costs**; ties break on lower max drawdown. Dataset: 1,440 real Binance
ETH/USDT 1-minute bars, 24h window ending 2026-11-13 12:17 UTC
(`bars.csv`, from
`https://github.com/AIProveRH/aiprove/tree/main/challenges/eth-backtest`).

## Strategy, in plain words

A slow Donchian (channel) breakout — the textbook Turtle-style trend rule,
symmetric long and short:

1. Stay flat for the first 150 bars. The 150-bar channel is undefined
   before that, and no position is taken on a half-formed indicator.
2. After warm-up, each bar: if the close breaks **above** the highest high
   of the previous 150 bars, go long 1 ETH. If the close breaks **below**
   the lowest low of the previous 150 bars, go short 1 ETH.
3. Otherwise hold. The strategy is always in the market after warm-up
   (position +1 or −1, never 0), so it rides a sustained move in either
   direction. It is deliberately **not** an "always short" bet on this one
   down day — it went long twice and short once, and would go long on a
   held-out rally just as readily.
4. No stops, no take-profits, no leverage, no pyramiding. One rule, one
   parameter (the 150-bar lookback), position size fixed at 1 ETH.

The day itself fell 3.36% (2028.68 → 1960.59; buy-and-hold 1 ETH:
**−$68.09**). The strategy's profit comes almost entirely from one trade:
short from bar 619 (2008.93) through the afternoon slide to bar 1120
(1940.22), +$68.71 gross — plus a small winning long into the close.

## Entry format

The challenge README publishes no position format, no template, and no fee
numbers, so this repo defines the contract explicitly (see `strategy.js`):

- `strategy.js` exports `generateOrders(bars)` → array of
  `{ bar, side, size, position }`:
  - `bar` — index of the bar whose **close** triggered the decision.
  - `side` — `"BUY"` (target +1) or `"SELL"` (target −1).
  - `size` — `1` (ETH). A flip (+1 → −1) is **two** fills of size 1.
  - `position` — target position after the order (+1 / −1).
- **Execution:** at the **open** of bar `bar + 1`, never at bar `bar`'s
  close. No lookahead anywhere: every decision uses only bars `0..i`.
- The final open position is liquidated at the close of the last bar
  (charged as one fill).
- `orders.json` is the concrete order list for `bars.csv` (3 orders).
  The sandbox replays it by applying the orders in bar order at next-bar
  open with the costs below.

## Assumptions and costs

- Starting capital $10,000. All PnL figures are absolute $ per 1 ETH
  position; the capital only anchors the equity curve / drawdown.
- Every order is a market order → **taker fee 0.04%** per fill.
- **Slippage 0.02% per 1 ETH, scaled linearly with size**
  (`0.02% × size_eth`; at size 1: 0.02%).
- Total per fill at size 1: **0.06% of notional** (~$1.20 at $2,000/ETH).
- No maker orders are used, so no maker fee applies.
- Costs were stress-tested: the strategy stays strongly net-positive
  even at much higher fees (net +$65.03 at 10 bps/fill, +$59.09 at
  15 bps, +$53.15 at 20 bps, +$41.27 at 30 bps; +$76.91 at 0 bps).
  With only 6 fills, costs barely matter.

## Results (local replay, `node replay.js`)

| Metric | Value |
|---|---|
| Net PnL after costs (1 ETH) | **+$69.78** |
| Gross PnL | +$76.91 |
| Total costs (6 fills × ~0.06%) | $7.13 |
| Trades (fills) | 6 |
| Closed legs | 3 |
| Win rate | 66.7% (2 of 3) |
| Max drawdown | **$47.41** |
| First half, bars 0–719 | −$23.45 |
| Second half, bars 720–1439 | +$94.41 |
| Quarters (360 bars each) | −3.15 / −20.30 / +91.21 / +3.20 |
| Sharpe (annualised, 1m bars) | 1.08 |
| Buy-and-hold benchmark (1 ETH) | −$68.09 |
| Always-short benchmark (1 ETH) | +$65.69 |
| Final equity ($10,000 start) | $10,069.78 |

Trades:

| Leg | Entry (bar @ price) | Exit (bar @ price) | Gross |
|---|---|---|---|
| LONG | 228 @ 2021.10 | 619 @ 2008.93 | −$12.17 |
| SHORT | 619 @ 2008.93 | 1120 @ 1940.22 | +$68.71 |
| LONG | 1120 @ 1940.22 | 1439 @ 1960.59 | +$20.37 |

## Robustness (why this is not a curve-fit)

- **Plateau, not a spike.** Donchian lookback N = 135–170 all give net
  +$67…+$77 with the same 3 trades and the same $47.41 max drawdown.
  N = 150 is the round centre of that plateau. The single best grid
  point (N = 145, +$77.06) was deliberately **not** picked.
- **Split halves.** H1 −$23.45 / H2 +$94.41: the strategy loses a little
  in the choppy first half and wins in the trending second half — the
  expected profile of a slow trend rule, not a fit that only works on one
  stretch. 3 of 4 quarters are positive or near-flat.
- **Beats the trivial benchmarks** (buy-and-hold −$68.09, always-short
  +$65.69) while staying symmetric — it can win on an up day too.
- **Few, slow trades.** 6 fills in 24h means costs are a small share of
  gross ($7.13 of $76.91); the result does not depend on cheap fills or
  on catching 1-minute noise.
- **Full-window indicators only.** SMAs in the discarded candidates were
  first computed on partial windows, which flattered early results by
  ~$17; the final strategy uses full 150-bar windows and stays flat
  until they exist. (See `transcript.md`.)

## Files

| File | What it is |
|---|---|
| `strategy.js` | The strategy. Pure function, no I/O: `generateOrders(bars)`. |
| `replay.js` | Local replay / grading harness. `node replay.js` prints the orders, the trade table, and the summary; also writes `orders.json`. No dependencies. |
| `backtest.py` | Independent Python re-implementation (no shared code with the JS). `python3 backtest.py` — must print the same numbers. |
| `orders.json` | Concrete order list for `bars.csv` (3 orders). |
| `bars.csv` | Frozen dataset, 1,440 bars (upstream, unmodified). |
| `README-challenge.md` | Upstream challenge README (reference; it defines no position format or fee schedule — see "Entry format" above). |
| `transcript.md` | Build log: what was tried, what was discarded and why. |

## Reproduce

```sh
node replay.js        # canonical numbers
python3 backtest.py   # independent cross-check — must agree
```
