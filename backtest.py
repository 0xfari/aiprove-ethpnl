#!/usr/bin/env python3
"""Independent Python cross-check of strategy.js + replay.js.

Re-implements the Donchian-150 breakout from scratch (no shared code with
the JS) and prints the same summary. Run: python3 backtest.py [bars.csv]
Expected: net +69.78, 6 fills, 3 closed legs, win rate 66.7%, max DD 47.41.
"""
import csv
import math
import statistics
import sys

LOOKBACK = 150
TAKER_FEE = 0.0004
SLIPPAGE_PER_ETH = 0.0002
START = 10000.0


def main(path="bars.csv"):
    rows = list(csv.DictReader(open(path)))
    bars = [{k: float(v) for k, v in r.items()} for r in rows]
    n = len(bars)
    opens = [b["open"] for b in bars]
    closes = [b["close"] for b in bars]
    highs = [b["high"] for b in bars]
    lows = [b["low"] for b in bars]

    pos, entry, cash, total_cost = 0, None, 0.0, 0.0
    fills, closed, wins = 0, 0, 0
    equity = [START]
    peak, max_dd = START, 0.0
    legs = []
    entry_bar = None

    def cost(px):
        return (TAKER_FEE + SLIPPAGE_PER_ETH) * px

    for i in range(n - 1):
        # target at bar i (channel = prior LOOKBACK bars only)
        target = pos
        if i >= LOOKBACK:
            hi = max(highs[i - LOOKBACK:i])
            lo = min(lows[i - LOOKBACK:i])
            if closes[i] > hi:
                target = 1
            elif closes[i] < lo:
                target = -1
        if target != pos:
            px = opens[i + 1]
            n_fills = abs(target - pos)
            if pos != 0:
                gross = (px - entry) * pos
                cash += gross - cost(px)
                total_cost += cost(px)
                fills += 1
                closed += 1
                wins += gross > 0
                legs.append((entry_bar, entry, pos, i + 1, px, round(gross, 2)))
                cash -= (n_fills - 1) * cost(px)
                total_cost += (n_fills - 1) * cost(px)
                fills += n_fills - 1
            else:
                cash -= n_fills * cost(px)
                total_cost += n_fills * cost(px)
                fills += n_fills
            entry = px if target != 0 else None
            entry_bar = i + 1 if target != 0 else None
            pos = target
        unreal = pos * (closes[i + 1] - entry) if pos != 0 else 0.0
        eq = START + cash + unreal
        equity.append(eq)
        peak = max(peak, eq)
        max_dd = max(max_dd, peak - eq)

    if pos != 0:
        px = closes[-1]
        gross = (px - entry) * pos
        cash += gross - cost(px)
        total_cost += cost(px)
        fills += 1
        closed += 1
        wins += gross > 0
        legs.append((entry_bar, entry, pos, n - 1, px, round(gross, 2)))

    rets = [equity[i] / equity[i - 1] - 1 for i in range(1, len(equity))]
    sharpe = statistics.mean(rets) / statistics.pstdev(rets) * math.sqrt(1440)
    print(f"bars: {n}")
    print(f"legs: {legs}")
    print(f"net PnL after costs: {cash:.2f}")
    print(f"gross PnL: {cash + total_cost:.2f}  total costs: {total_cost:.2f}")
    print(f"fills: {fills}  closed legs: {closed}  "
          f"win rate: {100 * wins / closed:.1f}%")
    print(f"max drawdown: {max_dd:.2f}")
    print(f"H1 (bars 0-719): {equity[720] - START:.2f}  "
          f"H2 (bars 720-1439): {equity[-1] - equity[720]:.2f}")
    print(f"quarters: {[round(equity[min((q + 1) * 360, n - 1)] - (START if q == 0 else equity[q * 360]), 2) for q in range(4)]}")
    print(f"Sharpe (annualised, 1m bars): {sharpe:.2f}")
    print(f"final equity: {START + cash:.2f}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "bars.csv")
