# QA Fix Report v3 — Mantle AI Trading Bot

**Task ID:** 2  
**Agent:** QA Agent  
**Date:** 2025-01-27  
**Scope:** Full QA audit of `src/lib/trading/` and `src/app/api/`  

---

## Summary

| Category | Count |
|----------|-------|
| Critical Bugs Fixed | 5 |
| Moderate Bugs Fixed | 5 |
| Security Improvements | 2 |
| General Improvements | 1 |
| **Total** | **13** |

---

## Issue #1 — Bollinger Bands `.sort()` Mutation Bug

| Field | Detail |
|-------|--------|
| **Severity** | Moderate |
| **File** | `src/lib/trading/signals/signal-engine.ts` |
| **Line** | ~189 (original) |
| **Root Cause** | `bandwidths.sort((a, b) => a - b)` mutates the `bandwidths` array in-place via `Array.prototype.sort()`. While the sorted result is used correctly for percentile comparison, in-place mutation is a code smell that can cause subtle bugs if the original array order matters elsewhere. |
| **Fix Applied** | Changed to `[...bandwidths].sort((a, b) => a - b)` — creates a sorted copy instead of mutating. Variable renamed to `sortedBandwidths` for clarity. |

---

## Issue #2 — `calculateSignalQualityScore` Uses SMA20 Instead of Last Close for VWAP

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **File** | `src/lib/trading/signals/signal-engine.ts` |
| **Line** | ~958 (original) |
| **Root Cause** | `const lastClose = technical.indicators.sma20 || 0;` — The VWAP confirmation factor in `calculateSignalQualityScore` uses SMA20 (a 20-period moving average) as a proxy for the last closing price. SMA20 is a lagging indicator and can be significantly different from the actual current price, leading to incorrect VWAP crossover signals. |
| **Fix Applied** | 1. Added `indicators.lastClose = lastClose` in `performTechnicalAnalysis()` to store the actual closing price in the indicators record. 2. Changed `calculateSignalQualityScore` to use `technical.indicators.lastClose` instead of `technical.indicators.sma20` for the VWAP comparison. |

---

## Issue #3 — Missing Imports for `newsAggregator` and `vectorStore` in Signal Engine

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **File** | `src/lib/trading/signals/signal-engine.ts` |
| **Line** | ~1095, ~1107 (original) |
| **Root Cause** | The `performSentimentAnalysis` method references `newsAggregator` and `vectorStore` singletons but they were never imported. This would cause a `ReferenceError` at runtime when the method tries to access these objects. |
| **Fix Applied** | Added explicit imports: `import { newsAggregator } from '../news/news-aggregator';` and `import { vectorStore } from '../../vector/vector-store';` at the top of the file. |

---

## Issue #4 — Duplicate `closePositionPartial` Method in Demo Trader

| Field | Detail |
|-------|--------|
| **Severity** | Moderate |
| **File** | `src/lib/trading/demo/demo-trader.ts` |
| **Line** | 738 and 925 (original) |
| **Root Cause** | `closePositionPartial` was defined twice. The first definition (line 738) called `placeOrder()` directly with different error handling, while the second (line 925) delegated to `closePosition()`. In JavaScript class semantics, the last definition wins, so the first was dead code. The inconsistency could confuse maintainers and lead to bugs if the code is reorganized. |
| **Fix Applied** | Removed the duplicate. Kept a single `closePositionPartial` that delegates to `closePosition()` for consistency. Error message updated from "between 0 and 100" to "between 1 and 100". |

---

## Issue #5 — Duplicate `checkMarginCall` with Incompatible Return Types

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **File** | `src/lib/trading/demo/demo-trader.ts` |
| **Line** | 770 and 976 (original) |
| **Root Cause** | Two `checkMarginCall` methods with different return types: first returns `boolean`, second returns `string[]`. In JS, the second definition silently overrides the first, changing the method's contract. Any code expecting `boolean` would get a truthy `string[]` instead. The call in `updatePrice()` (line 191) didn't use the return value, but the API route (demo/route.ts line 243) assigned it to `marginCalls` and expected `string[]`. |
| **Fix Applied** | Unified into a single method returning `{ isMarginCall: boolean; closedSymbols: string[] }` — an explicit object that satisfies both use cases. Updated the demo API route to use the new return type. |

