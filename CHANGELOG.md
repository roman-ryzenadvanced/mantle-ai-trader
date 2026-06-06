# Changelog

All notable changes to the Mantle AI Trader project.

## [v3.6.1] - 2026-06-08

### Fixed
- **SSR `location is not defined` error** — Replaced `useState` + `router.push` with `usePathname()` for active tab detection in dashboard layout
- **SSR `localStorage` access in JSX** — Dashboard page now reads `localStorage` in `useEffect` instead of inline in render
- **Broken interface after import merge** — Restored `LogEntry` interface declaration that was accidentally removed during formatting
- **Auth guard race condition** — Dashboard layout now checks `status === 'loading'` before rendering, shows loading spinner instead of `null`

### Changed
- **Root `/` redirect** — Home page now redirects to `/dashboard` (new UI). Original trading terminal moved to `/terminal`
- **Sidebar** — Added "Terminal" nav item between Dashboard and Signals for access to original page
- **Active tab sync** — Sidebar now correctly highlights the active page based on URL pathname
- **Route-tab mapping** — Extracted `TAB_TO_ROUTE` / `ROUTE_TO_TAB` maps for DRY route handling

## [v3.6.0] - 2026-06-08

### Added
- **Risk Management Engine** (from Polymarket-bot)
  - 4-layer circuit breaker: daily loss limit (5%), monthly loss limit (15%), max drawdown (25%), total max loss (40%)
  - Dynamic position sizing: auto-adjusts based on consecutive win/loss streaks
  - RiskState model for circuit breaker persistence across sessions
  - RiskPanel dashboard component with real-time risk metrics
  - Circuit breaker status indicator (green/yellow/red)
  - Pause countdown timer when limits are breached
  - `canTrade()`, `calculatePositionSize()`, `recordTrade()`, `checkAutoReset()` pure functions

- **Market Opportunity Scoring** (from Polymarket-bot)
  - Weighted scoring formula: `volume * 0.4 + liquidity * 0.3 + spread * 0.3`
  - Configurable filters: min volume, min liquidity, max spread
  - Ranked market opportunity list with per-metric scores
  - `scoreMarkets()` and `getDefaultScorerConfig()` exports

- **Telegram Notification Service** (from Polymarket-bot)
  - Telegram Bot API integration for trade alerts, P&L updates, risk warnings, and error notifications
  - Markdown-formatted messages with emoji indicators per type
  - `NotificationService` class with `sendTradeNotification()`, `sendPnlUpdate()`, `sendRiskAlert()`, `sendErrorAlert()`
  - Connection test utility
  - Per-user toggle in settings (telegramEnabled, telegramBotToken, notificationsOnTrade/RiskWarning/Error)

- **Webhook Server** (from Polymarket-bot)
  - POST `/api/webhook` endpoint for external trigger of analysis cycles
  - Actions: `scan`, `risk_check`, `status`
  - Bearer token auth via `WEBHOOK_SECRET` env var

- **AI Chat Assistant** (inspired by CopilotKit)
  - Floating chat widget (bottom-right) with Brain icon
  - Spring animation on expand/collapse (framer-motion AnimatePresence)
  - Chat message display: user (right, blue), AI (left, gray), system (center)
  - Suggestion chips: "Analyze BTC", "Risk Check", "Explain Signal", "Market Overview"
  - Markdown-rendered AI responses
  - Auto-growing textarea input
  - Unread message badge indicator
  - `TradingCopilot` + `TradingCopilotLoader` (SSR-safe wrapper)

- **Dashboard Layout Overhaul**
  - New `Header` component: logo, DEMO/LIVE mode badge with pulse animation, user menu, sign-out
  - Collapsible `Sidebar` navigation: Dashboard, Signals, Positions, Trades, Backtest, Settings, News, History
  - Active route highlighting, mobile-responsive hamburger menu
  - Glass-morphism dark theme throughout (backdrop-blur, semi-transparent backgrounds, subtle borders)

- **Dashboard Overview Page** (`/dashboard`)
  - `StatsRow`: 4 animated stat cards (Portfolio Value, Daily P&L, Total Trades, Win Rate)
  - `AnimatedCounter`: framer-motion number counter with comma formatting
  - `PnLChart`: recharts AreaChart with gradient fill (green/red based on P&L direction)
  - `RiskPanel`: 6-metric risk dashboard (daily/monthly/total P&L, wins/losses, drawdown, circuit breaker)
  - `ActivityLog`: real-time event feed with color-coded levels (TRADE, SIGNAL, ERROR, WARN, INFO)
  - Quick Actions panel: Scan BTCUSDT, Refresh Data, Risk Check, Analytics

- **Dedicated Pages**
  - `/signals` — Signal grid with confidence meters, reasoning text, execute button
  - `/positions` — Open positions table with P&L color coding, close button
  - `/trades` — Trade history with status filter tabs (ALL/OPEN/CLOSED)
  - `/backtest` — Backtest form + results + equity curve chart
  - `/settings` — Trading mode, risk level, leverage, auto-trading, Telegram config
  - `/news` — News feed with sentiment badges and breaking news highlighting
  - `/history` — Session history tracking (placeholder)

- **Confidence Scoring Enhancement**
  - Confidence meters on signal cards (>70% green, 40-70% yellow, <40% red)
  - Visual progress bars with color gradient

