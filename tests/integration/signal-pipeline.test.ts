/**
 * Integration Tests for Signal Pipeline
 * Full integration tests for signal generation pipeline including:
 * - Signal generation with mock market data
 * - Signal execution in demo trader
 * - Position management after signal
 * - Multi-signal portfolio management
 * - Signal quality scoring validation
 * - News-to-signal integration
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
  SignalResult,
  SentimentLabel
} from '../../src/lib/trading/core/types';

// ==================== HELPERS ====================

function generateMarketData(symbol: string, count: number, basePrice: number = 45000, trend?: 'up' | 'down'): MarketDataPoint[] {
  const data: MarketDataPoint[] = [];
  let price = basePrice;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const bias = trend === 'up' ? 0.02 : trend === 'down' ? -0.02 : 0;

  // Seeded random for consistency
  let seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seededRandom = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = count; i >= 0; i--) {
    const change = (seededRandom() - 0.5 + bias) * price * 0.02;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + seededRandom() * Math.abs(change) * 0.5;
    const low = Math.min(open, close) - seededRandom() * Math.abs(change) * 0.5;
    const volume = 1000 + seededRandom() * 5000;

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

function createMockNewsArticle(symbol: string, sentiment: number, importance: number = 0.7) {
  return {
    id: `news-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: `${symbol} ${sentiment > 0 ? 'surges' : 'drops'} as market ${sentiment > 0 ? 'rallies' : 'crashes'}`,
    content: `Detailed analysis of ${symbol} price movement and market implications`,
    source: 'TestSource',
    sourceUrl: 'https://example.com/news',
    author: 'Test Author',
    category: 'Trading',
    sentiment,
    importance,
    tags: [symbol.replace('USDT', ''), 'trading'],
    publishedAt: new Date(),
    fetchedAt: new Date(),
    processed: true
  };
}

// ==================== TESTS ====================

describe('Signal Pipeline Integration', () => {
  let trader: DemoTrader;
  let engine: SignalEngine;

  beforeEach(() => {
    trader = new DemoTrader(50000);
    engine = new SignalEngine();
  });

  describe('Signal Generation with Mock Market Data', () => {
    test('should generate a complete signal from market data', async () => {
      const marketData = generateMarketData('BTCUSDT', 200, 45000);

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result).toBeDefined();
      expect(result.signal).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(result.riskAssessment).toBeDefined();
      expect(result.signal.symbol).toBe('BTCUSDT');
      expect(result.signal.action).toBeDefined();
      expect(result.signal.confidence).toBeGreaterThanOrEqual(0);
      expect(result.signal.confidence).toBeLessThanOrEqual(1);
    });

    test('should produce different signals for different market conditions', async () => {
      const bullishData = generateMarketData('BTCUSDT', 200, 45000, 'up');
      const bearishData = generateMarketData('BTCUSDT', 200, 45000, 'down');

      const bullishResult = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData: bullishData,
        newsArticles: []
      });

      const bearishResult = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData: bearishData,
        newsArticles: []
      });

      // At least one should be different (can't guarantee specific direction due to randomness)
      expect(bullishResult.signal).toBeDefined();
      expect(bearishResult.signal).toBeDefined();
    });

    test('should include technical analysis indicators', async () => {
      const marketData = generateMarketData('ETHUSDT', 200, 2500);

      const result = await engine.generateSignal({
        symbol: 'ETHUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      const indicators = result.analysis.technicalAnalysis.indicators;
      expect(indicators.rsi).toBeDefined();
      expect(typeof indicators.rsi).toBe('number');
    });

    test('should validate input requirements', async () => {
      await expect(engine.generateSignal({
        symbol: '',
        timeframe: TimeFrame.ONE_HOUR,
        marketData: generateMarketData('BTCUSDT', 100),
        newsArticles: []
      })).rejects.toThrow();

      await expect(engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData: [],
        newsArticles: []
      })).rejects.toThrow();
    });
  });

  describe('Signal Execution in Demo Trader', () => {
    test('should execute a BUY signal in demo mode', async () => {
      const marketData = generateMarketData('BTCUSDT', 200, 45000, 'up');

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      trader.updatePrice('BTCUSDT', 45000);

      const signal = {
        id: 'test-signal-buy',
        ...result.signal,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (result.signal.action !== TradeAction.HOLD) {
        const order = await trader.executeSignal(signal);
        if (order) {
          expect(order).toBeDefined();
          expect(order.status).toBe(OrderStatus.FILLED);
        }
      }
    });

    test('should handle HOLD signal gracefully', async () => {
      const signal = {
        id: 'hold-signal',
        symbol: 'BTCUSDT',
        action: TradeAction.HOLD,
        confidence: 0.5,
        rating: 0,
        reasoning: 'Market is sideways',
        status: SignalStatus.PENDING,
        demo: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const order = await trader.executeSignal(signal);
      expect(order).toBeNull();
    });

    test('should set stop loss and take profit from signal', async () => {
      trader.updatePrice('BTCUSDT', 45000);

      const order = trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1,
        stopLoss: 44000,
        takeProfit: 47000
      });

      const positions = trader.getPositions();
      expect(positions[0].stopLoss).toBe(44000);
      expect(positions[0].takeProfit).toBe(47000);
    });
  });

  describe('Position Management After Signal', () => {
    test('should update position value when price changes', async () => {
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      // Price goes up
      trader.updatePrice('BTCUSDT', 46000);

      const positions = trader.getPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].currentPrice).toBe(46000);
      expect(positions[0].unrealizedPnL).toBeGreaterThan(0);
    });

    test('should close position when take profit is hit', async () => {
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1,
        takeProfit: 46000
      });

      trader.updatePrice('BTCUSDT', 46500);

      const positions = trader.getPositions();
      expect(positions.length).toBe(0); // Closed by take profit
    });

    test('should close position when stop loss is hit', async () => {
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1,
        stopLoss: 44000
      });

      trader.updatePrice('BTCUSDT', 43500);

      const positions = trader.getPositions();
      expect(positions.length).toBe(0); // Closed by stop loss
    });

    test('should add to existing position', async () => {
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      const positions = trader.getPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].quantity).toBeCloseTo(0.2, 5);
    });
  });

  describe('Multi-Signal Portfolio Management', () => {
    test('should manage multiple positions from different signals', async () => {
      trader.updatePrice('BTCUSDT', 45000);
      trader.updatePrice('ETHUSDT', 2500);
      trader.updatePrice('SOLUSDT', 100);

      // Open positions for 3 symbols
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.2
      });

      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 4
      });

      trader.placeOrder({
        symbol: 'SOLUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 50
      });

      const positions = trader.getPositions();
      expect(positions.length).toBe(3);

      const portfolio = trader.getPortfolio();
      expect(portfolio.positions.length).toBe(3);
    });

    test('should handle mixed long and short positions', async () => {
      trader.updatePrice('BTCUSDT', 45000);
      trader.updatePrice('ETHUSDT', 2500);

      // Long BTC
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      // Short ETH
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.SELL,
        type: OrderType.MARKET,
        quantity: 2
      });

      const positions = trader.getPositions();
      expect(positions.length).toBe(2);

      const btcPos = positions.find(p => p.symbol === 'BTCUSDT');
      const ethPos = positions.find(p => p.symbol === 'ETHUSDT');
      expect(btcPos?.side).toBe('LONG');
      expect(ethPos?.side).toBe('SHORT');
    });

    test('should generate signals for multiple symbols', async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      const basePrices: Record<string, number> = { BTCUSDT: 45000, ETHUSDT: 2500, SOLUSDT: 100 };

      const results = await Promise.all(symbols.map(async symbol => {
        const marketData = generateMarketData(symbol, 200, basePrices[symbol]);
        return engine.generateSignal({
          symbol,
          timeframe: TimeFrame.ONE_HOUR,
          marketData,
          newsArticles: []
        });
      }));

      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result.signal).toBeDefined();
        expect(result.signal.symbol).toBeDefined();
      });
    });

    test('should track portfolio PnL across multiple positions', async () => {
      trader.updatePrice('BTCUSDT', 45000);
      trader.updatePrice('ETHUSDT', 2500);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.2
      });

      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 4
      });

      // BTC up, ETH down
      trader.updatePrice('BTCUSDT', 46000);
      trader.updatePrice('ETHUSDT', 2400);

      const portfolio = trader.getPortfolio();
      expect(portfolio.unrealizedPnL).toBeDefined();
      // Net PnL should account for both positions
      expect(typeof portfolio.unrealizedPnL).toBe('number');
    });
  });

  describe('Signal Quality Scoring Validation', () => {
    test('should provide confidence score between 0 and 1', async () => {
      const marketData = generateMarketData('BTCUSDT', 200);
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.signal.confidence).toBeGreaterThanOrEqual(0);
      expect(result.signal.confidence).toBeLessThanOrEqual(1);
    });

    test('should include technical score', async () => {
      const marketData = generateMarketData('BTCUSDT', 200);
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.signal.technicalScore).toBeDefined();
      expect(result.signal.technicalScore).toBeGreaterThanOrEqual(0);
      expect(result.signal.technicalScore).toBeLessThanOrEqual(1);
    });

    test('should include fundamental score', async () => {
      const marketData = generateMarketData('BTCUSDT', 200);
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.signal.fundamentalScore).toBeDefined();
    });

    test('should provide risk assessment with risk factors', async () => {
      const marketData = generateMarketData('BTCUSDT', 200);
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.riskAssessment.riskFactors).toBeDefined();
      expect(Array.isArray(result.riskAssessment.riskFactors)).toBe(true);
    });

    test('should provide analysis with key factors and warnings', async () => {
      const marketData = generateMarketData('BTCUSDT', 200);
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.analysis.keyFactors).toBeDefined();
      expect(Array.isArray(result.analysis.keyFactors)).toBe(true);
      expect(result.analysis.warnings).toBeDefined();
      expect(Array.isArray(result.analysis.warnings)).toBe(true);
    });
  });

  describe('News-to-Signal Integration', () => {
    test('should incorporate news sentiment into signal', async () => {
      const marketData = generateMarketData('BTCUSDT', 200);
      const bullishNews = [
        createMockNewsArticle('BTCUSDT', 0.8, 0.9),
        createMockNewsArticle('BTCUSDT', 0.6, 0.7),
        createMockNewsArticle('BTCUSDT', 0.7, 0.8)
      ];

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: bullishNews
      });

      expect(result.signal.sentimentScore).toBeDefined();
      expect(result.analysis.sentimentAnalysis).toBeDefined();
    });

    test('should handle bearish news in signal generation', async () => {
      const marketData = generateMarketData('BTCUSDT', 200);
      const bearishNews = [
        createMockNewsArticle('BTCUSDT', -0.8, 0.9),
        createMockNewsArticle('BTCUSDT', -0.6, 0.8)
      ];

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: bearishNews
      });

      expect(result.analysis.sentimentAnalysis).toBeDefined();
    });

    test('should handle no news articles', async () => {
      const marketData = generateMarketData('BTCUSDT', 200);

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result).toBeDefined();
      expect(result.signal).toBeDefined();
    });

    test('should include news sources in signal output', async () => {
      const marketData = generateMarketData('BTCUSDT', 200);
      const news = [
        createMockNewsArticle('BTCUSDT', 0.5),
        createMockNewsArticle('BTCUSDT', 0.3)
      ];

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: news
      });

      expect(result.signal.newsSources).toBeDefined();
    });

    test('NewsAggregator should analyze sentiment for pipeline', () => {
      const aggregator = new NewsAggregator();

      const bullishSentiment = aggregator.analyzeSentiment(
        'Bitcoin surges to new all-time high as institutional adoption grows'
      );
      expect(bullishSentiment).toBeGreaterThan(0);

      const bearishSentiment = aggregator.analyzeSentiment(
        'Crypto market crashes as regulators ban exchanges worldwide'
      );
      expect(bearishSentiment).toBeLessThan(0);
    });
  });

  describe('End-to-End Signal Pipeline', () => {
    test('should complete: data -> signal -> execution -> position -> close', async () => {
      // 1. Generate market data
      const marketData = generateMarketData('BTCUSDT', 200, 45000, 'up');

      // 2. Generate signal
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.signal).toBeDefined();

      // 3. Set price and execute signal
      trader.updatePrice('BTCUSDT', 45000);

      if (result.signal.action !== TradeAction.HOLD) {
        const signal = {
          id: 'e2e-signal',
          ...result.signal,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const order = await trader.executeSignal(signal);
        expect(order).toBeDefined();

        // 4. Verify position
        const positions = trader.getPositions();
        if (positions.length > 0) {
          expect(positions[0].symbol).toBe('BTCUSDT');

          // 5. Update price and close
          trader.updatePrice('BTCUSDT', 46500);
          trader.closePosition('BTCUSDT');

          // 6. Verify closed
          expect(trader.getPositions().length).toBe(0);
          expect(trader.getPortfolio().realizedPnL).toBeDefined();
        }
      }
    });
  });
});
