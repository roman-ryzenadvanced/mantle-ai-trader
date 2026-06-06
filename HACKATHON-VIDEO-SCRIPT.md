# 🎬 Mantle AI Trader — Demo Video Script

**Duration: 3-5 minutes**
**Format: Screen recording with voiceover**
**Audience: Hackathon judges**

---

## Section 1: Hook (0:00–0:30)

### Visual
- Open with the dashboard loading on screen
- Show the dashboard with signal cards, portfolio chart, and news feed all visible
- Cut to a quick montage: signal generation → trade execution → risk alert → profit

### Voiceover
> "What if you could have an AI trading assistant that reads the news, analyzes 12+ technical indicators, and manages risk automatically — all in real time? That's exactly what Mantle AI Trader does. Let me show you."

---

## Section 2: Problem (0:30–1:00)

### Visual
- Show a blank chart with RSI, MACD, Bollinger Bands, and Volume all overlaid — it's a mess
- Add a scrolling news feed on the side with 20+ headlines
- Show a simple bot with just "RSI < 30 = BUY" logic
- Cross it out with a red X
- Show the text: "90%+ of retail crypto traders lose money"

### Voiceover
> "Crypto traders face information overload. You need to process hundreds of news articles, technical indicators, and market signals simultaneously. Most trading bots use just one or two indicators — RSI below 30, buy. That's not trading, that's gambling. And when things go wrong, there's no safety net. Retail traders end up revenge-trading and blowing up their accounts."

---

## Section 3: Solution Demo (1:00–3:30)

### 3a. Signal Generation (1:00–1:45)

#### Visual
- Open the dashboard at http://localhost:3000
- Click "Generate Signal" for BTCUSDT on 1h timeframe
- Show the signal response appearing with:
  - Action: BUY
  - Confidence: 0.85
  - Full technical analysis breakdown (RSI, MACD, Bollinger, VWAP, ADX, Ichimoku, Stochastic)
  - News sentiment analysis with source credibility scores
  - AI reasoning: "Bullish trend confirmed across multiple timeframes..."

#### Voiceover
> "Let's generate a signal. The engine pulls market data, runs 12+ technical indicators with mathematically correct calculations — not approximations — and aggregates news from three sources with credibility-weighted sentiment scoring. The result isn't just a BUY or SELL — it's a detailed explanation of *why*, powered by AI reasoning through z-ai-web-dev-sdk."

### 3b. Paper Trading Demo (1:45–2:30)

#### Visual
- Show the portfolio starting at $10,000
- Place a BUY order for 0.01 BTCUSDT at market price
- Show the commission deduction (0.06% taker fee)
- Update the price upward — show unrealized PnL increasing with leverage effects
- Show the trailing stop automatically adjusting upward
- Close the position — show realized PnL with commission deducted

#### Voiceover
> "Now let's place a paper trade. Notice how commissions are deducted using real Bybit fee structures — 0.06% for taker orders. Leverage effects are properly calculated in PnL. And trailing stops automatically follow the price, locking in gains as the position moves in your favor. This isn't a toy simulation — it matches real trading conditions."

### 3c. Circuit Breaker in Action (2:30–3:00)

#### Visual
- Show 5 consecutive losing trades
- Display the circuit breaker tripping: "Status: OPEN — Trading halted"
- Show the cooldown timer counting down
- After cooldown: "Status: HALF_OPEN — Position size reduced to 50%"
- Place a winning trade in HALF_OPEN state
- Show position size increasing to 75%
- Another winning trade: "Status: CLOSED — Full recovery"

#### Voiceover
> "Here's something you won't find in other hackathon projects — a circuit breaker. After 5 consecutive losses, trading automatically halts. After a cooldown, you can trade again but at half position size. Each winning trade gradually increases your position size back to normal. This prevents the number one cause of account blowups: revenge trading."

### 3d. Backtesting (3:00–3:15)

#### Visual
- Run a backtest for BTCUSDT, Jan–June 2024, $10K starting capital
- Show results: Total Return, Sharpe Ratio, Win Rate, Max Drawdown
- Show the correct annualized return (using actual period days, not 365/365=1)

#### Voiceover
> "Backtesting uses correct annualized return calculations — we found and fixed a bug where the formula divided 365 by 365, making annualized return identical to total return. That's the kind of attention to detail we bring."