### Changed
- **Build fixes**: Exported `RateLimitConfig` from rate-limiter.ts, fixed `possibly undefined` type check in risk-manager.ts
- **Prisma schema**: Added RiskState model, extended SystemLog with TRADE/SIGNAL levels and userId, added notification fields to UserSettings

## [v3.5.0] - 2026-06-07

### Added
- **User Management & Authentication System**
  - Full NextAuth.js v4 integration with CredentialsProvider and JWT sessions (30-day expiry)
  - User registration (`/register`) with name, email, password, and confirmation
  - Login page (`/login`) with email/password authentication and callback URL redirect
  - Per-user Account model in PostgreSQL (id, email, passwordHash, name, role, timestamps)
  - Password hashing with bcryptjs (12 rounds)
  - AuthProvider wrapping the entire app (SessionProvider from next-auth/react)
  - User menu in header: displays user name + sign-out button
  - Auth guard on dashboard: unauthenticated users see sign-in call-to-action
  - Automatic redirect to `/login` for protected pages

- **Per-User Data Isolation**
  - Per-user DemoTrader instances (Map-based, keyed by userId) replacing global singleton
  - All API routes scoped to authenticated user: demo, live, settings, signals, backtest
  - Each user gets their own demo portfolio, positions, trade history, and settings
  - Middleware-based route protection for `/api/trading/*` (public exceptions: market, news, health, auth)
  - JWT token verification via `getToken` from next-auth/jwt in middleware
  - API routes return 401 for unauthenticated requests, dashboard redirects to login

- **API Key Encryption**
  - AES-256-GCM encryption for exchange API keys stored at rest
  - PBKDF2 key derivation (100,000 iterations, SHA-256) from userId
  - Per-user encryption/decryption — keys are unique per user account
  - Exchange account settings encrypt API keys on save, decrypt on use
  - Salt, IV, and auth tag stored with ciphertext for secure key rotation

- **Auth Infrastructure**
  - `src/lib/auth.ts` — NextAuth configuration export (GET/POST handlers)
  - `src/lib/auth-options.ts` — Auth options: providers, JWT strategy, callbacks
  - `src/lib/auth-helper.ts` — `getAuthUser()` helper for server-side API routes
  - `src/lib/crypto.ts` — Encrypt/decrypt utilities with AES-256-GCM
  - `src/components/auth-provider.tsx` — Client-side SessionProvider wrapper
  - `src/middleware.ts` — Route protection with JWT token verification
  - `src/app/api/auth/[...nextauth]/route.ts` — NextAuth API route handler
  - `src/app/api/auth/register/route.ts` — User registration endpoint
  - `src/app/login/page.tsx` — Login page with Suspense boundary
  - `src/app/login/login-form.tsx` — Login form client component
  - `src/app/register/page.tsx` — Registration page with validation

### Changed
- `User` model renamed to `Account` in Prisma schema to avoid conflict with next-auth types
- All data models (ExchangeAccount, UserSettings, TradingSignal, BacktestSession, TradeHistory, DemoState) now include `userId` foreign key
- `getDemoTrader(userId)` factory function replaces singleton `demoTrader` export
- Demo state persistence key changed from `'singleton'` to `demo-${userId}`

### Fixed
- Demo order placement error ("internal error") — fixed price passing chain from frontend through API to DemoTrader
  - MARKET orders use `livePrice || entryPrice || 0` fallback
  - `executeSignal` and `closePosition` now pass current price to `placeOrder`
  - `placeOrder` uses `params.price || currentPrice` for execution price
  - Demo API route returns actual error messages instead of generic text
  - Fixed `p.symbol2` typo in DB restore to `p.symbol`

### Database
- Added `Account` model (id, email, passwordHash, name, role, createdAt, updatedAt)
- Added `userId` relation to: ExchangeAccount, UserSettings, TradingSignal, BacktestSession, TradeHistory, DemoState

---

## [v3.4.0] - 2026-06-06

### Added
- **Market Volume & Sentiment Monitor**
  - Real-time 24h volume data aggregated from 5 exchanges: Bybit, Binance, OKX, Gate.io, Bitget
  - Per-instrument breakdown with price, change %, high/low range, sentiment score
  - Volume bars proportional to total market volume for visual comparison
  - Exchange volume dominance (% share per source) for each instrument
  - Sentiment engine: bullish/bearish/neutral classification based on price change + bid/ask imbalance
  - Market-wide summary: overall sentiment, bullish/bearish/neutral counts, total volume
  - Tracks 10 instruments: BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, DOT, LINK
  - Auto-refresh every 60 seconds (no API keys needed — uses public endpoints)
  - Manual refresh button
  - Clickable rows to select instrument for trading

### New API
- `/api/trading/market?action=volume` — aggregated multi-exchange volume and sentiment data

---

## [v3.3.1] - 2026-06-06

### Added
- **Platform Presets in Trading Platforms settings**
  - Quick-select grid for 12 popular exchanges: Bybit, Binance, OKX, Bitget, KuCoin, Gate.io, HTX, Deribit, BingX, MEXC, BitMart, Crypto.com
  - Each preset auto-fills the account name and exchange type
  - Color-coded buttons with active selection highlight
  - Exchange field passed to API on save (no longer hardcoded to Bybit)

---

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
