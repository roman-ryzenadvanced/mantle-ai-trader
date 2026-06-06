# Changelog

All notable changes to the Mantle AI Trader project.

## [v3.3.0] - 2026-06-06

### Added
- **Persistence Memory**
  - Demo trader state (portfolio, positions, trades, circuit breaker) persisted to PostgreSQL via `DemoState` model
  - State auto-restored on server startup from database
  - `persistState()` called after every trade: place order, close position, reset
  - Debounced persistence on price updates (5-second debounce to avoid excessive DB writes)
  - `sync` API endpoint (`/api/trading/demo?action=sync`) for full state retrieval
  - Auto-sync polling on frontend (every 30s) keeps UI in sync with persisted state
  - Initial page load restores persisted portfolio and positions from server
  - Trading mode (demo/live) saved to localStorage and restored on reload

### Database
- Added `DemoState` model (singleton row with portfolioData, positionsData, realizedData, circuitData as JSON columns)

---

## [v3.2.0] - 2026-06-06

### Added
- **Exchange Platform Management**
  - Add/remove trading exchange accounts (Bybit) with API keys and secrets
  - Test connection to verify API key permissions before trading
  - Activate/deactivate accounts, support multiple saved accounts
  - Testnet/mainnet toggle per account with mainnet risk warning
  - API keys masked in responses for security

- **Demo/Live Trading Mode**
  - One-click DEMO/LIVE toggle in the header
  - Switching to LIVE without configured account auto-opens Settings
  - Live balance, positions, and market data fetched from exchange
  - 15-second auto-refresh for live data
  - All Execute Trade buttons route to correct mode (demo or live)
  - Trade Terminal fully mode-aware: badge, balance, positions, close actions

- **Professional Trade Order Panel**
  - Replaced simple Execute Trade buttons with full order configuration
  - Direction toggle (BUY/SELL), Order Type (Market/Limit)
  - Entry Price (editable for limit orders), Stop Loss, Take Profit
  - TP Level selector (TP1/TP2/TP3 from signal with % from entry)
  - Leverage slider (1x-100x) with signal pre-fill
  - Risk management: % slider (0.1-10%) with quick presets (0.5/1/2/3/5%)
  - Auto-calculates quantity from risk % and stop loss distance
  - Order summary: position size, margin required, SL distance %, R:R ratio
  - Submit button shows "BUY/SELL SYMBOL @ price" with loading state

- **MT5-Style Trade Terminal**
  - Professional open trades table with columns: #, Symbol, Type, Volume, Open Price, Current, S/L, T/P, Swap, P&L, P&L %, Time, Actions
  - Summary bar: Open Positions, Total Unrealized P&L, Realized P&L, Closed Trades
  - Close position (X) and Close 50% (%) action buttons per trade
  - Totals footer row with aggregate P&L
  - Mode-aware: shows demo positions or live exchange positions

- **News Sentiment Indicators**
  - Added "News Sentiment" to indicator summary with score, signal (BULLISH/BEARISH/NEUTRAL), and description

- **Active Scanning Mode**
  - 5 strategies: BALANCED, MOMENTUM, BREAKOUT, MEAN_REVERSION, VWAP_TWAP
  - News-based signal generation integrated with scan results
  - Configurable pairs, strategies, scan interval, news toggle
  - Live Scan Feed with full professional signal card format

### API Endpoints Added
- `GET /api/trading/settings` — List exchange accounts (masked keys)
- `POST /api/trading/settings` — Save, test connection, delete, activate account
- `GET /api/trading/live?action=balance` — Fetch live wallet balance
- `GET /api/trading/live?action=positions` — Fetch live positions
- `GET /api/trading/live?action=tickers` — Fetch live market prices
- `POST /api/trading/live` — Place live order or close live position
- `POST /api/trading/signals/scan` — Active mode multi-strategy scan
- `POST /api/trading/signals/news-signals` — News-based signal generation

### Database
- Added `ExchangeAccount` model (id, name, exchange, apiKey, apiSecret, testnet, isActive, lastTested, lastError)

---

## [v3.1.0] - 2026-06-06

### Added
- Circuit Breaker pattern with HALF_OPEN recovery
- Ichimoku Cloud indicator
- Stochastic Oscillator (%K/%D)
- Trade Journal system
- Portfolio Rebalancer
- Health Check API
- 620+ tests across 22 files

---

## [v3.0.0] - 2026-06-06

### Added
- Risk Management system
- Performance Analytics
- Bollinger Bands, VWAP, ADX, Volume Profile
- 447 tests

---

## [v2.0.0] - 2026-06-06

### Fixed
- 8 critical bug fixes including sentiment, MACD, RSI corrections
- Comprehensive test suite added

---

## [v1.0.0] - 2025-06-06

### Added
- Initial release with core trading engine
- Bybit API integration
- Basic signal generation
