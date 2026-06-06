<div align="center">
  
  <!-- Main Banner -->
  <img src="./public/cover.png" alt="Mantle AI Trader Cover" width="100%" style="border-radius: 16px; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);" />
  
  <h1>Mantle AI Trader</h1>
  
  <h3>AI-Powered Cryptocurrency Trading Platform with Multi-Exchange Monitoring</h3>
  
  <p>
    <strong>Free Open Source Trading Bot</strong> &bull;
    <strong>Multi-Exchange</strong> &bull;
    <strong>Real-time Signals</strong> &bull;
    <strong>Volume Monitoring</strong> &bull;
    <strong>Backtesting</strong>
  </p>
  
  <!-- Badges -->
  <p>
    <a href="https://github.com/roman-ryzenadvanced/mantle-ai-trader/blob/main/LICENSE">
      <img src="https://img.shields.io/github/license/roman-ryzenadvanced/mantle-ai-trader?style=flat-square&color=green" alt="License" />
    </a>
    <img src="https://img.shields.io/github/stars/roman-ryzenadvanced/mantle-ai-trader?style=flat-square&logo=github&color=yellow" alt="Stars" />
    <img src="https://img.shields.io/github/forks/roman-ryzenadvanced/mantle-ai-trader?style=flat-square&logo=github" alt="Forks" />
    <img src="https://img.shields.io/github/issues/roman-ryzenadvanced/mantle-ai-trader?style=flat-square" alt="Issues" />
    <img src="https://img.shields.io/github/last-commit/roman-ryzenadvanced/mantle-ai-trader?style=flat-square" alt="Last Commit" />
  </p>
  
  <p>
    <img src="https://img.shields.io/badge/Platform-Next.js%2016-black?style=flat-square&logo=next.js" alt="Platform" />
    <img src="https://img.shields.io/badge/Language-TypeScript%205-blue?style=flat-square&logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/AI-z--ai--web--dev--sdk-purple?style=flat-square" alt="AI SDK" />
    <img src="https://img.shields.io/badge/Exchanges-Bybit%20%7C%20Binance%20%7C%20OKX%20%7C%20Gate.io%20%7C%20Bitget-orange?style=flat-square" alt="Exchanges" />
    <img src="https://img.shields.io/badge/Database-PostgreSQL-blue?style=flat-square&logo=postgresql" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Tests-620+%20passing-brightgreen?style=flat-square" alt="Tests" />
  </p>
  
  <p><em>Built for <strong>Mantle Turing Test Hackathon</strong></em></p>
  
  <!-- Made by Badge -->
  <a href="https://rommark.dev" target="_blank">
    <img src="https://img.shields.io/badge/Made%20by-Rommark.Dev-ff6b6b?style=for-the-badge&logo=codeforces&logoColor=white&labelColor=2d3436" alt="Made by Rommark.Dev" />
  </a>
  
</div>

---

## Risk Disclaimer

> **CRITICAL WARNING - READ BEFORE USE**
>
> This software is for **EDUCATIONAL and DEMONSTRATION purposes ONLY**.
>
> - Trading involves substantial risk of loss. You could lose your entire investment.
> - Past performance does NOT guarantee future results.
> - AI signals are algorithmic suggestions, NOT financial advice.
> - Paper trading (demo mode) is strongly recommended before any live trading.
> - **NEVER trade with money you cannot afford to lose.**
>
> Read the full [DISCLAIMER.md](./DISCLAIMER.md) before using this software.

---

## Features

### AI-Powered Trading Signals

| Feature | Description |
|---------|-------------|
| **Signal Generation** | AI-generated buy/sell signals with confidence scores |
| **Technical Analysis** | RSI, MACD, SMA, EMA, Bollinger Bands, VWAP, ADX, Volume Profile, Ichimoku Cloud, Stochastic Oscillator (%K/%D) |
| **Multi-Indicator Confirmation** | 10+ indicators cross-validated for signal quality |
| **Multi-Timeframe Analysis** | 6 timeframes: 1m, 5m, 15m, 1h, 4h, 1d |
| **Confidence Scoring** | Weighted composite score with per-indicator breakdown |

### Professional Trade Order Panel

| Feature | Description |
|---------|-------------|
| **Direction Toggle** | BUY / SELL selector |
| **Order Types** | Market and Limit orders |
| **Entry Price** | Editable for limit orders |
| **Stop Loss / Take Profit** | Manual entry with TP1/TP2/TP3 from signal |
| **Leverage Slider** | 1x-100x with signal pre-fill |
| **Risk Management** | % slider (0.1-10%) with quick presets (0.5/1/2/3/5%) |
| **Auto Quantity** | Calculated from risk % and stop loss distance |
| **Order Summary** | Position size, margin required, SL distance %, R:R ratio |

