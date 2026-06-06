/**
 * E2E Test: Hackathon Demo
 * THE demo script for hackathon judges that demonstrates the full system:
 * - Complete trading workflow from signal to profit
 * - Multi-symbol portfolio management
 * - Risk management protections
 * - Performance analytics generation
 * - News-based trading decisions
 *
 * This test is designed to showcase the entire Mantle AI Trader system
 * in a single comprehensive test flow.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DemoTrader } from '../../src/lib/trading/demo/demo-trader';
import { SignalEngine } from '../../src/lib/trading/signals/signal-engine';
import { NewsAggregator } from '../../src/lib/trading/news/news-aggregator';
import {
  TradeAction,
  OrderType,
  OrderStatus,
  TimeFrame,
  MarketDataPoint,
  SignalStatus,
  SentimentLabel
} from '../../src/lib/trading/core/types';

// ==================== DEMO DATA GENERATORS ====================

function generateDemoMarketData(symbol: string, count: number, basePrice: number, trend?: 'up' | 'down' | 'sideways'): MarketDataPoint[] {
  const data: MarketDataPoint[] = [];
  let price = basePrice;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  let seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seededRandom = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const bias = trend === 'up' ? 0.015 : trend === 'down' ? -0.015 : 0;

  for (let i = count; i >= 0; i--) {
    const change = (seededRandom() - 0.5 + bias) * price * 0.015;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + seededRandom() * Math.abs(change) * 0.5;
    const low = Math.min(open, close) - seededRandom() * Math.abs(change) * 0.5;
    const volume = 5000 + seededRandom() * 15000;

    data.push({
      symbol,
      timeframe: TimeFrame.ONE_HOUR,
      timestamp: new Date(now - i * hourMs),
      open,
      high,
      low,
      close,
      volume
    });

    price = close;
  }

  return data;
}

// ==================== TESTS ====================

describe('Hackathon Demo: Full System Showcase', () => {
  let trader: DemoTrader;
  let engine: SignalEngine;
  let newsAggregator: NewsAggregator;

  beforeEach(() => {
    trader = new DemoTrader(100000); // $100k demo account
    engine = new SignalEngine();
    newsAggregator = new NewsAggregator();
  });

  test('Demo 1: Complete Trading Workflow - From Signal to Profit', async () => {
    console.log('=== HACKATHON DEMO: Signal to Profit ===');

    // Step 1: Set up market data
    console.log('Step 1: Generating market data for BTCUSDT...');
    const btcData = generateDemoMarketData('BTCUSDT', 200, 45000, 'up');
    const currentBTCPrice = btcData[btcData.length - 1].close;
    console.log(`Current BTC Price: $${currentBTCPrice.toFixed(2)}`);

    // Step 2: Generate AI-powered signal
    console.log('Step 2: Generating AI trading signal...');
    const signalResult = await engine.generateSignal({
      symbol: 'BTCUSDT',
      timeframe: TimeFrame.ONE_HOUR,
      marketData: btcData,
      newsArticles: []
    });

    console.log(`Signal: ${signalResult.signal.action} BTCUSDT`);
    console.log(`Confidence: ${(signalResult.signal.confidence * 100).toFixed(1)}%`);
    console.log(`Technical Score: ${signalResult.signal.technicalScore?.toFixed(2)}`);
    console.log(`Reasoning: ${signalResult.signal.reasoning}`);

    expect(signalResult.signal).toBeDefined();
    expect(signalResult.signal.action).toBeDefined();
    expect([TradeAction.BUY, TradeAction.SELL, TradeAction.HOLD]).toContain(signalResult.signal.action);

    // Step 3: Execute signal in demo mode
    console.log('Step 3: Executing signal in demo mode...');
    trader.updatePrice('BTCUSDT', currentBTCPrice);

    if (signalResult.signal.action !== TradeAction.HOLD) {
      const signal = {
        id: 'demo-signal-1',
        ...signalResult.signal,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const order = await trader.executeSignal(signal);
      if (order) {
        console.log(`Order executed: ${order.side} ${order.quantity} BTCUSDT at $${order.price.toFixed(2)}`);
        expect(order.status).toBe(OrderStatus.FILLED);
      }

      // Step 4: Monitor position
      console.log('Step 4: Monitoring position...');
      let positions = trader.getPositions();
      expect(positions.length).toBeGreaterThan(0);

      // Simulate favorable price movement
      const newPrice = currentBTCPrice * 1.03; // 3% up
      trader.updatePrice('BTCUSDT', newPrice);

      positions = trader.getPositions();
      if (positions.length > 0) {
        console.log(`Unrealized PnL: $${positions[0].unrealizedPnL.toFixed(2)}`);
      }

      // Step 5: Close position with profit
      console.log('Step 5: Closing position...');
      trader.closePosition('BTCUSDT');

      const portfolio = trader.getPortfolio();
      console.log(`Realized PnL: $${portfolio.realizedPnL.toFixed(2)}`);
      console.log(`Portfolio Value: $${portfolio.totalValue.toFixed(2)}`);

      expect(trader.getPositions().length).toBe(0);
    }

    console.log('=== Demo 1 Complete ===\n');
  });

  test('Demo 2: Multi-Symbol Portfolio Management', async () => {
    console.log('=== HACKATHON DEMO: Multi-Symbol Portfolio ===');

    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    const basePrices: Record<string, number> = {
      BTCUSDT: 45000,
      ETHUSDT: 2500,
      SOLUSDT: 100
    };

    // Set up prices
    symbols.forEach(symbol => {
      trader.updatePrice(symbol, basePrices[symbol]);
    });

    // Open positions in multiple symbols
    console.log('Opening positions in BTC, ETH, and SOL...');

    // BTC Long
    trader.placeOrder({
      symbol: 'BTCUSDT',
      side: TradeAction.BUY,
      type: OrderType.MARKET,
      quantity: 0.5,
      stopLoss: 44000,
      takeProfit: 47000
    });
    console.log('Opened BTCUSDT LONG: 0.5 BTC');

    // ETH Long
    trader.placeOrder({
      symbol: 'ETHUSDT',
      side: TradeAction.BUY,
      type: OrderType.MARKET,
      quantity: 5,
      stopLoss: 2400,
      takeProfit: 2700
    });
    console.log('Opened ETHUSDT LONG: 5 ETH');

    // SOL Short
    trader.placeOrder({
      symbol: 'SOLUSDT',
      side: TradeAction.SELL,
      type: OrderType.MARKET,
      quantity: 100,
      stopLoss: 110,
      takeProfit: 90
    });
    console.log('Opened SOLUSDT SHORT: 100 SOL');

    const positions = trader.getPositions();
    expect(positions.length).toBe(3);
    console.log(`\nPortfolio has ${positions.length} open positions`);

    // Simulate market movement
    console.log('\nSimulating market movement...');
    trader.updatePrice('BTCUSDT', 46000);   // BTC up 2.2%
    trader.updatePrice('ETHUSDT', 2600);     // ETH up 4%
    trader.updatePrice('SOLUSDT', 95);        // SOL down 5% (good for short)

    // Check portfolio status
    const portfolio = trader.getPortfolio();
    console.log(`Portfolio Total Value: $${portfolio.totalValue.toFixed(2)}`);
    console.log(`Unrealized PnL: $${portfolio.unrealizedPnL.toFixed(2)}`);

    positions.forEach(pos => {
      console.log(`${pos.symbol} (${pos.side}): PnL = $${pos.unrealizedPnL.toFixed(2)}`);
    });

    // Generate signals for all symbols
    console.log('\nGenerating AI signals for all positions...');
    for (const symbol of symbols) {
      const marketData = generateDemoMarketData(symbol, 200, basePrices[symbol]);
      const result = await engine.generateSignal({
        symbol,
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });
      console.log(`${symbol}: ${result.signal.action} (confidence: ${(result.signal.confidence * 100).toFixed(1)}%)`);
    }

    // Close all positions
    console.log('\nClosing all positions...');
    symbols.forEach(symbol => trader.closePosition(symbol));

    const finalPortfolio = trader.getPortfolio();
    expect(trader.getPositions().length).toBe(0);
    console.log(`Final Portfolio Value: $${finalPortfolio.totalValue.toFixed(2)}`);
    console.log(`Total Realized PnL: $${finalPortfolio.realizedPnL.toFixed(2)}`);

    console.log('=== Demo 2 Complete ===\n');
  });

  test('Demo 3: Risk Management Protections', async () => {
    console.log('=== HACKATHON DEMO: Risk Management ===');

    trader.updatePrice('BTCUSDT', 45000);

    // Open position with tight risk controls
    console.log('Opening BTC position with stop loss and take profit...');
    trader.placeOrder({
      symbol: 'BTCUSDT',
      side: TradeAction.BUY,
      type: OrderType.MARKET,
      quantity: 0.5,
      stopLoss: 44000,    // 2.2% stop loss
      takeProfit: 46500   // 3.3% take profit
    });

    console.log('Stop Loss: $44,000 | Take Profit: $46,500');
    expect(trader.getPositions().length).toBe(1);

    // Test stop loss protection
    console.log('\nScenario 1: Price hits stop loss...');
    const riskTrader = new DemoTrader(100000);
    riskTrader.updatePrice('BTCUSDT', 45000);

    riskTrader.placeOrder({
      symbol: 'BTCUSDT',
      side: TradeAction.BUY,
      type: OrderType.MARKET,
      quantity: 0.5,
      stopLoss: 44000
    });

    const beforeSL = riskTrader.getPortfolio();
    console.log(`Portfolio before stop loss: $${beforeSL.totalValue.toFixed(2)}`);

    riskTrader.updatePrice('BTCUSDT', 43500); // Drops past stop loss
    expect(riskTrader.getPositions().length).toBe(0); // Auto-closed

    const afterSL = riskTrader.getPortfolio();
    console.log(`Portfolio after stop loss: $${afterSL.totalValue.toFixed(2)}`);
    console.log(`Loss limited to: $${Math.abs(afterSL.realizedPnL).toFixed(2)}`);

    // Test take profit protection
    console.log('\nScenario 2: Price hits take profit...');
    const profitTrader = new DemoTrader(100000);
    profitTrader.updatePrice('BTCUSDT', 45000);

    profitTrader.placeOrder({
      symbol: 'BTCUSDT',
      side: TradeAction.BUY,
      type: OrderType.MARKET,
      quantity: 0.5,
      takeProfit: 46500
    });

    profitTrader.updatePrice('BTCUSDT', 47000); // Rises past take profit
    expect(profitTrader.getPositions().length).toBe(0); // Auto-closed

    const afterTP = profitTrader.getPortfolio();
    console.log(`Profit captured: $${afterTP.realizedPnL.toFixed(2)}`);

    // Test leverage risk
    console.log('\nScenario 3: Leverage amplification...');
    const leverageTrader = new DemoTrader(100000);
    leverageTrader.updatePrice('ETHUSDT', 2500);

    leverageTrader.placeOrder({
      symbol: 'ETHUSDT',
      side: TradeAction.BUY,
      type: OrderType.MARKET,
      quantity: 10,
      leverage: 5
    });

    leverageTrader.updatePrice('ETHUSDT', 2550); // 2% rise
    const levPositions = leverageTrader.getPositions();
    if (levPositions.length > 0) {
      // With 5x leverage, 2% price move = ~10% position return
      console.log(`2% price rise with 5x leverage: $${levPositions[0].unrealizedPnL.toFixed(2)} PnL`);
    }

    console.log('=== Demo 3 Complete ===\n');
  });

  test('Demo 4: Performance Analytics Generation', async () => {
    console.log('=== HACKATHON DEMO: Performance Analytics ===');

    // Execute a series of trades
    trader.updatePrice('BTCUSDT', 45000);
    trader.updatePrice('ETHUSDT', 2500);
    trader.updatePrice('SOLUSDT', 100);

    // Trade 1: BTC profit
    trader.placeOrder({ symbol: 'BTCUSDT', side: TradeAction.BUY, type: OrderType.MARKET, quantity: 0.2 });
    trader.updatePrice('BTCUSDT', 46000);
    trader.closePosition('BTCUSDT');

    // Trade 2: ETH loss
    trader.placeOrder({ symbol: 'ETHUSDT', side: TradeAction.BUY, type: OrderType.MARKET, quantity: 5 });
    trader.updatePrice('ETHUSDT', 2400);
    trader.closePosition('ETHUSDT');

    // Trade 3: SOL profit
    trader.placeOrder({ symbol: 'SOLUSDT', side: TradeAction.BUY, type: OrderType.MARKET, quantity: 100 });
    trader.updatePrice('SOLUSDT', 105);
    trader.closePosition('SOLUSDT');

    // Trade 4: BTC profit again
    trader.updatePrice('BTCUSDT', 45000);
    trader.placeOrder({ symbol: 'BTCUSDT', side: TradeAction.BUY, type: OrderType.MARKET, quantity: 0.3 });
    trader.updatePrice('BTCUSDT', 45500);
    trader.closePosition('BTCUSDT');

    // Get statistics
    const stats = trader.getStatistics();
    const portfolio = trader.getPortfolio();

    console.log('\n📊 Performance Summary:');
    console.log(`Total Trades: ${stats.totalTrades}`);
    console.log(`Win Rate: ${stats.winRate.toFixed(1)}%`);
    console.log(`Total PnL: $${stats.totalPnL.toFixed(2)}`);
    console.log(`Average PnL: $${stats.averagePnL.toFixed(2)}`);
    console.log(`Best Trade: $${stats.bestTrade.toFixed(2)}`);
    console.log(`Worst Trade: $${stats.worstTrade.toFixed(2)}`);
    console.log(`Profit Factor: ${stats.profitFactor.toFixed(2)}`);
    console.log(`Portfolio Value: $${portfolio.totalValue.toFixed(2)}`);
    console.log(`Realized PnL: $${portfolio.realizedPnL.toFixed(2)}`);

    expect(stats.totalTrades).toBeGreaterThan(0);
    expect(stats.winningTrades + stats.losingTrades).toBe(stats.totalTrades);

    console.log('=== Demo 4 Complete ===\n');
  });

  test('Demo 5: News-Based Trading Decisions', async () => {
    console.log('=== HACKATHON DEMO: News-Based Trading ===');

    const aggregator = new NewsAggregator();

    // Test sentiment analysis
    console.log('\n📰 Testing Sentiment Analysis:');

    const bullishText = 'Bitcoin surges past $50,000 as major institutions announce crypto adoption and partnership deals';
    const bearishText = 'Crypto market crashes amid regulatory ban concerns and exchange hack reports';
    const neutralText = 'The cryptocurrency market showed mixed signals today with moderate trading volume';

    const bullishSentiment = aggregator.analyzeSentiment(bullishText);
    const bearishSentiment = aggregator.analyzeSentiment(bearishText);
    const neutralSentiment = aggregator.analyzeSentiment(neutralText);

    console.log(`Bullish text sentiment: ${bullishSentiment.toFixed(3)} (${aggregator.getSentimentLabel(bullishSentiment)})`);
    console.log(`Bearish text sentiment: ${bearishSentiment.toFixed(3)} (${aggregator.getSentimentLabel(bearishSentiment)})`);
    console.log(`Neutral text sentiment: ${neutralSentiment.toFixed(3)} (${aggregator.getSentimentLabel(neutralSentiment)})`);

    expect(bullishSentiment).toBeGreaterThan(0);
    expect(bearishSentiment).toBeLessThan(0);
    expect(Math.abs(neutralSentiment)).toBeLessThan(Math.abs(bullishSentiment));

    // Test sentiment labels
    console.log('\n🏷️ Sentiment Labels:');
    expect(aggregator.getSentimentLabel(0.7)).toBe(SentimentLabel.VERY_BULLISH);
    expect(aggregator.getSentimentLabel(0.3)).toBe(SentimentLabel.BULLISH);
    expect(aggregator.getSentimentLabel(0.0)).toBe(SentimentLabel.NEUTRAL);
    expect(aggregator.getSentimentLabel(-0.3)).toBe(SentimentLabel.BEARISH);
    expect(aggregator.getSentimentLabel(-0.7)).toBe(SentimentLabel.VERY_BEARISH);

    console.log(`0.7 → VERY_BULLISH ✓`);
    console.log(`0.3 → BULLISH ✓`);
    console.log(`0.0 → NEUTRAL ✓`);
    console.log(`-0.3 → BEARISH ✓`);
    console.log(`-0.7 → VERY_BEARISH ✓`);

    // Generate signal incorporating news sentiment
    console.log('\n📈 Signal Generation with News Context:');
    const marketData = generateDemoMarketData('BTCUSDT', 200, 45000);
    const newsArticles = [
      {
        id: 'news-1',
        title: 'Bitcoin adoption surges as Wall Street firms embrace crypto',
        source: 'TestNews',
        sentiment: bullishSentiment,
        importance: 0.8,
        fetchedAt: new Date(),
        processed: true
      },
      {
        id: 'news-2',
        title: 'Major partnership announced for Bitcoin Lightning Network',
        source: 'CryptoDaily',
        sentiment: 0.6,
        importance: 0.7,
        fetchedAt: new Date(),
        processed: true
      }
    ];

    const result = await engine.generateSignal({
      symbol: 'BTCUSDT',
      timeframe: TimeFrame.ONE_HOUR,
      marketData,
      newsArticles
    });

    console.log(`Signal Action: ${result.signal.action}`);
    console.log(`Confidence: ${(result.signal.confidence * 100).toFixed(1)}%`);
    console.log(`Sentiment Score: ${result.signal.sentimentScore?.toFixed(3)}`);
    console.log(`Technical Score: ${result.signal.technicalScore?.toFixed(2)}`);
    console.log(`Key Factors: ${result.analysis.keyFactors.join(', ')}`);

    expect(result.signal.sentimentScore).toBeDefined();

    console.log('=== Demo 5 Complete ===\n');
  });

  test('Demo 6: Full System Integration Test', async () => {
    console.log('=== HACKATHON DEMO: Full System Integration ===\n');

    // 1. Initialize $100k demo account
    console.log('1️⃣  Initializing demo account with $100,000...');
    expect(trader.getPortfolio().totalValue).toBe(100000);

    // 2. Set up market
    console.log('2️⃣  Setting up market prices...');
    trader.updatePrice('BTCUSDT', 45000);
    trader.updatePrice('ETHUSDT', 2500);

    // 3. Generate AI signal
    console.log('3️⃣  Generating AI trading signal...');
    const marketData = generateDemoMarketData('BTCUSDT', 200, 45000);
    const signalResult = await engine.generateSignal({
      symbol: 'BTCUSDT',
      timeframe: TimeFrame.ONE_HOUR,
      marketData,
      newsArticles: []
    });
    console.log(`   → Signal: ${signalResult.signal.action} (confidence: ${(signalResult.signal.confidence * 100).toFixed(1)}%)`);

    // 4. Execute with risk management
    console.log('4️⃣  Executing trade with risk management...');
    if (signalResult.signal.action !== TradeAction.HOLD) {
      const signal = {
        id: 'integration-signal',
        ...signalResult.signal,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const order = await trader.executeSignal(signal);
      if (order) {
        console.log(`   → Order filled: ${order.side} ${order.quantity} @ $${order.price.toFixed(2)}`);
      }
    }

    // 5. Open additional position manually
    console.log('5️⃣  Opening additional ETH position...');
    trader.placeOrder({
      symbol: 'ETHUSDT',
      side: TradeAction.BUY,
      type: OrderType.MARKET,
      quantity: 5,
      stopLoss: 2400,
      takeProfit: 2700
    });

    // 6. Simulate market movement
    console.log('6️⃣  Simulating market movement...');
    trader.updatePrice('BTCUSDT', 46500);
    trader.updatePrice('ETHUSDT', 2600);

    const portfolio = trader.getPortfolio();
    console.log(`   → Portfolio Value: $${portfolio.totalValue.toFixed(2)}`);
    console.log(`   → Unrealized PnL: $${portfolio.unrealizedPnL.toFixed(2)}`);

    // 7. Close all positions
    console.log('7️⃣  Closing all positions...');
    trader.closePosition('BTCUSDT');
    trader.closePosition('ETHUSDT');

    // 8. Generate performance report
    console.log('8️⃣  Performance Report:');
    const stats = trader.getStatistics();
    const finalPortfolio = trader.getPortfolio();

    console.log(`   → Final Portfolio Value: $${finalPortfolio.totalValue.toFixed(2)}`);
    console.log(`   → Realized PnL: $${finalPortfolio.realizedPnL.toFixed(2)}`);
    console.log(`   → Total Trades: ${stats.totalTrades}`);
    console.log(`   → Win Rate: ${stats.winRate.toFixed(1)}%`);
    console.log(`   → Profit Factor: ${stats.profitFactor.toFixed(2)}`);

    // Validate all demo components worked
    expect(finalPortfolio.totalValue).toBeDefined();
    expect(stats.totalTrades).toBeGreaterThan(0);

    console.log('\n✅ Full System Integration Test PASSED');
    console.log('=== Demo 6 Complete ===\n');
  });
});
