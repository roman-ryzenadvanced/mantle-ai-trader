# Mantle AI Trader

<div align="center">
  <img src="public/logo.svg" alt="Mantle AI Trader" width="200" />
  <h3>AI-Powered Fundamental News-Based Trading Bot</h3>
  <p>Built for Mantle Turing Test Hackathon</p>
</div>

## 🚀 Features

### Core Trading Capabilities
- **AI Signal Generation**: Advanced signal generation powered by AI with multi-factor analysis
- **Fundamental News Analysis**: Real-time news aggregation from multiple sources with sentiment analysis
- **Technical Analysis**: Comprehensive technical indicators (RSI, MACD, SMA, EMA) and pattern recognition
- **Risk Assessment**: Intelligent risk scoring and position sizing recommendations

### Trading Modes
- **Demo/Paper Trading**: Test strategies without real money
- **Manual Mode**: Execute signals manually with full control
- **Auto-Trading**: Automated signal execution (configurable)

### Analysis Tools
- **Backtesting Engine**: Test strategies on historical data with performance metrics
- **Signal Rating System**: Track and rate signal performance
- **Portfolio Analytics**: Real-time P&L tracking and portfolio visualization

### Integration
- **Bybit API**: Full integration with Bybit exchange (spot and futures)
- **WebSocket Real-time Updates**: Live price feeds and portfolio sync
- **VectorDB**: Semantic search for news and analysis

## 📊 Architecture

```
mantle-ai-trader/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API Routes
│   │   │   └── trading/        # Trading endpoints
│   │   └── page.tsx            # Main Dashboard
│   ├── lib/
│   │   ├── trading/
│   │   │   ├── core/           # Core types & Bybit client
│   │   │   ├── signals/        # Signal generation engine
│   │   │   ├── news/           # News aggregation
│   │   │   ├── backtest/       # Backtesting engine
│   │   │   └── demo/           # Paper trading
│   │   └── vector/             # VectorDB integration
│   └── components/ui/          # shadcn/ui components
├── mini-services/
│   └── trading-service/        # WebSocket service
├── prisma/
│   └── schema.prisma           # Database schema
└── tests/                      # Test files
```

## 🛠 Installation

### Prerequisites
- Node.js 18+ or Bun
- SQLite (included)
- Bybit API keys (optional for live trading)

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/mantle-ai-trader.git
cd mantle-ai-trader

# Install dependencies
bun install

# Initialize database
bun run db:push

# Start development server
bun run dev

# Start WebSocket service (separate terminal)
bun run trading-service
```

## 📈 Usage

### Dashboard

Access the dashboard at `http://localhost:3000`

1. **Signals Tab**: Generate AI signals for any supported trading pair
2. **Positions Tab**: View open positions and portfolio allocation
3. **Backtest Tab**: Run strategy backtests on historical data
4. **News Tab**: Browse latest market news with sentiment analysis

### API Endpoints

#### Signals
```bash
# Generate signal
POST /api/trading/signals
Body: { "symbol": "BTCUSDT", "timeframe": "1h", "demo": true }

# Get signals
GET /api/trading/signals?symbol=BTCUSDT&limit=50
```

#### Demo Trading
```bash
# Get portfolio
GET /api/trading/demo?action=portfolio

# Place order
POST /api/trading/demo
Body: { "action": "place_order", "symbol": "BTCUSDT", "side": "BUY", "quantity": 0.01, "type": "MARKET" }

# Close position
POST /api/trading/demo
Body: { "action": "close_position", "symbol": "BTCUSDT" }
```

#### Backtest
```bash
# Run backtest
POST /api/trading/backtest
Body: {
  "symbol": "BTCUSDT",
  "startDate": "2024-01-01",
  "endDate": "2024-06-01",
  "initialCapital": 10000
}
```

#### News
```bash
# Get news
GET /api/trading/news?symbol=BTC&limit=20

# Get sentiment
GET /api/trading/news/sentiment?symbol=BTC
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file:

```env
# Bybit API (optional - for live trading)
BYBIT_API_KEY=your_api_key
BYBIT_API_SECRET=your_api_secret
BYBIT_TESTNET=true

# News APIs (optional)
CRYPTOPANIC_API_KEY=your_key
CRYPTOCOMPARE_API_KEY=your_key

# ChromaDB (optional - for vector search)
CHROMADB_URL=http://localhost:8000

# Database
DATABASE_URL="file:./prisma/data/mantle-trader.db"
```

### Risk Settings

Configure in UserSettings table or via API:
- Risk Level: CONSERVATIVE, MODERATE, AGGRESSIVE
- Max Position Size: Default $1,000
- Max Leverage: Default 5x
- Auto Trading: Enable/disable automatic execution

## 📊 Signal Analysis

Each signal includes:

### Technical Analysis
- Trend direction and strength
- Support and resistance levels
- RSI, MACD, Moving Averages
- Candlestick patterns (Doji, Hammer, Engulfing, etc.)

### Fundamental Analysis
- News impact score
- Market events summary
- Economic factors

### Sentiment Analysis
- Overall sentiment score (-1 to 1)
- Sentiment label (Bullish/Bearish/Neutral)
- Key topics and trending keywords

### Risk Assessment
- Risk score and level
- Suggested stop-loss and take-profit
- Position sizing recommendations

## 🧪 Testing

```bash
# Run unit tests
bun test tests/unit/

# Run integration tests
bun test tests/integration/

# Run all tests
bun test
```

## 📝 Documentation

- [API Documentation](./docs/API.md)
- [Architecture Guide](./docs/ARCHITECTURE.md)
- [Contributing Guide](./docs/CONTRIBUTING.md)

## 🔒 Security

- API keys are stored encrypted in the database
- All exchange communications use HTTPS
- WebSocket connections support authentication
- Rate limiting on all API endpoints

## 📜 License

MIT License - See [LICENSE](LICENSE) for details.

## 🏆 Mantle Turing Test Hackathon

This project is built for the Mantle Turing Test Hackathon:

- **Track**: AI Trading
- **Prize Pool**: $120,000 cash + $103,000 API credits
- **Registration**: [mantle.to/Hackathon](https://mantle.to/Hackathon)

### Competition Tracks
- ✅ AI Trading - Trading bots, strategy automation, Bybit API
- ✅ AI Alpha & Data - Onchain analytics, anomaly detection

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📞 Support

- GitHub Issues: [Report a bug](https://github.com/yourusername/mantle-ai-trader/issues)
- Telegram: [Mantle Hackathon Chat](https://t.me/MantleTuringTestHackathon)

---

<div align="center">
  <p>Built with ❤️ for Mantle Turing Test Hackathon</p>
</div>
