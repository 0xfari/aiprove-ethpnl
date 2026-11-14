// replay.js — local replay / grading harness for eth-pnl-fixed (v2).
// Usage: node replay.js [bars.csv]
// Reads bars.csv + strategy.js, executes every order at the OPEN of the
// next bar (no phantom fills), applies the stated costs, liquidates any open
// position at the close of the last bar, and prints the full trade table
// plus the summary the bounty scores on (net PnL after costs).
//
// COSTS (the challenge README states "maker and taker fees, plus slippage
// scaled by size" but publishes no numbers, so this harness states its
// assumptions explicitly — the same ones used in the Python cross-check):
//   - Every order in this strategy is a market order -> taker fee 0.04%.
//   - Slippage 0.02% per 1 ETH, scaled linearly with size:
//     slippage = 0.02% * size_eth. (At size 1 ETH: 0.02%.)
//   - Total per fill at size 1: 0.06% of notional (~$1.20 at $2,000/ETH).
//   - A flip (+1 -> -1 or -1 -> +1) is 2 fills; entering from flat and the
//     final liquidation are 1 fill each.
//   - Starting capital $10,000. PnL figures are absolute $ per 1 ETH
//     position; the capital only anchors the equity curve / drawdown $.
//
// No dependencies, Node >= 18. Exit code 0; also writes orders.json.
'use strict';

const fs = require('fs');
const path = require('path');
const { generateOrders, SIZE_ETH } = require('./strategy');

const TAKER_FEE = 0.0004;      // 0.04% per fill (market order)
const SLIPPAGE_PER_ETH = 0.0002; // 0.02% per 1 ETH, scaled by size
const START_CAPITAL = 10000;

function costPerFill(price, size) {
  return (TAKER_FEE + SLIPPAGE_PER_ETH * size) * price;
}

function loadBars(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const v = line.split(',');
    const row = {};
    header.forEach((h, k) => { row[h] = Number(v[k]); });
    return row;
  });
}

function replay(bars) {
  const orders = generateOrders(bars);
  const n = bars.length;
  let position = 0;
  let entry = null;
  let cash = 0;          // realised net PnL (gross - costs)
  let totalCost = 0;
  let fills = 0;
  let closedLegs = 0;
  let wins = 0;
  const trades = [];     // one row per closed leg
  const equity = [START_CAPITAL];
  let peak = START_CAPITAL;
  let maxDD = 0;

  for (let i = 0; i < n - 1; i++) {
    const target = orders.find((o) => o.bar === i);
    if (target && target.position !== position) {
      const execPrice = bars[i + 1].open;
      const nFills = Math.abs(target.position - position);
      const cost = nFills * costPerFill(execPrice, SIZE_ETH);
      if (position !== 0 && entry !== null) {
        // Close the old leg at this fill price. The closing fill's share of
        // the cost is costPerFill; the opening fill's share is the rest.
        const closeCost = costPerFill(execPrice, SIZE_ETH);
        const gross = (execPrice - entry) * position;
        cash += gross - closeCost;
        totalCost += closeCost;
        fills += 1;
        closedLegs += 1;
        if (gross > 0) wins += 1;
        trades.push({
          entryBar: trades._entryBar, entryPrice: entry, entryPos: position,
          exitBar: i + 1, exitPrice: execPrice, gross: +gross.toFixed(2),
        });
        cash -= (cost - closeCost); // opening fill cost
        totalCost += (cost - closeCost);
        fills += (nFills - 1);
      } else {
        cash -= cost;
        totalCost += cost;
        fills += nFills;
      }
      if (target.position !== 0) {
        entry = execPrice;
        trades._entryBar = i + 1;
      } else {
        entry = null;
      }
      position = target.position;
    }
    const unreal = position !== 0 && entry !== null
      ? position * (bars[i + 1].close - entry) : 0;
    const eq = START_CAPITAL + cash + unreal;
    equity.push(eq);
    if (eq > peak) peak = eq;
    if (peak - eq > maxDD) maxDD = peak - eq;
  }

  // Liquidate any open position at the close of the last bar.
  if (position !== 0 && entry !== null) {
    const exitPrice = bars[n - 1].close;
    const exitCost = costPerFill(exitPrice, SIZE_ETH);
    const gross = (exitPrice - entry) * position;
    cash += gross - exitCost;
    totalCost += exitCost;
    fills += 1;
    closedLegs += 1;
    if (gross > 0) wins += 1;
    trades.push({
      entryBar: trades._entryBar, entryPrice: entry, entryPos: position,
      exitBar: n - 1, exitPrice, gross: +gross.toFixed(2),
    });
  }
  delete trades._entryBar;

  const half1 = equity[720] - START_CAPITAL;
  const half2 = equity[equity.length - 1] - equity[720];
  const quarters = [0, 1, 2, 3].map((q) => {
    const a = q === 0 ? START_CAPITAL : equity[q * 360];
    const b = equity[Math.min((q + 1) * 360, equity.length - 1)];
    return +(b - a).toFixed(2);
  });
  const rets = [];
  for (let i = 1; i < equity.length; i++) rets.push(equity[i] / equity[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length);
  const sharpe = sd > 0 ? +(mean / sd * Math.sqrt(1440)).toFixed(2) : 0;

  return {
    orders, trades,
    summary: {
      bars: n,
      netPnLAfterCosts: +cash.toFixed(2),
      grossPnL: +(cash + totalCost).toFixed(2),
      totalCosts: +totalCost.toFixed(2),
      fills,
      closedLegs,
      winRatePct: closedLegs ? +(100 * wins / closedLegs).toFixed(1) : 0,
      maxDrawdown: +maxDD.toFixed(2),
      firstHalfPnL: +half1.toFixed(2),
      secondHalfPnL: +half2.toFixed(2),
      quarters,
      sharpeAnnualised1m: sharpe,
      startCapital: START_CAPITAL,
      // Post-liquidation equity: 10000 + realised net cash. (The equity
      // curve's last point is pre-liquidation; it differs by one fill, ~$1.18.)
      finalEquity: +(START_CAPITAL + cash).toFixed(2),
    },
  };
}

function main() {
  const file = process.argv[2] || path.join(__dirname, 'bars.csv');
  const bars = loadBars(file);
  const { orders, trades, summary } = replay(bars);
  fs.writeFileSync(
    path.join(__dirname, 'orders.json'),
    JSON.stringify(orders, null, 2) + '\n',
  );
  console.log(`bars: ${bars.length}  first close ${bars[0].close}  last close ${bars[bars.length - 1].close}`);
  console.log(`buy-and-hold (1 ETH): ${(bars[bars.length - 1].close - bars[0].close).toFixed(2)}`);
  console.log('\nORDERS (decided at close of `bar`, executed at open of bar+1):');
  for (const o of orders) {
    console.log(`  bar ${o.bar} -> ${o.side} ${o.size} ETH @ open of bar ${o.bar + 1} (${bars[o.bar + 1].open})  target position ${o.position > 0 ? '+' : ''}${o.position}`);
  }
  console.log('\nCLOSED LEGS:');
  for (const t of trades) {
    console.log(`  ${t.entryPos > 0 ? 'LONG ' : 'SHORT'} ${t.entryBar} @ ${t.entryPrice} -> bar ${t.exitBar} @ ${t.exitPrice}  gross ${t.gross >= 0 ? '+' : ''}${t.gross}`);
  }
  console.log('\nSUMMARY (net PnL after costs, per 1 ETH, $10,000 starting capital):');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\norders.json written.');
}

if (require.main === module) main();
module.exports = { replay, loadBars, costPerFill };
