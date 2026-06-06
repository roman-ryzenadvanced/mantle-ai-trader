# New Features - v4.0.0

## Overview

This document describes the dramatic improvements added to the Mantle AI Trading Bot in v4.0.0. Seven major features were implemented across the codebase, adding over 1,500 lines of production-ready TypeScript code with full JSDoc documentation and proper type safety.

---

## 1. Circuit Breaker Pattern (DemoTrader)

**File:** `src/lib/trading/demo/demo-trader.ts`

### What it does
Protects the demo trading account from catastrophic drawdowns by halting trading after consecutive losses, then gradually restoring position sizing during recovery.

### Key Components
- **CircuitBreakerConfig**: Configurable threshold (default: 5 consecutive losses), cooldown duration (default: 30 min), reduced position multiplier (default: 50%), and recovery step (default: 25% per win)
- **Three States**: `CLOSED` (normal), `OPEN` (trading halted), `HALF_OPEN` (recovery mode with reduced sizing)
- **`getCircuitBreakerStatus()`**: Returns detailed status including state, consecutive losses, cooldown expiry, position size multiplier, and recovery wins
- **`resetCircuitBreaker()`**: Manual override to reset the breaker to CLOSED state
- **Automatic state transitions**: OPEN → HALF_OPEN after cooldown, HALF_OPEN → CLOSED after full recovery

### How it works
1. Each losing trade increments a consecutive loss counter
2. After 5 consecutive losses (configurable), the breaker trips to OPEN state
3. While OPEN, all `placeOrder()` calls throw an error
4. After the cooldown period, the breaker transitions to HALF_OPEN
5. In HALF_OPEN, trades are allowed but at reduced position size (50% by default)
6. Each winning trade in HALF_OPEN increases the position size by 25%
7. Once position size reaches 100%, the breaker returns to CLOSED

---

## 2. Ichimoku Cloud Indicator

**File:** `src/lib/trading/signals/signal-engine.ts`

### What it does
Adds the full Ichimoku Cloud technical indicator to the signal generation pipeline, providing trend direction, support/resistance levels, and momentum signals.

### Components Calculated
- **Tenkan-sen (Conversion Line)**: `(9-period high + 9-period low) / 2`
- **Kijun-sen (Base Line)**: `(26-period high + 26-period low) / 2`
- **Senkou Span A**: `(Tenkan + Kijun) / 2`, plotted 26 periods ahead
- **Senkou Span B**: `(52-period high + 52-period low) / 2`, plotted 26 periods ahead
- **Chikou Span**: Close plotted 26 periods back
- **Cloud boundaries**: cloudTop and cloudBottom for support/resistance

### Signals Generated
- **Price above cloud**: Bullish (score +0.05)
- **Price below cloud**: Bearish (score -0.05)
- **Tenkan > Kijun crossover**: Bullish momentum (score +0.03)
- **Tenkan < Kijun crossover**: Bearish momentum (score -0.03)
- **Strong trend signal**: Combined cloud position + crossover (score ±0.08)
- **Cloud twist**: Senkou Span A crossing Span B signals future trend change

### Exported Function
```typescript
export function calculateIchimoku(
  highs: number[], lows: number[], closes: number[],
  tenkanPeriod?: number, kijunPeriod?: number,
  senkouPeriod?: number, displacement?: number
): { tenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan, cloudTop, cloudBottom, trendSignal, priceVsCloud }
```

---

## 3. Stochastic Oscillator

**File:** `src/lib/trading/signals/signal-engine.ts`

### What it does
Adds the Stochastic Oscillator (%K and %D lines) to detect overbought and oversold conditions with crossover signals.

### Components Calculated
- **%K**: `(Current Close - Lowest Low) / (Highest High - Lowest Low) × 100` over 14 periods
- **%D**: 3-period SMA of %K
- **Overbought signal**: %K > 80 (potential sell)
- **Oversold signal**: %K < 20 (potential buy)
- **%K/%D crossover**: Bullish when %K crosses above %D in oversold zone; Bearish when %K crosses below %D in overbought zone

### Scoring Integration
- **Oversold**: score +0.08 (potential buy)
- **Overbought**: score -0.08 (potential sell)
- **Bullish crossover** in oversold: score +0.06
- **Bearish crossover** in overbought: score -0.06

### Exported Function
```typescript
export function calculateStochastic(
  highs: number[], lows: number[], closes: number[],
  kPeriod?: number, dPeriod?: number
): { percentK, percentD, isOverbought, isOversold, signal, crossover }
```

---

## 4. Trade Journal / Trade Review System

**File:** `src/lib/trading/journal/trade-journal.ts` (NEW)

### What it does
A comprehensive trade journaling system for recording, reviewing, and analyzing trading activity to drive continuous improvement.

### Key Types
- **EmotionalState**: 9 tags (CONFIDENT, ANXIOUS, FOMO, PATIENT, REVENGE_TRADING, DISCIPLINED, UNCERTAIN, EUPHORIC, FEARFUL)
- **MarketCondition**: 8 conditions (TRENDING_UP, TRENDING_DOWN, RANGING, HIGH_VOLATILITY, LOW_VOLATILITY, NEWS_DRIVEN, BREAKOUT, REVERSAL)
- **StrategyType**: TECHNICAL, FUNDAMENTAL, COMBINED
- **ExitReason**: 8 reasons (TAKE_PROFIT, STOP_LOSS, TRAILING_STOP, MANUAL_CLOSE, SIGNAL_REVERSAL, TIME_BASED, MARGIN_CALL, CIRCUIT_BREAKER)

