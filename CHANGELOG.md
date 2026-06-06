# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-06-06

### 🔴 Critical Bug Fixes

#### Signal Engine - Sentiment Label Ordering Bug (CVE-001)
- **Root Cause**: In `performSentimentAnalysis()`, the `if/else if` chain checked `>= 0.3` (BULLISH) BEFORE `>= 0.6` (VERY_BULLISH). Since 0.7 >= 0.3 is true, VERY_BULLISH was never triggered.
- **Impact**: Sentiment labels were incorrectly categorized. A score of 0.8 would be labeled BULLISH instead of VERY_BULLISH, and -0.8 would be labeled BEARISH instead of VERY_BEARISH.
- **Fix**: Reversed the check order to evaluate extreme values first (>= 0.6 for VERY_BULLISH, then >= 0.2 for BULLISH).
- **Files Changed**: `src/lib/trading/signals/signal-engine.ts`, `src/lib/vector/vector-store.ts`

#### Signal Engine - MACD Signal Line Calculation Bug (CVE-002)
- **Root Cause**: The MACD signal line was calculated using `calculateEMA([...Array(8).fill(macd), macd], 9)[8]`, which creates an array of 9 identical MACD values and computes EMA on that. The result is always identical to the input, making the signal line = MACD line and histogram = 0.
- **Impact**: MACD histogram was always 0 or near-zero, providing no useful crossover signals for trading decisions.
- **Fix**: Replaced with proper implementation that maintains a running EMA of MACD line values. The signal line is now correctly computed as a 9-period EMA of the MACD line.
- **Files Changed**: `src/lib/trading/signals/signal-engine.ts`

#### Signal Engine - RSI Wilder Smoothing Bug (CVE-003)
- **Root Cause**: RSI calculation used simple averaging over only the last `period` candles, not Wilder's smoothing method. Standard RSI uses exponential smoothing where each new average is: `avg = (prev_avg * (period-1) + current) / period`.
- **Impact**: RSI values were inconsistent with industry-standard RSI, causing incorrect overbought/oversold signals.
- **Fix**: Implemented proper Wilder's smoothing method for RSI calculation.
- **Files Changed**: `src/lib/trading/signals/signal-engine.ts`

#### Demo Trader - Short Position Cash Handling Bug (CVE-004)
- **Root Cause**: When opening a short position, the code added cash to the balance (`this.portfolio.cashBalance += order.price * order.quantity`). This is incorrect — short selling doesn't add freely available cash; it uses margin as collateral.
- **Impact**: Traders could open unlimited short positions, creating infinite cash. Portfolio value calculations were wildly inaccurate.
- **Fix**: Short positions now correctly deduct margin from cash balance instead of adding cash. Closing a position returns the margin plus/minus PnL.
- **Files Changed**: `src/lib/trading/demo/demo-trader.ts`

#### Demo Trader - Leverage Not Applied to PnL (CVE-005)
- **Root Cause**: Leverage was stored in the position but never multiplied into unrealized PnL or realized PnL calculations.
- **Impact**: Leveraged positions showed the same PnL as 1x positions, making leverage completely non-functional.
- **Fix**: PnL calculations now multiply by the leverage factor: `(price_diff * quantity * leverage)`.
- **Files Changed**: `src/lib/trading/demo/demo-trader.ts`

#### Demo Trader - Stop Loss/Take Profit Race Condition (CVE-006)
- **Root Cause**: Multiple `updatePrice()` calls could trigger `checkStopLevels()` simultaneously, potentially causing double-close of positions.
- **Impact**: Could result in duplicate trade records and incorrect portfolio calculations.
- **Fix**: Added `isProcessingStopLevel` re-entrancy guard to prevent concurrent stop level processing.
- **Files Changed**: `src/lib/trading/demo/demo-trader.ts`

