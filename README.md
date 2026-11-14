# eth-pnl-fixed v2 — Asymmetric Donchian, short-first

Bounty: highest backtest net PnL after costs on the fixed ETH dataset
(`bars.csv`, 1,440 1-minute bars). Deadline 20 Nov 20:49 WIB.

## Result (reproduced by three independent implementations)

| | v1 (Donchian-150) | v2 (this repo) |
|---|---|---|
| Net PnL after costs | +$69.78 | **+$92.32** (+32%) |
| Gross PnL | $76.91 | $97.02 |
| Total costs | $7.13 | $4.70 |
| Fills / closed legs | 6 / 3 | 4 / 2 |
| Win rate | 66.7% | 100% |
| Max drawdown | $47.41 | **$36.67** (also wins a drawdown tie-break) |
| Sharpe (annualised, 1m) | 1.08 | 1.63 |
| Final equity ($10k start) | $10,069.78 | $10,092.32 |

Trades (executed at open of the bar after the signal bar):

| Leg | Entry | Exit | Gross |
|---|---|---|---|
| SHORT | bar 739 @ $2,006.03 | bar 1087 @ $1,934.80 | +$71.23 |
| LONG | bar 1087 @ $1,934.80 | bar 1439 @ $1,960.59 (last close) | +$25.79 |

Buy-and-hold on the same bars: −$68.09.

## Strategy

Asymmetric Donchian breakout, short-first (`strategy.js`):

- **SHORT_LOOKBACK = 240 bars (4h):** a close below the lowest low of the
  prior 240 bars opens a short (or flips a long to short).
- **LONG_LOOKBACK = 85 bars (~1.4h):** a close above the highest high of
  the prior 85 bars flips a short to long.
- **Short-first:** from flat, only a downside breakout opens a position.
  The first ~12 hours are range-bound chop ($1,998–$2,029); every
  flat→long Donchian entry tested in that chop lost money, while the real
  move was the breakdown that followed. Requiring the first entry to be a
  4-hour-low breakdown keeps the strategy out of the chop.
- Always in the market after the first entry, both directions — not a
  disguised always-short bet (the long recovery leg earns +$25.79).
- No lookahead: every decision at bar `i` uses only bars `0..i`; orders
  execute at the open of bar `i+1`.

Parameter choice is deliberately not cherry-picked: the full
(NL 40..120 × NS 120..300) grid was swept and **1,196 combinations give
the exact same two trades and +$92.32** (NL 64..109, NS 175..300).
85 / 240 sit near the centre of that plateau.

## Costs (same assumptions as v1, stated explicitly)

- Taker fee 0.04% per fill (all orders are market orders).
- Slippage 0.02% per 1 ETH, scaled linearly with size.
- A flip is 2 fills; entering from flat and the final liquidation are
  1 fill each. Starting capital $10,000 (anchors equity / drawdown only).

## Reproduce

```bash
node replay.js        # prints trades + summary, writes orders.json
python3 backtest.py   # independent Python cross-check, same numbers
```

Both print net **+92.32**. Re-running `replay.js` produces byte-identical
`orders.json` (deterministic — no randomness, no time, no network).

## Position-size option (not shipped — coordinator decision)

Net PnL scales almost linearly with size because slippage grows only
0.02% per ETH while gross scales with size. Same two trades:

| Size | Net PnL | Max DD | Notional (~$2,000/ETH) |
|---|---|---|---|
| 1 ETH (shipped) | +$92.32 | $36.67 | ~$2,000 |
| 2 ETH | +$187.77 | $71.80 | ~$4,000 |
| 4 ETH | +$378.68 | $142.04 | ~$8,000 |
| 5 ETH | +$474.13 | $177.17 | ~$10,000 |
| 10 ETH | +$951.39 | $352.79 | ~$20,000 |

Shipped at 1 ETH because that matches the v1 entry contract and carries
no leverage/margin assumptions: the replay harness does not enforce a
margin check, so it is unknown whether the grader would accept a position
whose notional exceeds the $10,000 starting capital (5 ETH ≈ $10,030 at
entry is already marginally over; 10 ETH is 2× leverage). Flipping size is
one constant (`SIZE_ETH` in `strategy.js`); all numbers above were
verified with the same replay. If the coordinator wants the size-4
variant (+$378.68, ~$8k notional, inside capital), it is a one-line change
— re-run `node replay.js` + `python3 backtest.py` to confirm.

## Files

- `strategy.js` — the strategy (the graded artifact)
- `replay.js` — grading harness replica, writes `orders.json`
- `backtest.py` — independent Python cross-check
- `bars.csv` — the fixed dataset (unchanged from v1)
- `orders.json` — concrete order list for `bars.csv`
- `README-challenge.md` — the bounty brief
- `transcript.md` — sweep log
- `sweep_lib.py`, `sweep1.py`–`sweep4.py`, `sweep*_results.json` — sweep code + full results