---

## Issue #6 — Duplicate `calculateCommission` with Incompatible Signatures

| Field | Detail |
|-------|--------|
| **Severity** | Moderate |
| **File** | `src/lib/trading/demo/demo-trader.ts` |
| **Line** | 796 and 1012 (original) |
| **Root Cause** | First definition: `calculateCommission(price, quantity, isMaker: boolean = false)` with hardcoded Bybit fees. Second definition: `calculateCommission(price, quantity, orderType: OrderType)` using `this.commissionRates`. The call sites pass `order.type` (an `OrderType`), not a `boolean`. Since the second definition wins at runtime, the first is dead code. The first definition also bypassed `this.commissionRates`, using hardcoded fee rates that could become stale. |
| **Fix Applied** | Removed the first duplicate. Kept only the `calculateCommission(price, quantity, orderType: OrderType)` method that correctly uses `this.commissionRates` and properly maps `OrderType.LIMIT` to maker fees. |

---

## Issue #7 — Annualized Return Calculation in Backtest Engine

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **File** | `src/lib/trading/backtest/backtest-engine.ts` |
| **Line** | ~299 (original) |
| **Root Cause** | `Math.pow(finalCapital / initialCapital, 365 / 365)` simplifies to `Math.pow(ratio, 1)` which equals just `ratio`. This makes the "annualized" return identical to total return regardless of the backtest period. A 30-day backtest showing 10% return would report 10% annualized instead of the correct ~(1.10^(365/30) - 1) ≈ 331%. |
| **Fix Applied** | Added `periodDays` parameter to `calculatePerformanceMetrics()`. Formula changed to `Math.pow(finalCapital / initialCapital, 365 / periodDays) - 1`. Updated all three call sites (main backtest, optimization, and report generation) to pass the actual period in days. |

---

## Issue #8 — Conflicting `updateTrailingStop` Methods in Demo Trader

| Field | Detail |
|-------|--------|
| **Severity** | Moderate |
| **File** | `src/lib/trading/demo/demo-trader.ts` |
| **Line** | 707 and 872 (original) |
| **Root Cause** | A public `updateTrailingStop(symbol: string, trailPercent: number): boolean` at line 707 and a private `updateTrailingStop(position: DemoPosition): void` at line 872. In JS, the second definition overrides the first, making the public API (called from the demo route) inaccessible. The internal call from `updatePrice()` passes a `DemoPosition`, which only works with the second definition. |
| **Fix Applied** | Merged into a single overloaded method: `updateTrailingStop(symbolOrPosition: string | DemoPosition, trailPercentOrUndefined?: number): boolean | void`. Uses `typeof` check to dispatch to the correct logic. Both call signatures now work correctly. |

---

## Issue #9 — Fragile Regex RSS Parsing in News Aggregator