### Features
- **`recordEntry()`**: Log trade entry with signal data, emotional state, market condition
- **`recordExit()`**: Log trade exit with PnL, lessons learned, exit reason
- **`generateReviewReport()`**: Comprehensive report including:
  - Best/worst performing setups (top/bottom 5 by avg PnL)
  - Common mistakes extracted from lessons learned
  - Statistics by time of day (4 buckets: 00-06, 06-12, 12-18, 18-24)
  - Statistics by day of week
  - Statistics by market condition
  - Statistics by strategy type (technical vs fundamental vs combined)
  - Statistics by emotional state
  - Overall win rate, profit factor, total PnL
- **`exportToJSON()`**: Export entire journal to JSON
- **`importFromJSON()`**: Import journal from JSON backup
- **Singleton**: `tradeJournal` exported for app-wide use

---

## 5. Portfolio Rebalancing Logic

**File:** `src/lib/trading/portfolio/rebalancer.ts` (NEW)

### What it does
Manages target allocations and detects when the portfolio has drifted beyond acceptable thresholds, generating actionable rebalancing suggestions.

### Key Types
- **TargetAllocation**: Symbol/sector key with target percent, optional min/max bounds
- **PositionAllocation**: Current allocation with drift calculation and rebalance flag
- **RebalanceSuggestion**: BUY/SELL/HOLD with dollar amounts, priority, and reasoning
- **RebalanceAnalysis**: Full analysis with drift score, all allocations, and suggestions
- **RebalancerConfig**: Drift threshold (5% default), mode (MANUAL/AUTO), risk-adjusted toggle, position limits

### Features
- **`setTargetAllocation()` / `setTargetAllocations()`**: Define target allocation percentages
- **`analyze(positions)`**: Calculate drift, generate suggestions, compute portfolio drift score
- **Risk-adjusted allocation**: Blends base target with inverse-volatility weights (70/30 split)
- **Position limits**: Max 30% single position, min 2% to keep
- **`PortfolioRebalancer.generateEqualWeight(symbols)`**: Static helper for equal-weight allocation
- **`PortfolioRebalancer.generateRiskWeighted(volatilities)`**: Static helper for risk-weighted allocation
- **Singleton**: `portfolioRebalancer` exported for app-wide use

---

## 6. API Route Validation Utilities

**File:** `src/lib/api/validation.ts` (NEW)

### What it does
Centralized validation, rate limiting, error response, and request logging utilities shared across all API routes.

### Rate Limiting
- **Per-endpoint configuration**: SIGNAL_GENERATION (10/min), DEMO_TRADING (30/min), NEWS_FETCH (20/min), BACKTEST (5/min), HEALTH (60/min)
- **In-memory rate limit store**: Per-IP, per-endpoint tracking with window-based reset
- **`checkRateLimit(request, config)`**: Returns allowed/remaining/reset info

### Standardized Error Responses
- **`createErrorResponse(statusCode, error, code, details?)`**: Consistent JSON error format with code, timestamp, and optional details
- **`createSuccessResponse(data, statusCode?)`**: Consistent JSON success format with meta/timestamp
- **`handleValidationError(zodError)`**: 400 response from Zod validation failure
- **`handleInternalError(error, context)`**: 500 response with safe error message

### Request Logging
- **`logRequest(request, extra?)`**: Logs method, URL, IP, and user agent
- **`validateRequest(request, rateLimitConfig)`**: Combined check that logs + rate limits, returns error response or null

### Error Response Format
```json
{
  "success": false,
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": {},
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

## 7. Health Check Endpoint

**File:** `src/app/api/health/route.ts` (NEW)

### What it does
Provides a comprehensive system health check endpoint at `GET /api/health` that monitors all critical system components.

### Components Checked (in parallel)
1. **Database**: Runs `SELECT 1` to verify SQLite/Prisma connectivity
2. **Bybit API**: Checks `https://api.bybit.com/v2/public/time` with 5s timeout
3. **ChromaDB**: Calls `vectorStore.isHealthy()` heartbeat method

### Response Format
```json
{
  "success": true,
  "data": {
    "status": "healthy|degraded|unhealthy",
    "version": "4.0.0",
    "uptime": 12345,
    "timestamp": "2025-01-01T00:00:00.000Z",
    "checks": {
      "database": { "status": "ok", "latencyMs": 5 },
      "bybitApi": { "status": "ok", "latencyMs": 120 },
      "chromaDb": { "status": "ok", "latencyMs": 15 }
    },
    "system": {
      "memoryUsage": { "rss": 50, "heapTotal": 40, "heapUsed": 30, "external": 2, "arrayBuffers": 1 },
      "activeConnections": 0,
      "nodeVersion": "v22.0.0",
      "environment": "development"
    }
  }
}
```

### HTTP Status Codes
- **200**: System is healthy or degraded (functional but some issues)
- **503**: System is unhealthy (database down = critical failure)

### Supporting Change
- Added `isHealthy()` method to `VectorStore` class for ChromaDB heartbeat check

---

## Files Modified
1. `src/lib/trading/demo/demo-trader.ts` - Circuit Breaker pattern
2. `src/lib/trading/signals/signal-engine.ts` - Ichimoku Cloud + Stochastic Oscillator
3. `src/lib/vector/vector-store.ts` - Added `isHealthy()` method
4. `package.json` - Version bump (implicitly documented here)

## Files Created
1. `src/lib/trading/journal/trade-journal.ts` - Trade Journal system
2. `src/lib/trading/portfolio/rebalancer.ts` - Portfolio Rebalancer
3. `src/lib/api/validation.ts` - API validation utilities
4. `src/app/api/health/route.ts` - Health check endpoint
