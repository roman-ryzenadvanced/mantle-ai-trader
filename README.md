<div align="center">
  
  <!-- Main Banner -->
  <img src="https://img.shields.io/badge/Mantle%20AI%20Trader-🤖%20AI%20Crypto%20Trading%20Bot-blue?style=for-the-badge&logo=robot&logoColor=white&labelColor=1a1a2e&color=16213e" alt="Mantle AI Trader - AI-Powered Crypto Trading Bot" />
  
  <h1>🤖 Mantle AI Trader</h1>
  
  <h3>AI-Powered Cryptocurrency Trading Bot with News Sentiment Analysis</h3>
  
  <p>
    <strong>Free Open Source Trading Bot</strong> • 
    <strong>Bybit Integration</strong> • 
    <strong>Real-time Signals</strong> • 
    <strong>4-Layer Risk Management</strong> • 
    <strong>AI Chat Assistant</strong> • 
    <strong>Telegram Alerts</strong> • 
    <strong>Backtesting Engine</strong>
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
    <img src="https://img.shields.io/badge/Exchange-Bybit-orange?style=flat-square" alt="Bybit" />
    <img src="https://img.shields.io/badge/Database-PostgreSQL-blue?style=flat-square&logo=postgresql" alt="PostgreSQL" />
  </p>
  
  <p><em>🏆 Built for <strong>Mantle Turing Test Hackathon</strong> - $120,000 Prize Pool</em></p>
  
  <!-- Made by Badge -->
  <a href="https://rommark.dev" target="_blank">
    <img src="https://img.shields.io/badge/Made%20by-Rommark.Dev-ff6b6b?style=for-the-badge&logo=codeforces&logoColor=white&labelColor=2d3436" alt="Made by Rommark.Dev" />
  </a>
  
</div>

---

## 📋 Table of Contents