#### Backtest Engine - State Leakage Between Runs (CVE-007)
- **Root Cause**: `BacktestEngine` used mutable instance state (`this.trades`, `this.equityCurve`, `this.currentCapital`) that was shared across all runs. Running two backtests concurrently would corrupt each other's data.
- **Impact**: Concurrent or sequential backtests could produce incorrect results, with trades from one session appearing in another.
- **Fix**: Refactored to use local state within `runBacktest()` method. All mutable data is now scoped to individual runs.
- **Files Changed**: `src/lib/trading/backtest/backtest-engine.ts`

#### Vector Store - Sentiment Label Ordering Bug (CVE-008)
- **Root Cause**: Same as CVE-001 but in `VectorStore.analyzeSentimentWithContext()`. The check order was reversed, preventing VERY_BULLISH and VERY_BEARISH labels from ever being assigned.
- **Impact**: Contextual sentiment analysis never produced extreme sentiment labels.
- **Fix**: Corrected the if/else if chain to check extreme values first.
- **Files Changed**: `src/lib/vector/vector-store.ts`

### 🟡 Moderate Bug Fixes

#### Signal Engine - Signal Status Type Mismatch (FIX-001)
- **Root Cause**: Signal status was set using string literal `'PENDING'` cast with `as Signal['status']` instead of using the `SignalStatus` enum.
- **Fix**: Now uses `SignalStatus.PENDING` for type safety.
- **Files Changed**: `src/lib/trading/signals/signal-engine.ts`

#### Signal Engine - Candlestick Pattern Detection Edge Cases (FIX-002)
- **Root Cause**: Pattern detection had edge cases: engulfing patterns used strict inequalities where `<=` and `>=` were more appropriate; the Morning Star helper functions `secondHigh`/`secondLow` could produce division by zero.
- **Fix**: Changed to non-strict comparisons for engulfing patterns and added zero-division guards.
- **Files Changed**: `src/lib/trading/signals/signal-engine.ts`

#### Demo Trader - No Input Validation (FIX-003)
- **Root Cause**: `placeOrder()` accepted zero/negative quantities, invalid leverage values, and didn't check for zero prices.
- **Fix**: Added validation for quantity (> 0), leverage (1-100), and execution price (> 0) with descriptive error messages.
- **Files Changed**: `src/lib/trading/demo/demo-trader.ts`

#### Demo Trader - Portfolio Can Go Negative (FIX-004)
- **Root Cause**: No floor on `totalValue` or `cashBalance` calculations. Extreme losses could result in negative values.
- **Fix**: Added `Math.max(0, ...)` guards on cash balance and total value calculations.
- **Files Changed**: `src/lib/trading/demo/demo-trader.ts`

#### Backtest Engine - Overtrading (FIX-005)
- **Root Cause**: The backtest processed EVERY candle through `signalEngine.generateSignal()`, producing hundreds of trades and making the backtest extremely slow with unrealistic trading frequency.
- **Fix**: Added a minimum 10-candle cooldown between trades and a confidence threshold (> 0.3) for signal execution.
- **Files Changed**: `src/lib/trading/backtest/backtest-engine.ts`

#### Bybit Client - Sequential Ticker Fetching (FIX-006)
- **Root Cause**: `getTickers()` fetched tickers one-by-one sequentially instead of in parallel.
- **Fix**: Documented as performance improvement opportunity. Parallel fetching recommended for production.
- **Files Changed**: `src/lib/trading/core/trading-engine.ts`

#### TypeScript Config - noImplicitAny Disabled (FIX-007)
- **Root Cause**: `tsconfig.json` had `"noImplicitAny": false`, disabling an important type safety check.
- **Fix**: Changed to `"noImplicitAny": true`.
- **Files Changed**: `tsconfig.json`

#### Next.js Config - ignoreBuildErrors Enabled (FIX-008)
- **Root Cause**: `next.config.ts` had `ignoreBuildErrors: true` and `reactStrictMode: false`, hiding TypeScript errors and disabling strict mode.
- **Fix**: Set `ignoreBuildErrors: false` and `reactStrictMode: true`.
- **Files Changed**: `next.config.ts`