### Risk Management

| Feature | Description |
|---------|-------------|
| **Position Sizing** | Kelly Criterion, Fixed Fractional, Fixed Ratio |
| **Drawdown Protection** | Auto-halt at configurable drawdown threshold |
| **Portfolio Risk Scoring** | 0-1 scale combining position risk + concentration |
| **Circuit Breaker** | Auto-halt after consecutive losses with HALF_OPEN recovery |
| **Margin Call Detection** | Automatic liquidation of worst positions first |
| **Emergency Halt** | One-click trading halt |

### Market Volume & Sentiment Monitor

| Feature | Description |
|---------|-------------|
| **Multi-Exchange Volume** | 24h volume from Bybit, Binance, OKX, Gate.io, Bitget (public endpoints, no API keys needed) |
| **10 Instruments** | BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, DOT, LINK |
| **Sentiment Engine** | Bullish/Bearish/Neutral classification per instrument |
| **Volume Bars** | Proportional visualization with green/red direction |
| **Exchange Dominance** | % share per exchange for each instrument |
| **Market Summary** | Overall sentiment, bullish/bearish/neutral counts, total volume |
| **Auto-Refresh** | Every 60 seconds with manual refresh button |

### Exchange Platform Management

- **12 Platform Presets**: Bybit, Binance, OKX, Bitget, KuCoin, Gate.io, HTX, Deribit, BingX, MEXC, BitMart, Crypto.com
- **API Key Management**: Add/remove/test exchange accounts
- **Connection Testing**: Verify API key permissions before trading
- **Testnet/Mainnet Toggle**: Per-account safety controls
- **API Key Masking**: Keys hidden in API responses

### Demo/Live Trading Modes

- **One-click Toggle**: Switch between demo and live mode from the header
- **$10,000 Demo Account**: Virtual starting balance with simulated slippage
- **Live Order Execution**: Real market/limit orders on connected exchanges
- **Live Position Sync**: Real-time balance and position data from exchange
- **MT5-Style Trade Terminal**: Professional open trades table with P&L, close 50%, totals
- **Persistence**: Demo state (portfolio, positions, trades) saved to PostgreSQL — survives page refresh and server restarts
- **Auto-Sync**: Frontend syncs with server every 30 seconds in demo mode

### Backtesting Engine

- **7 Strategies**: RSI Reversal, MACD Crossover, Bollinger Breakout, Stochastic Swing, Ichimoku Trend, VWAP Mean Reversion, Multi-Indicator Composite
- **Performance Metrics**: Sharpe Ratio, Win Rate, Max Drawdown, Profit Factor
- **Commission & Slippage Modeling**: Realistic simulation

### Active Scanning

- **5 Strategies**: Balanced, Momentum, Breakout, Mean Reversion, VWAP/TWAP
- **News-Based Signals**: Breaking news integrated with scan results
- **Configurable Pairs, Strategies, Scan Interval**

### News & Sentiment Analysis

- **Multi-Source**: CryptoPanic, CoinGecko, CryptoCompare
- **Sentiment Scoring**: Bullish/Bearish classification (-1 to +1)
- **Impact Assessment**: High/Medium/Low importance

### Trade Journal

- **Trade Recording**: Log entries with entry/exit, PnL, emotional state
- **Review Reports**: Win/loss analysis per strategy
- **Search & Filter**: By date range, symbol, tags

### Portfolio Rebalancer

- **4 Strategies**: Equal Weight, Market Cap, Risk Parity, Custom
- **3 Triggers**: Time-based, Drift-based, Signal-based

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/roman-ryzenadvanced/mantle-ai-trader.git
cd mantle-ai-trader

# Install dependencies
bun install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Setup database (PostgreSQL)
bunx prisma migrate dev

# Start the application
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

---

## Installation

### Prerequisites

| Requirement | Version | Notes |
|------------|---------|-------|
| Bun | 1.2+ | Recommended runtime |
| PostgreSQL | 15+ | Database |
| Exchange API | Optional | For live trading |

### Setup

