/**
 * Stress Tests for Concurrent Operations
 * Tests for rapid price updates, multiple simultaneous order placements,
 * concurrent backtest runs, and race condition testing for stop-loss triggers
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DemoTrader } from '../../src/lib/trading/demo/demo-trader';
import { SignalEngine } from '../../src/lib/trading/signals/signal-engine';
import {
  TradeAction,
  OrderType,
  OrderStatus,
  TimeFrame,
  MarketDataPoint
} from '../../src/lib/trading/core/types';

// ==================== HELPERS ====================

function generateMarketData(symbol: string, count: number, basePrice: number = 45000): MarketDataPoint[] {
  const data: MarketDataPoint[] = [];
  let price = basePrice;
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

// ==================== TESTS ====================

describe('Stress Tests: Concurrent Operations', () => {

  describe('Rapid Price Updates', () => {
    test('should handle 1000 rapid price updates without errors', () => {
      const trader = new DemoTrader(100000);
      trader.updatePrice('BTCUSDT', 45000);

      // Open a position
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5
      });

      // Simulate 1000 rapid price updates
      let price = 45000;
      for (let i = 0; i < 1000; i++) {
        price += (Math.random() - 0.5) * 10;
        price = Math.max(price, 100); // Floor at 100
        trader.updatePrice('BTCUSDT', price);
      }

      const positions = trader.getPositions();
      expect(positions.length).toBeLessThanOrEqual(1); // May be closed by SL/TP

      const portfolio = trader.getPortfolio();
      expect(portfolio.totalValue).toBeGreaterThanOrEqual(0);
      expect(isFinite(portfolio.totalValue)).toBe(true);
    });

    test('should handle price updates for multiple symbols simultaneously', () => {
      const trader = new DemoTrader(500000);
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
      const prices: Record<string, number> = {
        BTCUSDT: 45000,
        ETHUSDT: 2500,
        SOLUSDT: 100,
        BNBUSDT: 300,
        XRPUSDT: 0.5
      };

      // Set initial prices and open positions
      symbols.forEach(symbol => {
        trader.updatePrice(symbol, prices[symbol]);
        trader.placeOrder({
          symbol,
          side: TradeAction.BUY,
          type: OrderType.MARKET,
          quantity: prices[symbol] > 1000 ? 0.1 : prices[symbol] > 50 ? 5 : 1000
        });
      });

      // Rapid updates for all symbols
      for (let i = 0; i < 100; i++) {
        symbols.forEach(symbol => {
          prices[symbol] += (Math.random() - 0.5) * prices[symbol] * 0.01;
          prices[symbol] = Math.max(prices[symbol], 0.01);
          trader.updatePrice(symbol, prices[symbol]);
        });
      }

      const portfolio = trader.getPortfolio();
      expect(portfolio.totalValue).toBeGreaterThanOrEqual(0);
      expect(isFinite(portfolio.totalValue)).toBe(true);
    });

    test('should not crash on extreme price movements', () => {
      const trader = new DemoTrader(100000);
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5
      });

      // Extreme price movements
      const extremePrices = [100000, 1, 999999, 0.01, 50000, 0.001, 45000];
      extremePrices.forEach(price => {
        trader.updatePrice('BTCUSDT', price);
      });

      const portfolio = trader.getPortfolio();
      expect(portfolio.totalValue).toBeGreaterThanOrEqual(0);
      expect(isFinite(portfolio.totalValue)).toBe(true);
      expect(isNaN(portfolio.totalValue)).toBe(false);
    });
  });

  describe('Multiple Simultaneous Order Placements', () => {
    test('should handle sequential rapid order placements', () => {
      const trader = new DemoTrader(1000000);
      trader.updatePrice('BTCUSDT', 45000);
      trader.updatePrice('ETHUSDT', 2500);
      trader.updatePrice('SOLUSDT', 100);

      // Place multiple orders rapidly
      const orders = [];
      for (let i = 0; i < 20; i++) {
        const symbol = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'][i % 3];
        const side = i % 2 === 0 ? TradeAction.BUY : TradeAction.SELL;

        try {
          const order = trader.placeOrder({
            symbol,
            side,
            type: OrderType.MARKET,
            quantity: symbol === 'BTCUSDT' ? 0.01 : symbol === 'ETHUSDT' ? 0.1 : 1
          });
          orders.push(order);
        } catch {
          // Some orders may fail due to insufficient capital
        }
      }

      expect(orders.length).toBeGreaterThan(0);

      const portfolio = trader.getPortfolio();
      expect(portfolio.totalValue).toBeGreaterThanOrEqual(0);
    });

    test('should maintain correct position state after many operations', () => {
      const trader = new DemoTrader(500000);
      trader.updatePrice('BTCUSDT', 45000);

      // Open position
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5
      });

      // Add to position multiple times
      for (let i = 0; i < 10; i++) {
        try {
          trader.placeOrder({
            symbol: 'BTCUSDT',
            side: TradeAction.BUY,
            type: OrderType.MARKET,
            quantity: 0.1
          });
        } catch {
          break;
        }
      }

      const positions = trader.getPositions();
      if (positions.length > 0) {
        // All additions should be tracked
        expect(positions[0].quantity).toBeGreaterThan(0);
        expect(positions[0].side).toBe('LONG');
      }
    });

    test('should handle open and close cycles', () => {
      const trader = new DemoTrader(500000);
      trader.updatePrice('BTCUSDT', 45000);

      // Multiple open/close cycles
      for (let i = 0; i < 5; i++) {
        trader.placeOrder({
          symbol: 'BTCUSDT',
          side: TradeAction.BUY,
          type: OrderType.MARKET,
          quantity: 0.1
        });

        trader.updatePrice('BTCUSDT', 45000 + (i + 1) * 100);
        trader.closePosition('BTCUSDT');
      }

      const stats = trader.getStatistics();
      expect(stats.totalTrades).toBeGreaterThan(0);
      expect(isFinite(stats.totalPnL)).toBe(true);
    });
  });

  describe('Concurrent Signal Generation', () => {
    test('should handle multiple signal generations simultaneously', async () => {
      const engine = new SignalEngine();
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      const basePrices: Record<string, number> = { BTCUSDT: 45000, ETHUSDT: 2500, SOLUSDT: 100 };

      // Generate signals for multiple symbols concurrently
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
        expect(result.signal.action).toBeDefined();
        expect(result.signal.confidence).toBeGreaterThanOrEqual(0);
        expect(result.signal.confidence).toBeLessThanOrEqual(1);
      });
    });

    test('should produce consistent results for same input', async () => {
      const engine = new SignalEngine();

      // Use same market data for both calls
      const marketData = generateMarketData('BTCUSDT', 200, 45000);

      const result1 = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      const result2 = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      // Technical analysis should be deterministic for same data
      expect(result1.analysis.technicalAnalysis.indicators.rsi).toBe(
        result2.analysis.technicalAnalysis.indicators.rsi
      );
      expect(result1.analysis.technicalAnalysis.trend).toBe(
        result2.analysis.technicalAnalysis.trend
      );
    });
  });

  describe('Race Condition Testing for Stop-Loss Triggers', () => {
    test('should not double-trigger stop loss', () => {
      const trader = new DemoTrader(100000);
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5,
        stopLoss: 44000
      });

      // Verify position exists
      expect(trader.getPositions().length).toBe(1);

      // Trigger stop loss by dropping price
      trader.updatePrice('BTCUSDT', 43000);

      // Position should be closed
      expect(trader.getPositions().length).toBe(0);

      // Further price drops shouldn't cause errors
      trader.updatePrice('BTCUSDT', 42000);
      trader.updatePrice('BTCUSDT', 40000);

      // No positions should remain
      expect(trader.getPositions().length).toBe(0);

      const portfolio = trader.getPortfolio();
      expect(isFinite(portfolio.totalValue)).toBe(true);
    });

    test('should handle stop loss and take profit not both triggering', () => {
      const trader = new DemoTrader(100000);
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5,
        stopLoss: 44000,
        takeProfit: 46000
      });

      // Price hits take profit
      trader.updatePrice('BTCUSDT', 46500);

      // Position should be closed by TP
      expect(trader.getPositions().length).toBe(0);

      // If we set price below SL, nothing should happen (already closed)
      trader.updatePrice('BTCUSDT', 43000);

      const portfolio = trader.getPortfolio();
      expect(portfolio.realizedPnL).toBeGreaterThan(0); // Profit from TP
    });

    test('should handle rapid price swings near stop loss level', () => {
      const trader = new DemoTrader(100000);
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5,
        stopLoss: 44000
      });

      // Price oscillates near stop loss
      const nearStopPrices = [44500, 44200, 44050, 44300, 44100, 43900];
      nearStopPrices.forEach(price => {
        trader.updatePrice('BTCUSDT', price);
      });

      // Position should be closed after price dropped below stop loss
      const positions = trader.getPositions();
      expect(positions.length).toBe(0);

      const portfolio = trader.getPortfolio();
      expect(portfolio.realizedPnL).toBeLessThan(0); // Loss from SL
      expect(isFinite(portfolio.totalValue)).toBe(true);
    });

    test('should handle stop loss trigger for short position', () => {
      const trader = new DemoTrader(100000);
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.SELL,
        type: OrderType.MARKET,
        quantity: 0.5,
        stopLoss: 46000 // SL above entry for short
      });

      expect(trader.getPositions().length).toBe(1);

      // Price rises above stop loss
      trader.updatePrice('BTCUSDT', 46500);

      expect(trader.getPositions().length).toBe(0);

      const portfolio = trader.getPortfolio();
      expect(portfolio.realizedPnL).toBeLessThan(0);
    });

    test('should handle take profit trigger for short position', () => {
      const trader = new DemoTrader(100000);
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.SELL,
        type: OrderType.MARKET,
        quantity: 0.5,
        takeProfit: 44000 // TP below entry for short
      });

      // Price drops below take profit
      trader.updatePrice('BTCUSDT', 43500);

      expect(trader.getPositions().length).toBe(0);

      const portfolio = trader.getPortfolio();
      expect(portfolio.realizedPnL).toBeGreaterThan(0);
    });
  });

  describe('High Volume Operations', () => {
    test('should handle 100 sequential trades without degradation', () => {
      const trader = new DemoTrader(1000000);
      trader.updatePrice('BTCUSDT', 45000);

      for (let i = 0; i < 100; i++) {
        try {
          // Alternate buy/sell
          if (i % 2 === 0) {
            trader.placeOrder({
              symbol: 'BTCUSDT',
              side: TradeAction.BUY,
              type: OrderType.MARKET,
              quantity: 0.01
            });
          } else {
            // Try to close/reduce position
            const positions = trader.getPositions();
            if (positions.length > 0 && positions[0].quantity >= 0.01) {
              trader.placeOrder({
                symbol: 'BTCUSDT',
                side: TradeAction.SELL,
                type: OrderType.MARKET,
                quantity: 0.01
              });
            }
          }

          // Small price movement
          trader.updatePrice('BTCUSDT', 45000 + (Math.random() - 0.5) * 100);
        } catch {
          // Some orders may fail due to position constraints
        }
      }

      const portfolio = trader.getPortfolio();
      expect(isFinite(portfolio.totalValue)).toBe(true);
      expect(portfolio.totalValue).toBeGreaterThanOrEqual(0);

      const stats = trader.getStatistics();
      expect(stats.totalTrades).toBeGreaterThan(0);
    });

    test('should maintain numerical stability under many operations', () => {
      const trader = new DemoTrader(100000);
      trader.updatePrice('XRPUSDT', 0.5);

      // Many small trades with small prices
      for (let i = 0; i < 50; i++) {
        try {
          trader.placeOrder({
            symbol: 'XRPUSDT',
            side: TradeAction.BUY,
            type: OrderType.MARKET,
            quantity: 100
          });
          trader.updatePrice('XRPUSDT', 0.5 + Math.random() * 0.01);
        } catch {
          break;
        }
      }

      const portfolio = trader.getPortfolio();
      expect(isFinite(portfolio.totalValue)).toBe(true);
      expect(isNaN(portfolio.totalValue)).toBe(false);
      expect(isNaN(portfolio.cashBalance)).toBe(false);
      expect(isNaN(portfolio.unrealizedPnL)).toBe(false);
    });
  });
});