| Field | Detail |
|-------|--------|
| **Severity** | Moderate |
| **File** | `src/lib/trading/news/news-aggregator.ts` |
| **Line** | ~344-376 (original) |
| **Root Cause** | The regex-based RSS parser had three issues: 1) CDATA regex `(.*?)` used non-greedy match which could fail on CDATA containing nested brackets; 2) No HTML entity decoding (&amp;, &lt;, etc.) — common in RSS feeds; 3) `<link>` tags weren't handled for CDATA wrapping. |
| **Fix Applied** | Replaced inline regex matches with an `extractField(tagName)` helper that: tries CDATA-wrapped content first with `[\s\S]*?` for multi-line support, then falls back to plain text, and decodes common HTML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`) in both cases. Applied to all fields: title, link, description, pubDate. |

---

## Issue #10 — Demo API Route `checkMarginCall()` Return Type Mismatch

| Field | Detail |
|-------|--------|
| **Severity** | Moderate |
| **File** | `src/app/api/trading/demo/route.ts` |
| **Line** | ~243 (original) |
| **Root Cause** | After fixing Issue #5, `checkMarginCall()` now returns `{ isMarginCall: boolean; closedSymbols: string[] }` instead of `string[]`. The API route code assigned `const marginCalls = demoTrader.checkMarginCall()` expecting a string array. |
| **Fix Applied** | Updated to `const marginResult = demoTrader.checkMarginCall()` and returned `{ marginCalls: marginResult.closedSymbols, isMarginCall: marginResult.isMarginCall }` in the response. |

---

## Issue #11 — Demo API Route Exposes Internal Error Details

| Field | Detail |
|-------|--------|
| **Severity** | Security |
| **File** | `src/app/api/trading/demo/route.ts` |
| **Line** | ~261 (original) |
| **Root Cause** | `error: String(error)` in the catch block exposes internal error messages (stack traces, database errors, etc.) to the client. This can leak implementation details like database schema, file paths, or internal state. |
| **Fix Applied** | Changed to `error: 'An internal error occurred while executing the demo action'`. The full error is still logged server-side via `console.error()`. |

---

## Issue #12 — `.gitignore` Should Explicitly Exclude `.env` and Include `.env.example`

| Field | Detail |
|-------|--------|
| **Severity** | Security |
| **File** | `.gitignore` |
| **Line** | 34 (original) |
| **Root Cause** | The `.env*` wildcard in `.gitignore` covers `.env` but also excludes `.env.example`, which is meant to be committed as a template. While the current `.env` only contains a non-sensitive DATABASE_URL, the `.env.example` should be trackable as documentation. |
| **Fix Applied** | Added `!.env.example` exception after `.env*` to allow the example file to be committed while keeping actual `.env` files excluded. Added comments explaining the intent. |

---

## Issue #13 — Missing Error Boundary in Next.js App

| Field | Detail |
|-------|--------|
| **Severity** | General |
| **File** | `src/app/error.tsx` (new file) |
| **Line** | N/A |
| **Root Cause** | No `error.tsx` boundary existed in the Next.js app directory. Without it, any unhandled runtime error in a client component would crash the entire application or show a raw error stack trace. |
| **Fix Applied** | Created `src/app/error.tsx` with a proper React error boundary component that: catches unhandled errors, logs them server-side, displays a user-friendly message, and provides a "Try again" button that calls `reset()`. |

---

## Verification Notes

1. **Signal Engine**: The `determineAction` method was NOT truncated as initially suspected — the truncation was a display artifact. The actual code at line 1192 reads `sentiment.overallSentiment < 0` which is correct.

2. **Signal Engine Singleton**: The `signalEngine` export at the bottom of `signal-engine.ts` DOES exist as `export const signalEngine = new SignalEngine()`, so the backtest engine's import is valid.

3. **`.env` Contents**: The `.env` file only contains `DATABASE_URL="file:./prisma/data/mantle-trader.db"` — no real API keys are exposed. The `.env.example` correctly uses placeholder values.

4. **Rate Limiting**: No rate limiting middleware exists on any API endpoint. This is noted but not fixed as it requires infrastructure-level changes (e.g., Next.js middleware with a rate limiter like `rate-limiter-flexible`). This should be addressed before production deployment.

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/trading/signals/signal-engine.ts` | Fix #1 (sort mutation), #2 (VWAP proxy), #3 (missing imports) |
| `src/lib/trading/demo/demo-trader.ts` | Fix #4 (dup closePositionPartial), #5 (dup checkMarginCall), #6 (dup calculateCommission), #8 (conflicting updateTrailingStop) |
| `src/lib/trading/backtest/backtest-engine.ts` | Fix #7 (annualized return) |
| `src/lib/trading/news/news-aggregator.ts` | Fix #9 (RSS parsing) |
| `src/app/api/trading/demo/route.ts` | Fix #10 (checkMarginCall return), #11 (error exposure) |
| `.gitignore` | Fix #12 (.env handling) |
| `src/app/error.tsx` | Fix #13 (new error boundary) |