```bash
# 1. Clone repository
git clone https://github.com/roman-ryzenadvanced/mantle-ai-trader.git
cd mantle-ai-trader

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env
# Edit .env with your database URL and optional API keys

# 4. Initialize database
bunx prisma migrate dev

# 5. Start development server
bun run dev

# 6. (Optional) Start WebSocket price service
bun run trading-service
```

---

## Usage

### Dashboard Tabs

| Tab | Function |
|-----|----------|
| **Signals** | Generate and view AI trading signals, active multi-strategy scanning |
| **Positions** | MT5-style trade terminal with open positions, P&L tracking, close actions |
| **Backtest** | Run strategy simulations with equity curves and performance metrics |
| **News** | Market news with sentiment analysis and impact scoring |

### Dashboard Panels (always visible)

| Panel | Description |
|-------|-------------|
| **Portfolio Stats** | Portfolio value, realized P&L, unrealized P&L, market sentiment |
| **Risk Metrics** | Risk score, drawdown, signal quality, exposure |
| **Live Prices** | Real-time prices for BTC, ETH, SOL, BNB, XRP |
| **Market Volume Monitor** | Multi-exchange volume, sentiment per instrument, exchange dominance |
| **Trade Order Panel** | Full order configuration with risk management (below signals) |

### Supported Instruments

- BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, DOGEUSDT, ADAUSDT, AVAXUSDT, DOTUSDT, LINKUSDT
- And 100+ more via exchange API

---

## API Reference

### Base URL
```
http://localhost:3000/api/trading
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/demo?action=portfolio` | Get demo portfolio |
| GET | `/demo?action=positions` | Get demo positions |
| GET | `/demo?action=statistics` | Get demo statistics |
| GET | `/demo?action=sync` | Sync persisted demo state |
| POST | `/demo` | Place demo order, close position, etc. |
| GET | `/live?action=balance` | Get live exchange balance |
| GET | `/live?action=positions` | Get live exchange positions |
| GET | `/live?action=tickers` | Get live market prices |
| POST | `/live` | Place live order or close position |
| GET | `/market?action=volume` | Multi-exchange volume & sentiment |
| GET | `/signals` | List signals (filter by symbol, status) |
| POST | `/signals` | Generate signal for symbol/timeframe |
| POST | `/signals/scan` | Multi-strategy active scan |
| POST | `/signals/news-signals` | News-based signal generation |
| GET | `/news` | Paginated news with breaking/sentiment modes |
| GET | `/backtest` | List backtest sessions |
| POST | `/backtest` | Run backtest |
| GET | `/settings` | List exchange accounts |
| POST | `/settings` | Save, test, delete, activate accounts |
| GET | `/health` | System health check |

---

## Configuration

### Environment Variables

```env
# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/mantle_trader"

# Bybit Exchange (Optional - for live trading)
BYBIT_API_KEY=your_api_key
BYBIT_API_SECRET=your_secret

# News APIs (Optional)
CRYPTOPANIC_API_KEY=your_key
CRYPTOCOMPARE_API_KEY=your_key

# Vector Database (Optional)
CHROMADB_URL=http://localhost:8000
```

### Risk Management Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Risk Level | MODERATE | CONSERVATIVE, MODERATE, AGGRESSIVE |
| Max Position | $1,000 | Maximum position size |
| Max Leverage | 5x | Maximum leverage multiplier |
| Circuit Breaker | 5 losses | Consecutive losses before halt |

---

## Architecture

```
mantle-ai-trader/
├── src/
│   ├── app/
│   │   ├── api/trading/        # REST API endpoints
│   │   │   ├── demo/route.ts    # Demo trading (positions, orders, sync)
│   │   │   ├── live/route.ts    # Live exchange trading
│   │   │   ├── market/route.ts # Multi-exchange volume monitoring
│   │   │   ├── signals/        # Signal generation + scanning
│   │   │   ├── news/route.ts   # News aggregation + sentiment
│   │   │   ├── backtest/       # Backtesting engine
│   │   │   └── settings/       # Exchange account management
│   │   ├── layout.tsx          # Root layout with SEO
│   │   └── page.tsx            # Main dashboard (single-page)
│   ├── lib/
│   │   ├── trading/
│   │   │   ├── core/            # Bybit client, types
│   │   │   ├── signals/         # AI signal engine, 10+ indicators
│   │   │   ├── news/            # News aggregator, sentiment
│   │   │   ├── backtest/        # Backtesting engine, 7 strategies
│   │   │   ├── demo/            # Paper trading, circuit breaker, persistence
│   │   │   ├── risk/            # Risk management
│   │   │   ├── analytics/       # Performance tracking
│   │   │   ├── journal/         # Trade journal
│   │   │   └── portfolio/       # Portfolio rebalancer
│   │   └── api/                 # API validation utilities
│   └── components/ui/           # shadcn/ui components
├── tests/                       # 620+ tests across 22 files
├── mini-services/trading-service/ # WebSocket price service
├── prisma/
│   ├── schema.prisma            # Database schema (PostgreSQL)
│   └── data/                    # Database files
└── public/                      # Static assets
```

### Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16, TypeScript 5 |
| **Runtime** | Bun 1.2 |
| **Styling** | Tailwind CSS 4, shadcn/ui |
| **Database** | PostgreSQL, Prisma ORM |
| **AI/ML** | z-ai-web-dev-sdk |
| **Exchange** | Bybit API v5 (live), 5 exchanges (volume monitoring) |
| **Real-time** | Socket.io |
| **Charts** | Recharts |
| **Validation** | Zod |

---

## Testing

```bash
# Run all tests
bun test

# Run unit tests only
bun test tests/unit/

# Run integration tests
bun test tests/integration/
```

### Test Coverage

| Module | Tests | Status |
|--------|-------|--------|
| Core Types | 8 | All pass |
| Signal Engine | 18 | All pass |
| Technical Indicators | 61 | All pass |
| Ichimoku Cloud | 16 | All pass |
| Stochastic Oscillator | 21 | All pass |
| Demo Trader | 35 | All pass |
| News Aggregator | 14 | All pass |
| Vector Store | 5 | All pass |
| Backtest Engine | 6 | All pass |
| Risk Manager | 52 | All pass |
| Circuit Breaker | 30 | All pass |
| Performance Tracker | 47 | All pass |
| Bybit Client | 53 | All pass |
| API Validation | 71 | All pass |
| API Integration | 8 | All pass |
| Signal Pipeline | 26 | All pass |
| Risk Integration | 20 | All pass |
| Trade Journal | 30 | All pass |
| Portfolio Rebalancer | 28 | All pass |
| E2E Workflows | 10 | All pass |
| Stress Tests | 15 | All pass |
| **Total** | **620+** | **All pass** |

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| **v3.4.0** | 2026-06-06 | Multi-exchange market volume & sentiment monitor (Bybit, Binance, OKX, Gate.io, Bitget), per-instrument volume bars, sentiment engine, exchange dominance % |
| **v3.3.1** | 2026-06-06 | 12 platform presets in settings (Bybit, Binance, OKX, Bitget, KuCoin, Gate.io, HTX, Deribit, BingX, MEXC, BitMart, Crypto.com) |
| **v3.3.0** | 2026-06-06 | Persistence memory — demo state saved to PostgreSQL, auto-restore on startup, auto-sync every 30s |
| **v3.2.0** | 2026-06-06 | Exchange platform management, demo/live toggle, professional trade order panel, MT5 trade terminal, news sentiment indicators, active scanning (5 strategies) |
| **v3.1.0** | 2026-06-06 | Circuit breaker, Ichimoku Cloud, Stochastic Oscillator, trade journal, portfolio rebalancer, health check API |
| **v3.0.0** | 2026-06-06 | Risk management, performance analytics, Bollinger Bands, VWAP, ADX, Volume Profile |
| **v2.0.0** | 2026-06-06 | 8 critical bug fixes, comprehensive test suite |
| **v1.0.0** | 2025-06-06 | Initial release |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support & Community

| Platform | Link |
|----------|------|
| **GitHub Issues** | [Report a Bug](https://github.com/roman-ryzenadvanced/mantle-ai-trader/issues) |
| **Discussions** | [GitHub Discussions](https://github.com/roman-ryzenadvanced/mantle-ai-trader/discussions) |

---

<div align="center">

  <a href="https://rommark.dev" target="_blank">
    <img src="https://img.shields.io/badge/Made%20with%20❤️%20by%20Rommark.Dev-ff6b6b?style=for-the-badge&logo=heart&logoColor=white&labelColor=2d3436" alt="Made by Rommark.Dev" />
  </a>

  <br /><br />

  <p>
    <a href="https://github.com/roman-ryzenadvanced/mantle-ai-trader">Star us on GitHub</a> &bull;
    <a href="https://github.com/roman-ryzenadvanced/mantle-ai-trader/issues">Report Bug</a> &bull;
    <a href="https://github.com/roman-ryzenadvanced/mantle-ai-trader/pulls">Request Feature</a>
  </p>

</div>
