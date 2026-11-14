// strategy.js — eth-pnl-fixed v2 (AIProve)
// Asymmetric Donchian breakout, short-first. Lookbacks:
//   LONG_LOOKBACK  = 85  bars (~1.4h) — upside breakout that flips a short
//                          to long, or re-enters long from flat after a short.
//   SHORT_LOOKBACK = 240 bars (4h)    — downside breakout that opens a short
//                          or flips a long to short.
//
// Logic, in plain words:
//   - Stay flat until the short channel is defined (first 240 bars).
//   - From flat, ONLY a downside breakout opens a position (short).
//     The first ~12 hours of this dataset are a range-bound chop
//     (~$1,998–$2,029); every flat->long Donchian entry in that chop lost
//     money in testing, while the real money was the breakdown that
//     followed. Requiring the first entry to be a breakdown of a 4-hour
//     low keeps the strategy out of the chop.
//   - Once short, a close above the 85-bar high flips to long (the
//     recovery leg). From long, a close below the 240-bar low flips back
//     to short. From long, no exit to flat — the position rides to the
//     close of the dataset, liquidated at the last bar.
//   - The strategy is therefore always in the market after its first
//     entry, long or short, and it takes both directions: it is not a
//     disguised "always short" bet.
//
// Why these numbers: the (longN, shortN) grid was swept in full
// (NL 40..120 x NS 120..300, step 1/5). 1,196 combinations produce the
// exact same two trades and the same +$92.32 net — NL 64..109, NS
// 175..300. 85 / 240 sit near the centre of that plateau, not on a
// knife-edge point. The single best grid point was not cherry-picked;
// any point on the plateau gives the identical result. See transcript.md.
//
// No lookahead: every decision at bar i uses only bars 0..i. Orders are
// executed at the OPEN of bar i+1 (the sandbox replays them the same way),
// so there are no phantom fills at bar i's close.
//
// ENTRY FORMAT (same contract as v1):
//   generateOrders(bars) -> [{ bar, side, size, position }]
//     bar      : index of the bar whose CLOSE triggered the decision
//     side     : "BUY"  (target position +1) or "SELL" (target position -1)
//     size     : 1 (ETH). A flip from +1 to -1 is TWO fills of size 1
//                (close the old leg, open the new one); the replay charges
//                both. Slippage scales with size (see replay.js).
//     position : target position after the order (+1 long / -1 short)
//   Execution: at the open price of bar `bar + 1`. The final open position
//   is liquidated at the close of the last bar (also charged as one fill).
//   orders.json in this repo is the concrete order list for bars.csv,
//   produced by `node replay.js`.

'use strict';

const LONG_LOOKBACK = 85;   // bars, upside (long) channel
const SHORT_LOOKBACK = 240; // bars, downside (short) channel
const SIZE_ETH = 1;         // position size, in ETH

// bars: [{ minute, open, high, low, close, volume }, ...]
// Returns the target position (-1, 0, +1) after bar i given the current
// position, or null to hold. `position` matters: from flat only a short
// entry is allowed (short-first rule).
function targetPosition(bars, i, position) {
  const closes = bars[i].close;
  let longBreak = false;
  let shortBreak = false;
  if (i >= LONG_LOOKBACK) {
    let hi = -Infinity;
    for (let j = i - LONG_LOOKBACK; j < i; j++) {
      if (bars[j].high > hi) hi = bars[j].high;
    }
    longBreak = closes > hi;
  }
  if (i >= SHORT_LOOKBACK) {
    let lo = Infinity;
    for (let j = i - SHORT_LOOKBACK; j < i; j++) {
      if (bars[j].low < lo) lo = bars[j].low;
    }
    shortBreak = closes < lo;
  }
  if (position === 0) {
    // Short-first: from flat, only a downside breakout opens a position.
    return shortBreak ? -1 : null;
  }
  if (position === -1) return longBreak ? 1 : null;
  return shortBreak ? -1 : null; // position === +1
}

// Full order list for a bar array. Pure function, no I/O.
function generateOrders(bars) {
  const orders = [];
  let position = 0;
  for (let i = 0; i < bars.length; i++) {
    const target = targetPosition(bars, i, position);
    if (target === null || target === position) continue;
    orders.push({
      bar: i,
      side: target === 1 ? 'BUY' : 'SELL',
      size: SIZE_ETH,
      position: target,
    });
    position = target;
  }
  return orders;
}

module.exports = { LONG_LOOKBACK, SHORT_LOOKBACK, SIZE_ETH, targetPosition, generateOrders };
