# Changelog

All notable changes to this project will be documented in this file.

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
  - Technical analysis with 6+ indicators:
    - Simple Moving Average (SMA)
    - Exponential Moving Average (EMA)
    - Relative Strength Index (RSI)
    - MACD (Moving Average Convergence Divergence)
    - Support/Resistance detection
    - Candlestick pattern recognition
  - Fundamental analysis from news data
  - Sentiment analysis with keyword-based scoring
  - Risk assessment with position sizing
  - AI reasoning generation using z-ai-web-dev-sdk
  - Confidence scoring (0-1)
  - Target price, stop-loss, and take-profit calculation

#### News Aggregation System
- **NewsAggregator**: Multi-source news collection
  - CryptoPanic integration
  - CoinGecko status updates
  - CryptoCompare news feed
  - Custom RSS feed support
  - Sentiment analysis for each article
  - Category detection and tag extraction
  - Importance scoring
  - Market-moving news detection

#### VectorDB Integration
- **VectorStore**: Semantic search for news and signals
  - ChromaDB client integration
  - Fallback embedding generation
  - News article storage and retrieval
  - Signal analysis persistence
  - Similar signal search
  - Contextual sentiment analysis

#### Backtesting Engine
- **BacktestEngine**: Strategy simulation on historical data
  - Historical data generation (can be replaced with real data)
  - Trade execution simulation
  - Slippage and fee modeling
  - Stop-loss and take-profit testing
  - Performance metrics calculation:
    - Total and annualized return
    - Sharpe and Sortino ratios
    - Maximum drawdown
    - Win rate and profit factor
  - Strategy optimization with parameter grid search
  - Backtest report generation

#### Demo Trading Mode
- **DemoTrader**: Paper trading system
  - Virtual portfolio management
  - Order placement and execution
  - Position tracking with P&L
  - Stop-loss and take-profit monitoring
  - Trade statistics and history
  - Real-time price updates
  - Event-based notifications

#### WebSocket Service
- **TradingWebSocketService**: Real-time data streaming
  - Socket.io server implementation
  - Live price updates
  - Portfolio sync
  - Signal subscriptions
  - Demo trading via WebSocket
  - News streaming

#### API Routes
- `/api/trading/signals`: Signal generation and retrieval
- `/api/trading/news`: News fetching and sentiment
- `/api/trading/backtest`: Backtest execution and results
- `/api/trading/demo`: Demo trading operations

#### Dashboard UI
- Real-time trading dashboard
- 4 main tabs: Signals, Positions, Backtest, News
- Live price ticker
- Portfolio visualization with charts
- Signal generation interface
- Position management
- News feed with sentiment indicators
- Backtesting interface

### Database Schema
- **Signal**: Trading signals with analysis data
- **Trade**: Trade execution records
- **NewsArticle**: News storage with sentiment
- **MarketData**: Cached market data
- **BacktestSession**: Backtest configurations
- **BacktestResult**: Individual backtest trades
- **Portfolio**: Portfolio tracking
- **Position**: Open positions
- **UserSettings**: User configuration
- **SignalRating**: Signal performance ratings
- **SystemLog**: System event logging

### Technical Details
- Next.js 16 with App Router
- TypeScript 5
- Tailwind CSS 4
- shadcn/ui components
- Prisma ORM with SQLite
- Socket.io for real-time updates
- Recharts for data visualization
- z-ai-web-dev-sdk for AI capabilities

### Security
- API key encryption support
- Testnet-first approach
- Rate limiting ready
- Input validation with Zod

### Documentation
- Comprehensive README
- API documentation
- Architecture overview
- Code comments

---

## Upcoming Features

### [1.1.0] - Planned
- CopilotKit integration for conversational trading
- Telegram/Discord notifications
- Advanced order types (OCO, trailing stop)
- Multi-exchange support
- Strategy marketplace
- Social trading features

### [1.2.0] - Planned
- Machine learning model training
- Custom strategy builder
- Advanced analytics dashboard
- Mobile app support

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2025-06-06 | Initial release for Mantle Hackathon |
