# 🏆 Mantle AI Trader — Hackathon Submission

**Mantle Turing Test Hackathon | $120,000 Prize Pool**
**Track: AI Trading**

---

## 📋 Project Overview

| Field | Details |
|-------|---------|
| **Project Name** | Mantle AI Trader |
| **Tagline** | AI-Powered Cryptocurrency Trading Bot with News Sentiment Analysis |
| **Track** | AI Trading |
| **Repository** | [https://github.com/roman-ryzenadvanced/mantle-ai-trader](https://github.com/roman-ryzenadvanced/mantle-ai-trader) |
| **License** | MIT (Open Source) |
| **Version** | v3.1.0 |
| **Test Suite** | 620+ tests, all passing |

### Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16, TypeScript 5 (strict mode) |
| **Styling** | Tailwind CSS 4, shadcn/ui |
| **Database** | Prisma ORM, SQLite |
| **AI/ML** | z-ai-web-dev-sdk |
| **Exchange** | Bybit API v5 |
| **Real-time** | Socket.io (WebSocket) |
| **Charts** | Recharts |
| **State** | Zustand, TanStack Query |
| **Validation** | Zod |

---

## 🎯 Problem Statement

Crypto traders face **information overload** — they need to simultaneously process hundreds of news articles, social signals, and technical indicators across multiple timeframes. This creates three critical problems:

1. **Emotional Decision-Making**: Most retail traders make fear- and greed-driven decisions rather than data-driven ones. A single FUD tweet can trigger a panic sell that wipes out weeks of gains.

2. **Tool Extremes**: Existing tools are either too simple (single-indicator bots that generate false signals) or too complex (require ML expertise and infrastructure that retail traders don't have).

3. **Risk Blind Spots**: Even traders who use technical analysis often neglect proper risk management — no position sizing, no drawdown protection, no circuit breakers. This leads to catastrophic losses during market downturns.

**The result**: 90%+ of retail crypto traders lose money, not because their analysis is wrong, but because they can't process information fast enough, can't control their emotions, and don't have institutional-grade risk safeguards.

---

## 💡 Solution

Mantle AI Trader solves this by combining **three pillars** into a single, battle-tested platform:

### Pillar 1: Multi-Source Intelligence

| Component | Capability |
|-----------|-----------|
| **12+ Technical Indicators** | RSI (Wilder's smoothing), MACD (proper signal line), Bollinger Bands (%B + squeeze), VWAP, ADX (Wilder's), Volume Profile (POC + value area), Ichimoku Cloud, Stochastic Oscillator (%K/%D), SMA, EMA, Support/Resistance |
| **7 Candlestick Patterns** | Doji, Hammer, Engulfing (Bullish/Bearish), Morning Star, Evening Star, Inverted Hammer |
| **Multi-Source News Sentiment** | CryptoPanic, CoinGecko, CryptoCompare with credibility-weighted scoring, time-decay weighting, and Jaccard similarity duplicate detection |
| **AI Reasoning** | z-ai-web-dev-sdk generates human-readable trade explanations — not just "BUY" but *why* |

### Pillar 2: Institutional-Grade Risk Management

| Layer | Protection |
|-------|-----------|
| **1. Position Sizing** | Kelly Criterion-influenced fixed-fractional sizing based on portfolio value, confidence, and risk level |
| **2. Drawdown Protection** | Auto-halts trading at configurable drawdown threshold (default 20%) |
| **3. Daily Loss Limit** | Stops trading when daily loss exceeds threshold (default 5%) |
| **4. Circuit Breaker** | Auto-halts after 5 consecutive losses, enters HALF_OPEN recovery with 50% position sizing, gradually recovers with each winning trade |
| **5. Margin Call Detection** | Automatic liquidation of worst-performing positions first when margin ratio falls below 50% |

### Pillar 3: Realistic Simulation

| Feature | Details |
|---------|---------|
| **Paper Trading** | Risk-free practice with live market prices |
| **Realistic Commissions** | Bybit-compatible fees (Taker: 0.06%, Maker: 0.02%) |
| **Slippage Simulation** | Price impact modeling for realistic fills |
| **Leverage Effects** | Proper PnL calculation with leverage multiplier |
| **Trailing Stops** | Automated stop-loss adjustment following price movement |
| **Backtesting** | Historical strategy simulation with Sharpe Ratio, Win Rate, Max Drawdown |

---

## 🔬 Technical Highlights

### What Makes This Project Stand Out

#### 1. Proper Indicator Math (Not Faked)

Many hackathon projects fake their indicators or use simplified approximations. Every calculation in Mantle AI Trader is **mathematically correct**:

- **RSI**: Uses Wilder's smoothing method (`avg = (prev_avg * (period-1) + current) / period`), not simple averaging — matching TradingView and Bloomberg Terminal calculations
- **MACD Signal Line**: Maintains a running 9-period EMA of the MACD line, not a static lookback — produces correct crossover signals
- **Bollinger Bands**: Full implementation with %B indicator, bandwidth calculation, and squeeze detection (bottom 20% of recent bandwidth)
- **VWAP**: Cumulative typical price weighted by volume with standard deviation bands
- **ADX**: Wilder's smoothing for +DI/-DI calculations with proper trend strength classification
- **Ichimoku Cloud**: All 5 components (Tenkan-sen, Kijun-sen, Senkou Span A/B, Chikou Span) with cloud twist detection
- **Stochastic Oscillator**: %K/%D with proper falsy-zero handling (uses `??` instead of `||`)

**Why this matters**: In a $120K hackathon, judges can spot fake math. A trading bot with incorrect indicators would lose real money — our bot would produce the same signals as institutional platforms.

#### 2. Circuit Breaker Pattern

Inspired by real exchange safeguards (NYSE Rule 80B, CME circuit breakers), our implementation:

```
CLOSED (normal) → 5 consecutive losses → OPEN (trading halted)
                                      ↓ (after 30-min cooldown)
                               HALF_OPEN (50% position sizing)
                                      ↓ (each winning trade: +25% sizing)
                               CLOSED (full recovery)
```

If a loss occurs during HALF_OPEN recovery, the breaker resets — preventing premature re-entry into a losing streak.

**Why this matters**: This is a production-grade safety net that most hackathon projects don't even think about. It prevents the #1 cause of trading account blowups: revenge trading after a losing streak.

#### 3. 620+ Tests — Not Just Unit Tests

| Test Type | Count | Purpose |
|-----------|-------|---------|
| Unit Tests | 16 files | Individual component correctness |
| Integration Tests | 3 files | Cross-module data flow |
| E2E Tests | 2 files | Full user workflow simulation |
| Stress Tests | 1 file | 1000+ rapid operations, concurrent scenarios |

**Why this matters**: Most hackathon projects have zero tests. We have 620+ including edge cases like:
- RSI = 0 when price is at period low (falsy-zero bug caught)
- Bollinger Bands array mutation side effect (caught by test isolation)
- Backtest state leakage between runs (caught by sequential test execution)
- Circuit breaker recovery interruption (loss during HALF_OPEN resets progress)

#### 4. Multi-Timeframe Confirmation

Signals are validated across 4 timeframes with weighted scoring:

| Timeframe | Weight | Role |
|-----------|--------|------|
| 1d | 40% | Primary trend direction |
| 4h | 30% | Trend confirmation |
| 1h | 20% | Entry timing |
| 15m | 10% | Fine-tuning |

A BUY signal on the 15m chart is only executed if the 1d and 4h charts confirm the bullish trend — preventing counter-trend trades.

#### 5. News Impact Scoring

Not all news is equal. Our scoring system weighs articles by:

- **Time Decay**: Recent articles score higher (exponential decay)
- **Source Credibility**: CryptoPanic > CoinGecko > CryptoCompare (configurable weights)
- **Duplicate Detection**: Jaccard similarity on article text prevents double-counting
- **Impact Classification**: Breaking news (high importance + recent) gets premium scoring

#### 6. Full QA Pass — 13 Bug Fixes Documented

Every bug was found, fixed, and documented with root cause analysis:

| Bug | Severity | Root Cause |
|-----|----------|-----------|
| Bollinger Bands `.sort()` mutation | Moderate | `Array.sort()` mutates in-place |
| VWAP used SMA20 instead of lastClose | Critical | Wrong variable in comparison |
| Missing `newsAggregator`/`vectorStore` imports | Critical | Runtime ReferenceError |
| Duplicate `closePositionPartial` methods | Moderate | Dead code from merge conflict |
| Duplicate `checkMarginCall` with incompatible return types | Critical | `boolean` vs `string[]` — silent override |
| Duplicate `calculateCommission` with different signatures | Moderate | Hardcoded vs configurable fees |
| Annualized return formula `365/365=1` | Critical | Division canceled out the exponent |
| Conflicting `updateTrailingStop` overloads | Moderate | Public API overridden by private |
| Fragile regex RSS parsing | Moderate | CDATA and HTML entity issues |
| API route exposes internal errors | Security | `String(error)` leaked stack traces |
| `.gitignore` excluded `.env.example` | Security | Wildcard too broad |
| Missing Next.js error boundary | General | No `error.tsx` file |
| Stochastic `%K` falsy-zero check | Critical | `0 || 50` returned 50 instead of 0 |

**Why this matters**: These aren't hypothetical bugs found by a linter — they're real runtime bugs that would have caused real financial losses. Finding and fixing them demonstrates production-quality engineering.

---

## 🚀 Demo Instructions for Judges

### Prerequisites
- Node.js 18+ or Bun runtime
- Git
- curl (for API testing)

### Step 1: Clone and Install

```bash
git clone https://github.com/roman-ryzenadvanced/mantle-ai-trader.git
cd mantle-ai-trader
bun install
```

### Step 2: Setup Database

```bash
bun run db:push
```

### Step 3: Start the Application

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

### Step 4: Generate a Trading Signal

```bash
curl -X POST http://localhost:3000/api/trading/signals \
  -H "Content-Type: application/json" \
  -d '{"symbol": "BTCUSDT", "timeframe": "1h"}'
```

**What to look for**: The response includes:
- `action`: BUY, SELL, or HOLD
- `confidence`: 0-1 score
- `reasoning`: AI-generated human-readable explanation
- `technicalAnalysis`: All 12+ indicator values
- `sentimentAnalysis`: News sentiment scores
- `riskAssessment`: Position sizing and risk score

### Step 5: Place Demo Trades

```bash
# Check portfolio
curl http://localhost:3000/api/trading/demo?action=portfolio

# Place a buy order
curl -X POST http://localhost:3000/api/trading/demo \
  -H "Content-Type: application/json" \
  -d '{
    "action": "place_order",
    "symbol": "BTCUSDT",
    "side": "BUY",
    "quantity": 0.01,
    "type": "MARKET"
  }'

# Update price (triggers stop-loss/take-profit checks)
curl -X POST http://localhost:3000/api/trading/demo \
  -H "Content-Type: application/json" \
  -d '{
    "action": "update_price",
    "symbol": "BTCUSDT",
    "price": 105000
  }'
```

**What to look for**: Portfolio updates in real-time, commissions are deducted, unrealized PnL updates with leverage effects.

### Step 6: Run a Backtest

```bash
curl -X POST http://localhost:3000/api/trading/backtest \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "startDate": "2024-01-01",
    "endDate": "2024-06-01",
    "initialCapital": 10000
  }'
```

**What to look for**: Total return, Sharpe Ratio, Win Rate, Max Drawdown, trade-by-trade breakdown with correct annualized return calculations.

### Step 7: Check System Health

```bash
curl http://localhost:3000/api/health
```

**What to look for**: Database status, Bybit API connectivity, ChromaDB status, memory usage, uptime — all in one response.

### Step 8: Run the Full Test Suite

```bash
bun test
```

**What to look for**: 620+ tests passing across 22 files in under 10 seconds.

### Step 9: Observe Circuit Breaker in Action

1. Open 5+ losing positions in paper trading
2. Watch the circuit breaker trip to OPEN state
3. Wait for the cooldown period
4. Place a trade in HALF_OPEN state (50% position size)
5. Win a trade and watch position size increase to 75%
6. Win again and return to full CLOSED state

---

## 🏗️ Architecture

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NEWS SOURCES                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐                     │
│  │CryptoPanic│  │CoinGecko │  │CryptoCompare │                     │
│  └─────┬─────┘  └─────┬───┘  └──────┬───────┘                     │
│        │              │              │                               │
│        └──────────────┼──────────────┘                               │
│                       ▼                                              │
│            ┌─────────────────────┐                                   │
│            │  News Aggregator    │  Time-decay weighting             │
│            │  + Sentiment Engine │  Source credibility scoring       │
│            │  + Jaccard Dedup    │  Duplicate detection              │
│            └──────────┬──────────┘                                   │
│                       │                                              │
│                       ▼                                              │
│  ┌─────────────────────────────────────────────────────┐            │
│  │              SIGNAL ENGINE                           │            │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐    │            │
│  │  │Technical │ │Sentiment │ │ Candlestick      │    │            │
│  │  │Analysis  │ │Analysis  │ │ Pattern Recog.   │    │            │
│  │  │(12+ ind.)│ │(scored)  │ │ (7 patterns)     │    │            │
│  │  └────┬─────┘ └────┬─────┘ └────────┬─────────┘    │            │
│  │       └─────────────┼───────────────┘               │            │
│  │                     ▼                               │            │
│  │         ┌─────────────────────┐                     │            │
│  │         │ Multi-Timeframe     │  1d (40%) → 4h (30%)│            │
│  │         │ Weighted Scoring    │  → 1h (20%) → 15m   │            │
│  │         └──────────┬──────────┘                     │            │
│  │                    ▼                                │            │
│  │         ┌─────────────────────┐                     │            │
│  │         │ z-ai-web-dev-sdk    │  AI reasoning       │            │
│  │         │ Reasoning Engine    │  generation          │            │
│  │         └──────────┬──────────┘                     │            │
│  └────────────────────┼───────────────────────────────┘            │
│                       │ Signal + Confidence + Reasoning            │
│                       ▼                                              │
│            ┌─────────────────────┐                                   │
│            │  RISK MANAGER       │                                   │
│            │  ┌───────────────┐  │  Position Sizing                  │
│            │  │ Drawdown      │  │  Drawdown Check                   │
│            │  │ Protection    │  │  Daily Loss Limit                 │
│            │  └───────────────┘  │  Portfolio Risk Score             │
│            │  ┌───────────────┐  │                                   │
│            │  │ Circuit       │  │  5-loss → HALT                    │
│            │  │ Breaker       │  │  HALF_OPEN → Recovery             │
│            │  └───────────────┘  │                                   │
│            │  ┌───────────────┐  │                                   │
│            │  │ Margin Call   │  │  Auto-liquidation                 │
│            │  │ Detection     │  │  (worst-first ordering)           │
│            │  └───────────────┘  │                                   │
│            └──────────┬──────────┘                                   │
│                       │ Approved Trade                               │
│                       ▼                                              │
│            ┌─────────────────────┐                                   │
│            │  EXECUTION LAYER    │                                   │
│            │  ┌───────────────┐  │                                   │
│            │  │ Paper Trading │  │  Bybit commissions + slippage     │
│            │  │ (Demo Mode)   │  │  Trailing stops + leverage       │
│            │  └───────────────┘  │                                   │
│            │  ┌───────────────┐  │                                   │
│            │  │ Live Trading  │  │  Bybit API v5                    │
│            │  │ (Bybit API)   │  │  Market/Limit/Stop orders        │
│            │  └───────────────┘  │                                   │
│            └──────────┬──────────┘                                   │
│                       │ Trade Results                                │
│                       ▼                                              │
│  ┌──────────────────────────────────────────────────────┐           │
│  │              ANALYTICS & TRACKING                     │           │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │           │
│  │  │ Performance  │ │ Trade        │ │ Portfolio    │ │           │
│  │  │ Tracker      │ │ Journal      │ │ Rebalancer   │ │           │
│  │  │ (Sharpe/     │ │ (Review +    │ │ (Drift +     │ │           │
│  │  │  Sortino)    │ │  Lessons)    │ │  Suggestions)│ │           │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ │           │
│  └──────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

### Project Structure

```
mantle-ai-trader/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── trading/
│   │   │   │   ├── signals/route.ts    # AI signal generation endpoint
│   │   │   │   ├── news/route.ts       # News & sentiment endpoint
│   │   │   │   ├── backtest/route.ts   # Backtesting endpoint
│   │   │   │   └── demo/route.ts       # Paper trading endpoint
│   │   │   └── health/route.ts         # System health check
│   │   ├── layout.tsx                  # Root layout with SEO
│   │   ├── page.tsx                    # Main dashboard
│   │   └── error.tsx                   # Error boundary
│   ├── lib/
│   │   ├── trading/
│   │   │   ├── core/                   # Types, Trading Engine, Bybit Client
│   │   │   ├── signals/                # Signal Engine + 12+ indicators
│   │   │   ├── news/                   # Multi-source News Aggregator
│   │   │   ├── backtest/               # Backtesting Engine
│   │   │   ├── demo/                   # Paper Trading + Circuit Breaker
│   │   │   ├── risk/                   # Risk Management System
│   │   │   ├── analytics/              # Performance Tracker
│   │   │   ├── journal/                # Trade Journal System
│   │   │   └── portfolio/              # Portfolio Rebalancer
│   │   ├── api/                        # Validation + Rate Limiting
│   │   ├── vector/                     # VectorDB (ChromaDB)
│   │   └── db.ts                       # Prisma client
│   └── components/ui/                  # 40+ shadcn/ui components
├── tests/                              # 620+ tests across 22 files
│   ├── unit/                           # 16 unit test files
│   ├── integration/                    # 3 integration test files
│   ├── e2e/                            # 2 E2E test files
│   └── stress/                         # 1 stress test file
├── prisma/
│   ├── schema.prisma                   # Database schema (9 models)
│   └── data/                           # SQLite database
└── mini-services/
    └── trading-service/                # WebSocket real-time service
```

---

## 📊 Comparison with Competitors

| Feature | Typical Hackathon Bot | Basic Template | **Mantle AI Trader** |
|---------|----------------------|----------------|---------------------|
| Technical Indicators | 1-2 (RSI, MACD) | 3-5 | **12+** with proper math |
| Indicator Math | Simplified/approximate | Library-dependent | **Wilder's RSI, proper MACD signal line** |
| News Sentiment | None or single source | Basic keyword matching | **Multi-source + credibility + dedup** |
| Risk Management | Fixed stop-loss | Basic position sizing | **5 layers + circuit breaker** |
| Circuit Breaker | None | None | **3-state pattern with gradual recovery** |
| Paper Trading | No slippage/commissions | Basic simulation | **Bybit fees + slippage + leverage** |
| Testing | 0-10 tests | Basic smoke tests | **620+ tests across 4 categories** |
| Bug Fixes | Undocumented | Not tracked | **13 fixes with root cause analysis** |
| AI Reasoning | None | Rule-based | **z-ai-web-dev-sdk human-readable explanations** |
| Multi-Timeframe | Single timeframe | 2-3 | **4 timeframes with weighted scoring** |
| Portfolio Management | None | Basic P&L | **Rebalancer + Journal + Analytics** |
| Error Handling | Try/catch only | Basic validation | **Input validation + rate limiting + error boundary** |
| Type Safety | `any` everywhere | Partial | **Strict TypeScript (`noImplicitAny: true`)** |

### Key Differentiators Summary

1. **Mathematical Correctness**: Every indicator uses the industry-standard algorithm, not shortcuts
2. **Production Safety**: Circuit breaker + 5-layer risk management protect against catastrophic losses
3. **Test-Driven Quality**: 620+ tests prove correctness; 13 documented bug fixes show diligence
4. **Intelligence, Not Automation**: AI generates reasoning, not just signals — traders understand *why*
5. **Realistic Simulation**: Commissions, slippage, leverage effects, and margin calls match real trading

---

## 📈 Results & Metrics

| Metric | Value |
|--------|-------|
| Technical Indicators | 12+ |
| Candlestick Patterns | 7 |
| News Sources | 3 (CryptoPanic, CoinGecko, CryptoCompare) |
| Risk Management Layers | 5 |
| Test Count | 620+ |
| Test Files | 22 |
| Bug Fixes Documented | 13 (5 critical, 5 moderate, 2 security, 1 general) |
| TypeScript Strict Mode | Enabled (`noImplicitAny: true`) |
| API Validation Rules | 71 test cases |
| Code Coverage Areas | Unit, Integration, E2E, Stress |
| Supported Trading Pairs | 100+ (via Bybit API) |
| Timeframes | 4 (1d, 4h, 1h, 15m) |
| Supported Order Types | Market, Limit, Stop |

---

## 🔮 Future Roadmap

| Phase | Feature | Timeline |
|-------|---------|----------|
| v4.0 | Multi-exchange support (Binance, OKX) | 2 weeks |
| v4.1 | On-chain analytics (Mantle L2 integration) | 3 weeks |
| v4.2 | Social sentiment (Twitter/Reddit) | 2 weeks |
| v5.0 | Reinforcement learning position sizing | 4 weeks |
| v5.1 | Strategy marketplace | 3 weeks |

---

## 📞 Contact & Links

| Platform | Link |
|----------|------|
| **GitHub** | [github.com/roman-ryzenadvanced/mantle-ai-trader](https://github.com/roman-ryzenadvanced/mantle-ai-trader) |
| **Author** | [rommark.dev](https://rommark.dev) |
| **Twitter** | [@rommarkdev](https://twitter.com/rommarkdev) |
| **Hackathon Chat** | [Telegram](https://t.me/MantleTuringTestHackathon) |
| **License** | MIT (Open Source) |

---

*Built with ❤️ for the Mantle Turing Test Hackathon*
