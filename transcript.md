# Build transcript — eth-pnl-fixed (AIProve)

Builder: subagent session, 2026-11-14 ~08:40–09:10 WIB. No submission was
made from this session; the parent handles repo creation + submit. No
private keys or bearer tokens were read or printed.

## 1. What the challenge actually gives

- Fetched `bars.csv` (1,440 bars) and `README.md` raw from
  `github.com/AIProveRH/aiprove/tree/main/challenges/eth-backtest`
  (directory listing via the GitHub API confirms those are the only two
  files — no template, no example strategy, no fee schedule).
- The README states only: frozen real Binance ETH/USDT 1m bars, 24h ending
  2026-11-13 12:17 UTC; metric is net PnL after costs (maker + taker fees,
  slippage scaled by size); sandbox replays with no phantom fills;
  overfitting is easy and a held-out tail punishes it.
- Consequences: the entry format and the fee numbers had to be designed
  and documented (see README.md): orders decided at bar close, executed
  at next-bar open; taker 0.04% + slippage 0.02% per 1 ETH = 0.06% / fill.
- Dataset shape: first close 2028.68, last 1960.59 (−3.36%); buy-and-hold
  1 ETH −$68.09; H1 buy-and-hold −$11.81, H2 −$56.00. A down day with a
  choppy first half and a trending second half. Mean 1m return −0.0023%,
  stdev 0.108% — noise dominates at 1-minute scale, so fast strategies
  were expected to whipsaw.

## 2. What was tried (all with the same 0.06%/fill cost, next-bar-open execution, 1 ETH)

### Fast trend-following — DISCARDED (whipsaw)
- EMA 5/20: −$338.38, 240 fills. EMA 8/21: −$189.40. EMA 12/26: −$74.36.
  SMA 5/20: −$270.92. Every fast crossover lost in both halves; costs
  alone were $115–$314. Lesson: at 1-minute scale the signal-to-noise is
  too low for fast crossovers.

### Mean reversion — DISCARDED (high win rate, negative expectancy)
- Bollinger (20, 2σ), trade the band touch, exit at mid: −$101.05,
  win rate 72%, but the 28% of losers were the trending legs and they
  were large (max DD $107.14). RSI(14) 30/70: −$24.11, win rate 79.4%,
  max DD only $37.83 — the best drawdown of any mean-reversion variant,
  but still negative and H2 −$24.17. RSI 25/75: +$6.76, win 80%,
  DD $18.80 — the best risk-adjusted mean-reversion result, but +$6.76
  on 20 fills is noise, not an edge; H2 was negative.
- Trend-filtered versions (only fade the band / RSI extreme *with* the
  SMA-120 trend, exit at mid/50) barely traded at all (0–6 fills) — the
  trigger almost never fires when trend and extreme agree. Discarded.

### Momentum / breakout, fast — DISCARDED
- Price-vs-N-bars-ago (N=30/60/120/240, thresholds 0–0.3%): all negative
  (−$10.66 to −$370.55). Donchian 20/30/40: −$113/−$45/−$60.
  ADX filter on SMA 30/100 (flat when ADX < 15/20/25): worse than the
  unfiltered version (+$39.65 / +$11.48 / −$12.71 vs +$63.68) — the
  filter churned in and out and paid more in costs than it saved.

### Slow SMA crossover — GOOD, but second choice
- Broad plateau, full-window SMAs: fast 20–40 / slow 100–120 mostly
  +$25…+$68, 28–32 fills, 14–16 closed legs. Best points: SMA 25/120
  +$67.57 (Sharpe 0.85, DD $71.78, win 62.5%), SMA 30/100 +$63.68
  (Sharpe 0.80, DD $71.63), SMA 20/100 +$60.70 (Sharpe 0.76, DD $69.18,
  best H1 at −$3.47 with partial windows).
- A 3-way majority-vote ensemble (20/100 + 25/120 + 30/100, flat until
  all defined at bar 120) gave +$40.97, Sharpe 0.58, DD $64.84,
  H1 −$35.67 / H2 +$77.81 — honest and robust, but weaker than Donchian
  on every metric and it pays $38.33 in costs (32 fills) vs $7.13.