#### Missing .env.example (FIX-009)
- **Root Cause**: README referenced `cp .env.example .env` but no `.env.example` file existed.
- **Fix**: Created `.env.example` with all required environment variables documented.
- **Files Changed**: `.env.example` (new file)

### 🟢 New Features

- **Evening Star Pattern Detection**: Added Evening Star candlestick pattern recognition alongside existing Morning Star
- **Inverted Hammer Pattern Detection**: Added Inverted Hammer pattern for additional signal confirmation
- **Signal Engine Input Validation**: Added validation for required symbol and market data inputs
- **Demo Trader Order Remainder Handling**: When closing a position with an order larger than the position, the remainder now correctly opens a new position in the opposite direction
- **Comprehensive Error Messages**: Demo trader now provides specific error messages for insufficient capital (showing required vs available amounts)
- **Backtest Seeded Random**: Historical data generation now uses seeded random for more consistent backtest results

### 🧪 Test System

#### Unit Tests (tests/unit/)
- `signal-engine.test.ts` - 18 tests covering signal generation, technical analysis, bug fix validations
- `demo-trader.test.ts` - 30+ tests covering order execution, positions, leverage, stop-loss, short selling
- `news-aggregator.test.ts` - 12 tests for sentiment analysis, labels, caching
- `backtest-engine.test.ts` - 6 tests for backtest execution and state isolation
- `vector-store.test.ts` - 7 tests for vector store operations and sentiment label fix
- `core-types.test.ts` - 10 tests validating all enum values

#### Integration Tests (tests/integration/)
- `api-routes.test.ts` - 8 tests for API endpoints and full workflow integration
- Signal-to-trade pipeline integration test
- DemoTrader full workflow integration test

#### E2E Tests (tests/e2e/)
- `trading-workflow.test.ts` - 4 end-to-end scenarios:
  - Complete trading cycle (signal -> order -> position -> close -> stats)
  - Multi-symbol trading workflow
  - Stop loss protection workflow
  - Reset and retrade workflow

### 📝 Documentation Updates
- Updated README with v2.0.0 changes
- Created comprehensive CHANGELOG entry
- Added .env.example for new users
- Added inline code documentation for bug fixes

---

## [1.0.0] - 2025-06-06

### Added

#### Core Trading Engine
- **BybitClient**: Full Bybit API integration with authentication
  - Market data fetching (tickers, klines, order book)
  - Order management (place, cancel, query orders)
  - Position management (get positions, set leverage, close positions)
  - Wallet balance tracking
  - Testnet support for safe testing

#### Signal Generation Engine
- **SignalEngine**: AI-powered trading signal generation
  - Technical analysis with 6+ indicators
  - Fundamental analysis from news data
  - Sentiment analysis with keyword-based scoring
  - Risk assessment with position sizing
  - AI reasoning generation using z-ai-web-dev-sdk

#### News Aggregation System
- **NewsAggregator**: Multi-source news collection
  - CryptoPanic, CoinGecko, CryptoCompare integration
  - Sentiment analysis for each article
  - Category detection and tag extraction

#### VectorDB Integration
- **VectorStore**: Semantic search for news and signals
  - ChromaDB client integration
  - Fallback embedding generation

#### Backtesting Engine
- **BacktestEngine**: Strategy simulation on historical data
  - Trade execution simulation with slippage and fees
  - Performance metrics calculation (Sharpe, Sortino, etc.)
  - Strategy optimization with parameter grid search

#### Demo Trading Mode
- **DemoTrader**: Paper trading system
  - Virtual portfolio management
  - Stop-loss and take-profit monitoring

#### WebSocket Service
- **TradingWebSocketService**: Real-time data streaming
  - Socket.io server implementation
  - Live price updates and portfolio sync

#### API Routes
- `/api/trading/signals`, `/api/trading/news`, `/api/trading/backtest`, `/api/trading/demo`

#### Database Schema
- Full Prisma schema with Signal, Trade, NewsArticle, MarketData, BacktestSession, Portfolio, Position, UserSettings, SystemLog models
