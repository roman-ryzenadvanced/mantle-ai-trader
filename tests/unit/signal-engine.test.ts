/**
 * Unit Tests for Signal Engine
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { SignalEngine } from '../../src/lib/trading/signals/signal-engine';
import { TimeFrame, TradeAction, MarketDataPoint } from '../../src/lib/trading/core/types';

describe('SignalEngine', () => {
  let signalEngine: SignalEngine;

  beforeEach(() => {
    signalEngine = new SignalEngine();
  });

  describe('generateSignal', () => {
    test('should generate a signal with required fields', async () => {
      const marketData = generateTestMarketData('BTCUSDT', 100);
      
      const result = await signalEngine.generateSignal({
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

    test('should include technical analysis', async () => {
      const marketData = generateTestMarketData('ETHUSDT', 200);
      
      const result = await signalEngine.generateSignal({
        symbol: 'ETHUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.analysis.technicalAnalysis).toBeDefined();
      expect(result.analysis.technicalAnalysis.trend).toBeDefined();
      expect(['BULLISH', 'BEARISH', 'SIDEWAYS']).toContain(result.analysis.technicalAnalysis.trend);
      expect(result.analysis.technicalAnalysis.indicators).toBeDefined();
    });

    test('should include risk assessment', async () => {
      const marketData = generateTestMarketData('SOLUSDT', 150);
      
      const result = await signalEngine.generateSignal({
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
      
      const result = await signalEngine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result).toBeDefined();
      expect(result.analysis.technicalAnalysis.score).toBe(0.5); // Default for insufficient data
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