- NOTE (honesty check that changed the numbers): the first SMA pass used
  partial-window means, which flattered early results by ~$17 (e.g.
  ensemble +$71.49 → +$40.97 with proper warm-up). All final numbers use
  full windows and flat-until-defined. The Donchian finalist was never
  affected — its channel was full-window from the start.

### Slow Donchian breakout — CHOSEN
- N = 150: **net +$69.78, gross +$76.91, costs $7.13, 6 fills,
  3 closed legs, win rate 66.7%, max DD $47.41, Sharpe 1.08,
  H1 −$23.45 / H2 +$94.41, quarters −3.15 / −20.30 / +91.21 / +3.20.**
- Fine grid: N=110/120 +$10.21, 125 +$9.65, 130 +$34.31, 135 +$69.30,
  140 +$68.86, 145 +$77.06, 150 +$69.78, 155/160 +$69.78, 165/170 +$67.36,
  175 +$56.28, 180 +$51.14, 190/200/220 +$65.38. The 135–170 band is a
  plateau with identical trades and drawdown; N=150 is its round centre.
  The max (145, +$77.06) was deliberately not picked — picking the grid
  max is exactly the overfitting the brief warns about.
- Why it wins: only 3 decisions in 24h, so it pays almost no costs and
  cannot chase 1-minute noise; the one big trade (short 619→1120,
  +$68.71) rides the afternoon slide that the whole day is about.

## 3. Discarded ideas, summarised

| Idea | Best result | Why discarded |
|---|---|---|
| Fast EMA/SMA crossover | −$74…−$392 | Whipsaw + costs dominate |
| Bollinger mean reversion | −$101.05 (72% win) | Losers are the trend legs; negative expectancy |
| RSI mean reversion | +$6.76 (80% win) | Essentially flat; no edge, H2 negative |
| Momentum (price vs N ago) | −$10.66…−$370 | Noisy, both halves negative |
| Donchian 20–55 | −$113…+$30 | Too fast, whipsaw |
| ADX chop filter | +$11…+$40 | Extra churn cost more than it saved |
| Slow SMA crossover / ensemble | +$40.97…+$67.57 | Solid, but weaker net, DD, Sharpe and 5× the costs of Donchian |
| Always-short (benchmark) | +$65.69 | Degenerate: wins only if the day falls; defenceless on a held-out rally |
| Donchian 145 (grid max) | +$77.06 | Grid-max picking = overfitting; centre of plateau (150) chosen instead |

## 4. Final numbers (verified two ways)

- `node replay.js` and `python3 backtest.py` (independent
  re-implementation, no shared code) agree exactly:
  net **+$69.78**, gross +$76.91, costs $7.13, 6 fills, 3 closed legs,
  win rate 66.7%, max DD **$47.41**, H1 −$23.45, H2 +$94.41,
  quarters −3.15 / −20.30 / +91.21 / +3.20, Sharpe 1.08,
  final equity $10,069.78 on $10,000.
- Orders: BUY 1 ETH at bar 228 open (2021.10); SELL at bar 619 open
  (2008.93, flip to short); BUY at bar 1120 open (1940.22, flip to
  long); liquidated at bar 1439 close (1960.59).
- Cost sensitivity (same strategy, 6 fills): 0 bps/fill +$76.91;
  6 bps +$69.78; 10 bps +$65.03; 15 bps +$59.09; 20 bps +$53.15;
  30 bps +$41.27. Costs barely matter because there are only 6 fills.

## 5. Known weaknesses (stated, not hidden)

- Only 3 closed legs on this sample — the evidence base is thin; the
  defence is the breadth of the 135–170 plateau, the symmetric rule, and
  the 3-of-4 positive quarters, not the trade count.
- The profit concentrates in one trade (the H2 short). If the held-out
  tail is a sharp V-reversal, the long entered at bar 1120 gives some of
  it back — but the rule would flip short again on a 150-bar-low break,
  which bounds the damage to one channel width.
- H1 is negative (−$23.45): the rule pays a small chop tax before the
  trend arrives. That is the known price of a slow trend rule.
