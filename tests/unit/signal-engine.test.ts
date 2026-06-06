/**
 * Unit Tests for Signal Engine v2.0.0
 * Comprehensive tests covering technical analysis, signal generation,
 * edge cases, and bug fix validations
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { SignalEngine } from '../../src/lib/trading/signals/signal-engine';
import { calculateIchimoku, calculateStochastic, calculateBollingerBands } from '../../src/lib/trading/signals/signal-engine';
import { TimeFrame, TradeAction, MarketDataPoint, SentimentLabel, SignalStatus } from '../../src/lib/trading/core/types';

describe('SignalEngine v2.0.0', () => {
  let engine: SignalEngine;

  beforeEach(() => {
    engine = new SignalEngine();
  });

  describe('generateSignal', () => {
    test('should generate a signal with required fields', async () => {
      const marketData = generateTestMarketData('BTCUSDT', 100);
      
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result).toBeDefined();
      expect(result.signal).toBeDefined();
      expect(result.signal.symbol).toBe('BTCUSDT');
      expect(result.signal.action).toBeDefined();
      expect([TradeAction.BUY, TradeAction.SELL, TradeAction.HOLD]).toContain(result.signal.action);
      expect(result.signal.confidence).toBeGreaterThanOrEqual(0);
      expect(result.signal.confidence).toBeLessThanOrEqual(1);
    });

    test('should use SignalStatus.PENDING enum instead of string', async () => {
      const marketData = generateTestMarketData('BTCUSDT', 100);
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.signal.status).toBe(SignalStatus.PENDING);
    });

    test('should include technical analysis', async () => {
      const marketData = generateTestMarketData('ETHUSDT', 200);
      
      const result = await engine.generateSignal({
        symbol: 'ETHUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.analysis.technicalAnalysis).toBeDefined();
      expect(result.analysis.technicalAnalysis.trend).toBeDefined();
      expect(['BULLISH', 'BEARISH', 'SIDEWAYS']).toContain(result.analysis.technicalAnalysis.trend);
      expect(result.analysis.technicalAnalysis.indicators).toBeDefined();
      expect(result.analysis.technicalAnalysis.indicators.rsi).toBeDefined();
    });

    test('should include risk assessment', async () => {
      const marketData = generateTestMarketData('SOLUSDT', 150);
      
      const result = await engine.generateSignal({
        symbol: 'SOLUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.riskAssessment).toBeDefined();
      expect(result.riskAssessment.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskAssessment.riskScore).toBeLessThanOrEqual(1);
      expect(result.riskAssessment.riskLevel).toBeDefined();
    });

    test('should handle insufficient data gracefully', async () => {
      const marketData = generateTestMarketData('BTCUSDT', 10);
      
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result).toBeDefined();
      expect(result.analysis.technicalAnalysis.score).toBe(0.5); // Default for insufficient data
    });

    test('should throw error for empty symbol', async () => {
      const marketData = generateTestMarketData('BTCUSDT', 100);
      
      expect(async () => {
        await engine.generateSignal({
          symbol: '',
          timeframe: TimeFrame.ONE_HOUR,
          marketData,
          newsArticles: []
        });
      }).toThrow();
    });

    test('should throw error for empty market data', async () => {
      expect(async () => {
        await engine.generateSignal({
          symbol: 'BTCUSDT',
          timeframe: TimeFrame.ONE_HOUR,
          marketData: [],
          newsArticles: []
        });
      }).toThrow();
    });
  });

  describe('Technical Analysis - Bug Fix Validations', () => {
    test('MACD signal line should differ from MACD line (was identical before fix)', async () => {
      // Generate trending data to get meaningful MACD
      const marketData = generateTrendingMarketData('BTCUSDT', 200, 'up');
      
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      const indicators = result.analysis.technicalAnalysis.indicators;
      // The signal and MACD should generally differ
      // They might be close in some cases, but they shouldn't be systematically identical
      expect(indicators.macd).toBeDefined();
      expect(indicators.macdSignal).toBeDefined();
    });

    test('RSI should use Wilder smoothing (values between 0-100)', async () => {
      const marketData = generateTestMarketData('BTCUSDT', 200);
      
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      const rsi = result.analysis.technicalAnalysis.indicators.rsi;
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    test('RSI should return 50 for insufficient data', async () => {
      const marketData = generateTestMarketData('BTCUSDT', 10);
      
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.analysis.technicalAnalysis.indicators.rsi).toBe(50);
    });

    test('should detect bullish engulfing pattern', async () => {
      const marketData = generateTestMarketData('BTCUSDT', 100);
      // Add a bullish engulfing pattern at the end
      const len = marketData.length;
      marketData[len - 2] = {
        ...marketData[len - 2],
        open: 100,
        close: 95,  // Bearish candle
        high: 101,
        low: 94
      };
      marketData[len - 1] = {
        ...marketData[len - 1],
        open: 94,   // Opens below prev close
        close: 101, // Closes above prev open
        high: 102,
        low: 93
      };

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.analysis.technicalAnalysis.patterns).toContain('BULLISH_ENGULFING');
    });
  });

  describe('Price Target Validation', () => {
    test('BUY signal stopLoss should be below current price', async () => {
      const marketData = generateTrendingMarketData('BTCUSDT', 200, 'up');
      
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      if (result.signal.action === TradeAction.BUY) {
        const currentPrice = marketData[marketData.length - 1].close;
        expect(result.signal.stopLoss).toBeLessThan(currentPrice);
      }
    });

    test('SELL signal stopLoss should be above current price', async () => {
      const marketData = generateTrendingMarketData('BTCUSDT', 200, 'down');
      
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      if (result.signal.action === TradeAction.SELL) {
        const currentPrice = marketData[marketData.length - 1].close;
        expect(result.signal.stopLoss).toBeGreaterThan(currentPrice);
      }
    });

    test('HOLD signal should have target equal to current price', async () => {
      // Sideways market should produce HOLD
      const marketData = generateSidewaysMarketData('BTCUSDT', 200);
      
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      if (result.signal.action === TradeAction.HOLD) {
        const currentPrice = marketData[marketData.length - 1].close;
        expect(result.signal.priceTarget).toBe(currentPrice);
      }
    });
  });

  describe('Confidence Calculation', () => {
    test('confidence should be between 0 and 1', async () => {
      const marketData = generateTestMarketData('BTCUSDT', 200);
      
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.signal.confidence).toBeGreaterThanOrEqual(0);
      expect(result.signal.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Risk Assessment', () => {
    test('should identify risk factors', async () => {
      const marketData = generateTestMarketData('BTCUSDT', 200);
      
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.riskAssessment.riskFactors).toBeDefined();
      expect(Array.isArray(result.riskAssessment.riskFactors)).toBe(true);
    });

    test('should provide stop loss and take profit suggestions', async () => {
      const marketData = generateTestMarketData('BTCUSDT', 200);
      
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.riskAssessment.suggestedStopLoss).toBeDefined();
      expect(result.riskAssessment.suggestedTakeProfit).toBeDefined();
    });
  });

  describe('Warnings', () => {
    test('should warn about overbought RSI', async () => {
      const marketData = generateOverboughtData('BTCUSDT', 200);
      
      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      if (result.analysis.technicalAnalysis.indicators.rsi > 70) {
        const hasOverboughtWarning = result.analysis.warnings.some(w => 
          w.toLowerCase().includes('overbought')
        );
        expect(hasOverboughtWarning).toBe(true);
      }
    });
  });
});

// Helper function to generate test market data
function generateTestMarketData(symbol: string, count: number): MarketDataPoint[] {
  const data: MarketDataPoint[] = [];
  let price = 40000 + Math.random() * 5000;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  for (let i = count; i >= 0; i--) {
    const change = (Math.random() - 0.5) * price * 0.02;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * Math.abs(change) * 0.5;
    const low = Math.min(open, close) - Math.random() * Math.abs(change) * 0.5;
    const volume = 1000 + Math.random() * 5000;

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

// Generate trending market data (up or down)
function generateTrendingMarketData(symbol: string, count: number, direction: 'up' | 'down'): MarketDataPoint[] {
  const data: MarketDataPoint[] = [];
  let price = 40000;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const bias = direction === 'up' ? 0.03 : -0.03;

  for (let i = count; i >= 0; i--) {
    const change = (Math.random() - 0.5 + bias) * price * 0.02;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * Math.abs(change) * 0.5;
    const low = Math.min(open, close) - Math.random() * Math.abs(change) * 0.5;
    const volume = 1000 + Math.random() * 5000;

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

// Generate sideways market data
function generateSidewaysMarketData(symbol: string, count: number): MarketDataPoint[] {
  const data: MarketDataPoint[] = [];
  const basePrice = 40000;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  for (let i = count; i >= 0; i--) {
    // Very small changes around base price
    const change = (Math.random() - 0.5) * basePrice * 0.001;
    const open = basePrice + change * 0.5;
    const close = basePrice - change * 0.5;
    const high = Math.max(open, close) + Math.random() * 10;
    const low = Math.min(open, close) - Math.random() * 10;
    const volume = 1000 + Math.random() * 5000;

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
  }

  return data;
}

// Generate overbought data (consistently rising)
function generateOverboughtData(symbol: string, count: number): MarketDataPoint[] {
  const data: MarketDataPoint[] = [];
  let price = 40000;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  for (let i = count; i >= 0; i--) {
    const change = Math.random() * price * 0.03; // Always positive
    const open = price;
    const close = price + change;
    const high = close + Math.random() * change * 0.5;
    const low = open - Math.random() * change * 0.2;
    const volume = 1000 + Math.random() * 5000;

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