### 3e. Health Check (3:15–3:30)

#### Visual
- Run `curl http://localhost:3000/api/health`
- Show the JSON response with database, Bybit API, and ChromaDB status
- Show memory usage and uptime

#### Voiceover
> "The health check endpoint monitors all critical components — database, exchange API, vector store — with latency measurements. Everything you need to know if the system is running correctly."

---

## Section 4: Technical Deep Dive (3:30–4:30)

### 4a. Indicator Math (3:30–4:00)

#### Visual
- Show side-by-side code comparison:
  - Left: Simple RSI (`average of last 14 gains / losses`)
  - Right: Wilder's RSI (`(prev_avg * 13 + current) / 14`)
- Highlight the MACD signal line code: running EMA vs static lookback
- Show the Bollinger Bands squeeze detection logic
- Show the Stochastic `%K ?? 50` fix (not `|| 50`)

#### Voiceover
> "Every indicator uses the correct mathematical algorithm. Our RSI uses Wilder's smoothing — the same method used by Bloomberg Terminal and TradingView. The MACD signal line maintains a running EMA, not a static lookback that would always equal the MACD line. And we caught a subtle bug where `%K = 0` was being replaced with 50 because JavaScript's `||` operator treats 0 as falsy. We switched to nullish coalescing `??` to correctly preserve zero values."

### 4b. Test Coverage (4:00–4:15)

#### Visual
- Run `bun test` in the terminal
- Show the output: "620+ tests passing" across 22 files
- Quick scroll through the test file list showing unit, integration, e2e, and stress categories
- Highlight a few test names: "should handle RSI = 0 when price is at period low", "should halt trading after 5 consecutive losses", "should handle 1000 rapid price updates"

#### Voiceover
> "620+ tests across 22 files — unit, integration, end-to-end, and stress tests. We test edge cases that matter: zero values, concurrent operations, state leakage between backtests. Most hackathon projects have zero tests. We have 620+ because we're building something that actually works."

### 4c. Risk Architecture (4:15–4:30)

#### Visual
- Show the 5-layer risk management diagram:
  1. Position Sizing (Kelly Criterion)
  2. Drawdown Protection (auto-halt at 20%)
  3. Daily Loss Limit (5% cap)
  4. Circuit Breaker (3-state pattern)
  5. Margin Call Detection (worst-first liquidation)
- Show the risk assessment flow: Signal → Risk Check → Approved/Rejected

#### Voiceover
> "Five layers of risk management protect the portfolio. Position sizing uses Kelly Criterion principles. Drawdown protection auto-halts at 20%. Daily loss limits cap exposure. The circuit breaker prevents revenge trading. And margin call detection automatically liquidates worst-performing positions first. This is institutional-grade risk management in a hackathon project."

---

## Section 5: Call to Action (4:30–5:00)

### Visual
- Show the GitHub repository page
- Highlight the star count and license (MIT)
- Show the README with all features listed
- Display: "620+ tests | 12+ indicators | 5 risk layers | 13 bug fixes documented"
- Show QR code linking to the repo
- Fade to the project logo and tagline

#### Voiceover
> "Mantle AI Trader — AI-powered crypto trading with mathematical precision, institutional-grade risk management, and 620+ tests proving it works. Star the repo, try the demo, and join us in building the future of AI-assisted trading. The link is in the description. Thank you."

---

## Production Notes

### Recording Setup
- **Resolution**: 1920x1080 minimum
- **Frame Rate**: 30fps
- **Audio**: External microphone, noise suppression enabled
- **Browser**: Chrome with DevTools closed (clean view)
- **Terminal**: Dark theme, font size 16+ (readable on mobile)

### Key Screenshots to Capture
1. Dashboard overview (full page)
2. Signal generation response (JSON)
3. Circuit breaker status transition (3 states)
4. Backtest results
5. Health check response
6. Test suite output (620+ passing)
7. GitHub repository with README

### Editing Tips
- Add subtle zoom on important values (confidence score, PnL, risk score)
- Use text overlays for key numbers ("620+ tests", "5 risk layers", "12+ indicators")
- Add background music (low volume, no vocals, royalty-free)
- Include chapter markers in YouTube description
- Add subtitles for accessibility

### Backup Plan
If live demo fails, have pre-recorded clips of:
- Signal generation
- Circuit breaker tripping
- Backtest running
- Test suite passing
