/**
 * Unit Tests for Demo Trader
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DemoTrader } from '../../src/lib/trading/demo/demo-trader';
import { TradeAction, OrderType } from '../../src/lib/trading/core/types';

describe('DemoTrader', () => {
  let demoTrader: DemoTrader;

  beforeEach(() => {
    demoTrader = new DemoTrader(10000);
  });

  describe('initialization', () => {
    test('should initialize with correct portfolio', () => {
      const portfolio = demoTrader.getPortfolio();
      
      expect(portfolio.totalValue).toBe(10000);
      expect(portfolio.cashBalance).toBe(10000);
      expect(portfolio.realizedPnL).toBe(0);
      expect(portfolio.unrealizedPnL).toBe(0);
    });

    test('should have no positions initially', () => {
      const positions = demoTrader.getPositions();
      expect(positions.length).toBe(0);
    });
  });

  describe('placeOrder', () => {
    test('should place a market buy order', () => {
      // Set price first
      demoTrader.updatePrice('BTCUSDT', 45000);

      const order = demoTrader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      expect(order).toBeDefined();
      expect(order.status).toBe('FILLED');
      expect(order.symbol).toBe('BTCUSDT');
      expect(order.side).toBe(TradeAction.BUY);
    });

    test('should update cash balance after buy order', () => {
      demoTrader.updatePrice('ETHUSDT', 2500);
      
      demoTrader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 2
      });

      const portfolio = demoTrader.getPortfolio();
      expect(portfolio.cashBalance).toBe(10000 - (2500 * 2));
    });

    test('should create a position after buy order', () => {
      demoTrader.updatePrice('SOLUSDT', 100);
      
      demoTrader.placeOrder({
        symbol: 'SOLUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 10
      });

      const positions = demoTrader.getPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].symbol).toBe('SOLUSDT');
      expect(positions[0].side).toBe('LONG');
      expect(positions[0].quantity).toBe(10);
    });

    test('should throw error for insufficient capital', () => {
      demoTrader.updatePrice('BTCUSDT', 45000);
      
      expect(() => {
        demoTrader.placeOrder({
          symbol: 'BTCUSDT',
          side: TradeAction.BUY,
          type: OrderType.MARKET,
          quantity: 1 // Would cost 45000, but we only have 10000
        });
      }).toThrow('Insufficient capital');
    });
  });

  describe('closePosition', () => {
    test('should close an existing position', () => {
      demoTrader.updatePrice('BTCUSDT', 45000);
      
      demoTrader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      const closeOrder = demoTrader.closePosition('BTCUSDT');
      
      expect(closeOrder).toBeDefined();
      expect(closeOrder?.side).toBe(TradeAction.SELL);
      
      const positions = demoTrader.getPositions();
      expect(positions.length).toBe(0);
    });

    test('should return null when closing non-existent position', () => {
      const result = demoTrader.closePosition('NONEXISTENT');
      expect(result).toBeNull();
    });
  });

  describe('updatePrice', () => {
    test('should update position PnL when price changes', () => {
      demoTrader.updatePrice('ETHUSDT', 2500);
      
      demoTrader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 2
      });

      // Price goes up
      demoTrader.updatePrice('ETHUSDT', 2600);

      const positions = demoTrader.getPositions();
      expect(positions[0].unrealizedPnL).toBeGreaterThan(0);
      expect(positions[0].currentPrice).toBe(2600);
    });
  });

  describe('reset', () => {
    test('should reset portfolio to initial state', () => {
      demoTrader.updatePrice('BTCUSDT', 45000);
      
      demoTrader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      demoTrader.reset(15000);

      const portfolio = demoTrader.getPortfolio();
      expect(portfolio.totalValue).toBe(15000);
      expect(portfolio.cashBalance).toBe(15000);
      
      const positions = demoTrader.getPositions();
      expect(positions.length).toBe(0);
    });
  });

  describe('getStatistics', () => {
    test('should return correct trade statistics', () => {
      demoTrader.updatePrice('BTCUSDT', 45000);
      
      // Open and close a position
      demoTrader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      demoTrader.updatePrice('BTCUSDT', 46000); // Price up
      demoTrader.closePosition('BTCUSDT');

      const stats = demoTrader.getStatistics();
      
      expect(stats.totalTrades).toBe(2); // Open and close
      expect(stats.winningTrades + stats.losingTrades).toBe(stats.totalTrades);
    });
  });
});