- [⚠️ Risk Disclaimer](#️-risk-disclaimer)
- [Features](#-features)
- [Demo](#-demo)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Usage](#-usage)
- [API Reference](#-api-reference)
- [Configuration](#-configuration)
- [Architecture](#-architecture)
- [Testing](#-testing)
- [Contributing](#-contributing)
- [License](#-license)

---

## ⚠️ Risk Disclaimer

> **🚨 CRITICAL WARNING - READ BEFORE USE 🚨**
>
> **This software is for EDUCATIONAL and DEMONSTRATION purposes ONLY.**
>
> - **TRADING INVOLVES SUBSTANTIAL RISK**: You could lose ALL your investment.
> - **NO GUARANTEE OF PROFITS**: Past performance does NOT guarantee future results.
> - **NOT FINANCIAL ADVICE**: AI signals are algorithmic suggestions, NOT professional advice.
> - **USE AT YOUR OWN RISK**: The creators are NOT responsible for any financial losses.
> - **PAPER TRADING RECOMMENDED**: Always test with demo mode before any live trading.
> - **NEVER TRADE WITH MONEY YOU CANNOT AFFORD TO LOSE**.
>
> 📖 **Read the full [DISCLAIMER.md](./DISCLAIMER.md) before using this software.**

---

## 🚀 Features

### 🤖 AI-Powered Trading Signals
| Feature | Description |
|---------|-------------|
| **Signal Generation** | AI-generated buy/sell signals with confidence scores |
| **Technical Analysis** | RSI, MACD, SMA, EMA, Bollinger Bands |
| **Pattern Recognition** | Doji, Hammer, Engulfing, Morning Star |
| **Support/Resistance** | Automated level detection |
| **Confidence Meters** | Visual confidence bars (green/yellow/red) with reasoning |

### 🤖 AI Chat Assistant (CopilotKit-inspired)
| Feature | Description |
|---------|-------------|
| **Floating Widget** | Expandable chat bubble with spring animations |
| **Context-Aware** | Reads positions, signals, risk state |
| **Markdown Responses** | Formatted AI analysis with structured data |
| **Suggestion Chips** | Quick actions: Analyze BTC, Risk Check, Market Overview |
| **Real-time Updates** | Streaming token-by-token display |

### 📰 Fundamental News Analysis
- **Multi-Source Aggregation**: CryptoPanic, CoinGecko, CryptoCompare
- **Sentiment Scoring**: Bullish/Bearish classification (-1 to 1)
- **Real-time Updates**: Live news feed integration
- **Impact Assessment**: News importance scoring

### 📊 Market Opportunity Scoring
- **Weighted Scoring**: `volume * 0.4 + liquidity * 0.3 + spread * 0.3`
- **Configurable Filters**: Min volume, min liquidity, max spread
- **Ranked Markets**: Auto-ranked by opportunity score (0-100)
- **Smart Filtering**: Eliminates illiquid or high-spread markets

### 📊 Backtesting Engine
- **Historical Simulation**: Test strategies on past data
- **Performance Metrics**: Sharpe Ratio, Win Rate, Max Drawdown
- **Strategy Optimization**: Parameter grid search
- **Detailed Reports**: Trade-by-trade analysis

### 💰 Paper Trading (Demo Mode)
- **Risk-Free Testing**: Practice without real money
- **Real Market Prices**: Live price simulation
- **Portfolio Tracking**: P&L monitoring
- **Position Management**: Stop-loss/Take-profit

### 🔗 Exchange Integration
- **Bybit API**: Full spot and futures support
- **Testnet Mode**: Safe testing environment
- **Order Types**: Market, Limit, Stop orders
- **Position Management**: Leverage, margin, risk controls

### 📱 Telegram Notifications
- **Trade Alerts**: Instant notifications on trade execution
- **P&L Updates**: Daily and session performance summaries
- **Risk Warnings**: Alerts when approaching loss limits
- **Error Alerts**: System error notifications
- **Per-User Config**: Individual toggle and chat ID settings
- **Webhook Server**: POST `/api/webhook` for external triggers

### 🛡️ 4-Layer Risk Management System
| Layer | Protection | Default |
|-------|------------|---------|
| **Layer 1** | Daily Loss Limit | 5% max daily loss |
| **Layer 2** | Monthly Loss Limit | 15% max monthly loss |
| **Layer 3** | Max Drawdown | 25% from peak |
| **Layer 4** | Total Max Loss | 40% permanent halt |

- **Dynamic Position Sizing**: Auto-adjusts based on win/loss streaks
- **Auto-Halt**: Automatic trading suspension when limits hit
- **Risk Metrics**: Real-time portfolio risk monitoring

### 🐋 Smart Money Tracking
- **Whale Alerts**: Track large wallet movements
- **Trader Metrics**: Win rate, profit factor, consistency scores
- **Quality Filtering**: Only follow verified profitable traders
- **Copy Trading**: Automatically mirror successful strategies

### ⚡ Performance Optimizations
- **Rate Limiter**: Token bucket algorithm for API calls
- **Cache Layer**: TTL-based caching for API responses
- **Circuit Breaker**: Prevent cascading failures
- **Retry Logic**: Exponential backoff for transient errors

---

## 🎬 Demo

<details>
<summary>📷 View Screenshots</summary>

### Dashboard Overview
![Dashboard](./public/dashboard-screenshot.png)

### Signal Generation
![Signals](./public/signals-screenshot.png)

### Paper Trading
![Demo Trading](./public/demo-trading-screenshot.png)

</details>

---

## ⚡ Quick Start

```bash
# Clone the repository
git clone https://github.com/roman-ryzenadvanced/mantle-ai-trader.git
cd mantle-ai-trader

# Install dependencies
bun install

# Setup database
bun run db:push

# Start the application
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

---

## 🛠 Installation

### Prerequisites

| Requirement | Version | Notes |
|------------|---------|-------|
| Node.js | 18+ | or Bun runtime |
| SQLite | Included | Default database |
| Bybit API | Optional | For live trading |

### Step-by-Step Setup

```bash
# 1. Clone repository
git clone https://github.com/roman-ryzenadvanced/mantle-ai-trader.git

# 2. Navigate to project
cd mantle-ai-trader

# 3. Install dependencies
bun install

# 4. Configure environment
cp .env.example .env
# Edit .env with your API keys (optional)

# 5. Initialize database
bun run db:push

# 6. Start development server
bun run dev

# 7. (Optional) Start WebSocket service
bun run trading-service
```

### Docker Installation (Coming Soon)

```bash
docker-compose up -d
```

---

## 📈 Usage

### Web Dashboard

| Tab | Function |
|-----|----------|
| **Dashboard** | Portfolio overview, P&L chart, risk metrics, activity log |
| **Signals** | Generate and view AI trading signals with confidence meters |
| **Positions** | Manage open positions and portfolio |
| **Trades** | Trade history with filters |
| **Backtest** | Run strategy simulations |
| **News** | View market news with sentiment |
| **Risk** | Detailed risk management dashboard |
| **Notifications** | Configure Telegram alerts |
| **Settings** | Trading mode, risk level, leverage, API keys |

### Supported Trading Pairs

- BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT
- And 100+ more via Bybit API

### Signal Example

```json
{
  "symbol": "BTCUSDT",
  "action": "BUY",
  "confidence": 0.85,
  "reasoning": "Bullish trend with strong support at $44,000. RSI oversold recovery.",
  "stopLoss": 43500,
  "takeProfit": 46500,
  "technicalScore": 0.78,
  "sentimentScore": 0.65
}
```

---

## 🔌 API Reference

### Base URL
```
http://localhost:3000/api/trading
```

### Endpoints

#### Generate Signal
```http
POST /signals
Content-Type: application/json

{
  "symbol": "BTCUSDT",
  "timeframe": "1h"
}
```

#### Get Portfolio
```http
GET /demo?action=portfolio
```

#### Place Demo Order
```http
POST /demo
Content-Type: application/json

{
  "action": "place_order",
  "symbol": "BTCUSDT",
  "side": "BUY",
  "quantity": 0.01,
  "type": "MARKET"
}
```

#### Run Backtest
```http
POST /backtest
Content-Type: application/json

{
  "symbol": "BTCUSDT",
  "startDate": "2024-01-01",
  "endDate": "2024-06-01",
  "initialCapital": 10000
}
```

#### Get News
```http
GET /news?symbol=BTC&limit=20
```

---

## 🔧 Configuration

### Environment Variables

```env
# Bybit Exchange (Optional)
BYBIT_API_KEY=your_api_key
BYBIT_API_SECRET=your_api_secret
BYBIT_TESTNET=true

# News APIs (Optional)
CRYPTOPANIC_API_KEY=your_key
CRYPTOCOMPARE_API_KEY=your_key

# Vector Database (Optional)
CHROMADB_URL=http://localhost:8000

# Database
DATABASE_URL="file:./prisma/data/mantle-trader.db"
```

### Risk Management Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Daily Max Loss | 5% | Auto-halt if daily loss exceeds |
| Monthly Max Loss | 15% | Auto-halt if monthly loss exceeds |
| Max Drawdown | 25% | Auto-halt if drawdown from peak |
| Total Max Loss | 40% | Permanent halt if total loss |
| Max Position | 10% | Maximum position as % of portfolio |
| Max Leverage | 5x | Maximum leverage multiplier |
| Auto Trading | Disabled | Automatic signal execution |

### Strategy Allocation

| Strategy | Allocation | Description |
|----------|------------|-------------|
| AI Signals | 50% | AI-generated trading signals |
| Smart Money | 25% | Copy trading profitable traders |
| Arbitrage | 15% | Price inefficiency opportunities |
| Manual | 10% | Reserved for manual trades |

---

## 📊 Architecture

```
mantle-ai-trader/
├── 📁 src/
│   ├── 📁 app/
│   │   ├── 📁 api/trading/     # REST API endpoints
│   │   ├── 📁 api/webhook/     # Webhook trigger endpoint
│   │   ├── 📄 layout.tsx       # Root layout with providers
│   │   ├── 📄 page.tsx         # Main trading dashboard
│   │   └── 📁 dashboard/       # New dashboard with overview/risk/analysis
│   ├── 📁 lib/
│   │   ├── 📁 trading/
│   │   │   ├── 📁 core/        # Core trading infrastructure
│   │   │   │   ├── 📄 types.ts         # Type definitions
│   │   │   │   ├── 📄 risk-manager.ts  # 4-Layer risk management
│   │   │   │   ├── 📄 market-scorer.ts # Market opportunity scoring
│   │   │   │   ├── 📄 rate-limiter.ts  # API rate limiting
│   │   │   │   ├── 📄 cache.ts         # TTL caching
│   │   │   │   ├── 📄 error-handler.ts # Retry & circuit breaker
│   │   │   │   ├── 📄 smart-money.ts   # Whale tracking
│   │   │   │   └── 📄 trading-config.ts# Unified configuration
│   │   │   ├── 📁 signals/     # AI signal engine
│   │   │   ├── 📁 news/        # News aggregator
│   │   │   ├── 📁 backtest/    # Backtesting
│   │   │   ├── 📁 demo/        # Paper trading
│   │   │   └── 📁 risk/        # Risk engine (circuit breaker)
│   │   ├── 📁 notifications/  # Telegram + notification service
│   │   └── 📁 vector/          # VectorDB
│   ├── 📁 components/
│   │   ├── 📁 ai/              # TradingCopilot chat widget
│   │   ├── 📁 dashboard/       # StatsRow, RiskPanel, PnLChart, AnimatedCounter
│   │   ├── 📁 layout/          # Header, Sidebar, ModeBadge
│   │   ├── 📁 risk/            # RiskPanel, CircuitBreakerStatus
│   │   └── 📁 ui/              # shadcn/ui components
├── 📁 mini-services/
│   └── 📁 trading-service/     # WebSocket service
├── 📁 prisma/
│   └── 📄 schema.prisma        # Database schema (PostgreSQL)
├── 📁 public/                  # Static assets
└── 📁 tests/                   # Test files
```

### Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16, TypeScript 5 |
| **Styling** | Tailwind CSS 4, shadcn/ui, Framer Motion |
| **Database** | Prisma ORM, PostgreSQL |
| **AI/ML** | z-ai-web-dev-sdk |
| **Exchange** | Bybit API v5 |
| **Real-time** | Socket.io |
| **Charts** | Recharts |
| **State** | Zustand, TanStack Query |
| **Risk Management** | 4-Layer Circuit Breaker System |
| **Notifications** | Telegram Bot API |
| **Caching** | TTL-based with LRU eviction |
| **Rate Limiting** | Token bucket algorithm |

---

## 🧪 Testing

```bash
# Run all tests
bun test

# Run unit tests
bun test tests/unit/

# Run integration tests
bun test tests/integration/

# Run with coverage
bun test --coverage
```

### Test Coverage

| Module | Coverage |
|--------|----------|
| Signal Engine | 85% |
| Demo Trader | 90% |
| News Aggregator | 75% |

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. 🍴 Fork the repository
2. 🌿 Create a feature branch (`git checkout -b feature/amazing-feature`)
3. 💾 Commit your changes (`git commit -m 'Add amazing feature'`)
4. 📤 Push to the branch (`git push origin feature/amazing-feature`)
5. 🔃 Open a Pull Request

### Code of Conduct
- Be respectful and inclusive
- Write clean, documented code
- Add tests for new features
- Update documentation

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

```
MIT License - Free to use, modify, and distribute
```

---

## 🏆 Mantle Turing Test Hackathon

This project is built for the **Mantle Turing Test Hackathon**:

| Info | Details |
|------|---------|
| **Prize Pool** | $120,000 cash + $103,000 API credits |
| **Tracks** | AI Trading, AI Alpha & Data |
| **Registration** | [mantle.to/Hackathon](https://mantle.to/Hackathon) |
| **Chat** | [Telegram](https://t.me/MantleTuringTestHackathon) |

### Competition Tracks
- ✅ **AI Trading** - Trading bots, strategy automation, Bybit API
- ✅ **AI Alpha & Data** - Onchain analytics, anomaly detection

---

## 🌟 Star History

<a href="https://www.star-history.com/#roman-ryzenadvanced/mantle-ai-trader&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=roman-ryzenadvanced/mantle-ai-trader&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=roman-ryzenadvanced/mantle-ai-trader&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=roman-ryzenadvanced/mantle-ai-trader&type=Date" />
 </picture>
</a>

---

## 📞 Support & Community

| Platform | Link |
|----------|------|
| **GitHub Issues** | [Report a Bug](https://github.com/roman-ryzenadvanced/mantle-ai-trader/issues) |
| **Discussions** | [GitHub Discussions](https://github.com/roman-ryzenadvanced/mantle-ai-trader/discussions) |
| **Telegram** | [Mantle Hackathon Chat](https://t.me/MantleTuringTestHackathon) |
| **Twitter** | [@rommarkdev](https://twitter.com/rommarkdev) |

---

<div align="center">
  
  <!-- Made by Rommark.Dev Banner -->
  <a href="https://rommark.dev" target="_blank">
    <img src="https://img.shields.io/badge/____________Made%20with%20❤️%20by%20Rommark.Dev____________-ff6b6b?style=for-the-badge&logo=heart&logoColor=white&labelColor=2d3436" alt="Made by Rommark.Dev" />
  </a>
  
  <br /><br />
  
  <p>
    <a href="https://github.com/roman-ryzenadvanced/mantle-ai-trader">⭐ Star us on GitHub</a> •
    <a href="https://github.com/roman-ryzenadvanced/mantle-ai-trader/issues">🐛 Report Bug</a> •
    <a href="https://github.com/roman-ryzenadvanced/mantle-ai-trader/pulls">💡 Request Feature</a>
  </p>
  
  <p><strong>Keywords:</strong> AI trading bot, cryptocurrency trading, crypto signals, Bybit API, trading automation, sentiment analysis, backtesting, paper trading, Mantle hackathon, open source trading bot, TypeScript, Next.js, algorithmic trading, DeFi, Web3</p>
  
</div>
