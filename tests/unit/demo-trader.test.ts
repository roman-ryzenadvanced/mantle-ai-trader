/**
 * Unit Tests for Demo Trader v2.0.0
 * Comprehensive tests covering order execution, position management,
 * PnL calculation, stop-loss/take-profit, and bug fix validations
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DemoTrader } from '../../src/lib/trading/demo/demo-trader';
import { TradeAction, OrderType, OrderStatus } from '../../src/lib/trading/core/types';

describe('DemoTrader v2.0.0', () => {
  let trader: DemoTrader;

  beforeEach(() => {
    trader = new DemoTrader(10000);
  });

  describe('initialization', () => {
    test('should initialize with correct portfolio', () => {
      const portfolio = trader.getPortfolio();
      
      expect(portfolio.totalValue).toBe(10000);
      expect(portfolio.cashBalance).toBe(10000);
      expect(portfolio.realizedPnL).toBe(0);
      expect(portfolio.unrealizedPnL).toBe(0);
    });

    test('should have no positions initially', () => {
      const positions = trader.getPositions();
      expect(positions.length).toBe(0);
    });

    test('should have no trade history initially', () => {
      const history = trader.getTradeHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('placeOrder', () => {
    test('should place a market buy order', () => {
      trader.updatePrice('BTCUSDT', 45000);

      const order = trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      expect(order).toBeDefined();
      expect(order.status).toBe(OrderStatus.FILLED);
      expect(order.symbol).toBe('BTCUSDT');
      expect(order.side).toBe(TradeAction.BUY);
    });

    test('should update cash balance after buy order', () => {
      trader.updatePrice('ETHUSDT', 2500);
      
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 2
      });

      const portfolio = trader.getPortfolio();
      // Fixed: With 1x leverage, margin = notional / leverage = 5000/1 = 5000
      expect(portfolio.cashBalance).toBe(10000 - (2500 * 2));
    });

    test('should create a position after buy order', () => {
      trader.updatePrice('SOLUSDT', 100);
      
      trader.placeOrder({
        symbol: 'SOLUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 10
      });

      const positions = trader.getPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].symbol).toBe('SOLUSDT');
      expect(positions[0].side).toBe('LONG');
      expect(positions[0].quantity).toBe(10);
    });

    test('should throw error for insufficient capital', () => {
      trader.updatePrice('BTCUSDT', 45000);
      
      expect(() => {
        trader.placeOrder({
          symbol: 'BTCUSDT',
          side: TradeAction.BUY,
          type: OrderType.MARKET,
          quantity: 1 // Would cost 45000, but we only have 10000
        });
      }).toThrow();
    });

    test('should throw error for zero quantity', () => {
      trader.updatePrice('BTCUSDT', 45000);
      
      expect(() => {
        trader.placeOrder({
          symbol: 'BTCUSDT',
          side: TradeAction.BUY,
          type: OrderType.MARKET,
          quantity: 0
        });
      }).toThrow('Quantity must be positive');
    });

    test('should throw error for negative quantity', () => {
      trader.updatePrice('BTCUSDT', 45000);
      
      expect(() => {
        trader.placeOrder({
          symbol: 'BTCUSDT',
          side: TradeAction.BUY,
          type: OrderType.MARKET,
          quantity: -1
        });
      }).toThrow('Quantity must be positive');
    });

    test('should throw error when no price is set', () => {
      expect(() => {
        trader.placeOrder({
          symbol: 'UNKNOWNUSDT',
          side: TradeAction.BUY,
          type: OrderType.MARKET,
          quantity: 1
        });
      }).toThrow();
    });

    test('should reject invalid leverage values', () => {
      trader.updatePrice('BTCUSDT', 45000);
      
      expect(() => {
        trader.placeOrder({
          symbol: 'BTCUSDT',
          side: TradeAction.BUY,
          type: OrderType.MARKET,
          quantity: 0.01,
          leverage: 0
        });
      }).toThrow('Leverage must be between 1 and 100');

      expect(() => {
        trader.placeOrder({
          symbol: 'BTCUSDT',
          side: TradeAction.BUY,
          type: OrderType.MARKET,
          quantity: 0.01,
          leverage: 101
        });
      }).toThrow('Leverage must be between 1 and 100');
    });
  });

  describe('Leverage (Bug Fix Validation)', () => {
    test('should allow larger positions with leverage', () => {
      trader.updatePrice('BTCUSDT', 45000);
      
      // With 5x leverage, we should be able to buy more
      const order = trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5,  // 0.5 * 45000 = 22500 notional, 4500 margin with 5x
        leverage: 5
      });

      expect(order).toBeDefined();
      expect(order.leverage).toBe(5);

      const portfolio = trader.getPortfolio();
      // Margin = 22500 / 5 = 4500
      expect(portfolio.cashBalance).toBe(10000 - 4500);
    });

    test('leverage should affect PnL calculation', () => {
      trader.updatePrice('ETHUSDT', 2500);
      
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 2,
        leverage: 5
      });

      // Price goes up by 2%
      trader.updatePrice('ETHUSDT', 2550);

      const positions = trader.getPositions();
      // With 5x leverage, unrealized PnL should be amplified
      const position = positions[0];
      const expectedPnL = (2550 - 2500) * 2 * 5; // 500
      expect(position.unrealizedPnL).toBeCloseTo(expectedPnL, -1);
    });
  });

  describe('closePosition', () => {
    test('should close an existing position', () => {
      trader.updatePrice('BTCUSDT', 45000);
      
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      const closeOrder = trader.closePosition('BTCUSDT');
      
      expect(closeOrder).toBeDefined();
      expect(closeOrder?.side).toBe(TradeAction.SELL);
      
      const positions = trader.getPositions();
      expect(positions.length).toBe(0);
    });

    test('should return null when closing non-existent position', () => {
      const result = trader.closePosition('NONEXISTENT');
      expect(result).toBeNull();
    });

    test('should calculate realized PnL correctly for profitable trade', () => {
      trader.updatePrice('ETHUSDT', 2500);
      
      // Buy 2 ETH at 2500
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 2
      });

      // Price rises to 2600
      trader.updatePrice('ETHUSDT', 2600);
      
      // Close position
      trader.closePosition('ETHUSDT');

      const portfolio = trader.getPortfolio();
      // Realized PnL should be positive (profit from price increase)
      // PnL = (2600 - 2500) * 2 * 1 (leverage) = 200
      expect(portfolio.realizedPnL).toBeGreaterThan(0);
    });
  });

  describe('Stop Loss and Take Profit', () => {
    test('should trigger stop loss for long position', () => {
      trader.updatePrice('ETHUSDT', 2500);
      
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 2,
        stopLoss: 2400
      });

      // Price drops below stop loss
      trader.updatePrice('ETHUSDT', 2350);

      const positions = trader.getPositions();
      expect(positions.length).toBe(0); // Position should be closed
    });

    test('should trigger take profit for long position', () => {
      trader.updatePrice('ETHUSDT', 2500);
      
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 2,
        takeProfit: 2550 // 2% take profit
      });

      // Verify position exists with take profit set
      let positions = trader.getPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].takeProfit).toBe(2550);

      // Price rises above take profit
      trader.updatePrice('ETHUSDT', 2600);

      positions = trader.getPositions();
      expect(positions.length).toBe(0); // Position should be closed by take profit
    });

    test('should trigger stop loss for short position', () => {
      trader.updatePrice('ETHUSDT', 2500);
      
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.SELL,
        type: OrderType.MARKET,
        quantity: 2,
        stopLoss: 2550 // 2% stop loss
      });

      // Verify position exists with stop loss set
      let positions = trader.getPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].stopLoss).toBe(2550);

      // Price rises above stop loss
      trader.updatePrice('ETHUSDT', 2600);

      positions = trader.getPositions();
      expect(positions.length).toBe(0); // Position should be closed by stop loss
    });

    test('should trigger take profit for short position', () => {
      trader.updatePrice('ETHUSDT', 2500);
      
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.SELL,
        type: OrderType.MARKET,
        quantity: 2,
        takeProfit: 2400
      });

      // Price drops below take profit
      trader.updatePrice('ETHUSDT', 2350);

      const positions = trader.getPositions();
      expect(positions.length).toBe(0); // Position should be closed
    });
  });

  describe('Short Selling (Bug Fix Validation)', () => {
    test('short position should have unrealized profit when price drops', () => {
      trader.updatePrice('ETHUSDT', 2500);
      
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.SELL,
        type: OrderType.MARKET,
        quantity: 2
      });

      // Price drops - should be profitable for short
      trader.updatePrice('ETHUSDT', 2400);

      const positions = trader.getPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].side).toBe('SHORT');
      expect(positions[0].unrealizedPnL).toBeGreaterThan(0);
    });

    test('short position should have unrealized loss when price rises', () => {
      trader.updatePrice('ETHUSDT', 2500);
      
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.SELL,
        type: OrderType.MARKET,
        quantity: 2
      });

      // Price rises - should be loss for short
      trader.updatePrice('ETHUSDT', 2600);

      const positions = trader.getPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].unrealizedPnL).toBeLessThan(0);
    });

    test('closing short position with profit should increase cash balance', () => {
      trader.updatePrice('ETHUSDT', 2500);
      
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.SELL,
        type: OrderType.MARKET,
        quantity: 2
      });

      const cashAfterOpen = trader.getPortfolio().cashBalance;

      // Price drops - profitable
      trader.updatePrice('ETHUSDT', 2400);
      trader.closePosition('ETHUSDT');

      const portfolio = trader.getPortfolio();
      // Cash should increase from the profitable trade
      expect(portfolio.cashBalance).toBeGreaterThan(cashAfterOpen);
      expect(portfolio.realizedPnL).toBeGreaterThan(0);
    });
  });

  describe('updatePrice', () => {
    test('should update position PnL when price changes', () => {
      trader.updatePrice('ETHUSDT', 2500);
      
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 2
      });

      // Price goes up
      trader.updatePrice('ETHUSDT', 2600);

      const positions = trader.getPositions();
      expect(positions[0].unrealizedPnL).toBeGreaterThan(0);
      expect(positions[0].currentPrice).toBe(2600);
    });

    test('should ignore invalid (zero/negative) prices', () => {
      trader.updatePrice('ETHUSDT', 2500);
      
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 2
      });

      // Try to update with zero price
      trader.updatePrice('ETHUSDT', 0);

      const positions = trader.getPositions();
      expect(positions[0].currentPrice).toBe(2500); // Should not change
    });
  });

  describe('reset', () => {
    test('should reset portfolio to initial state', () => {
      trader.updatePrice('BTCUSDT', 45000);
      
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      trader.reset(15000);

      const portfolio = trader.getPortfolio();
      expect(portfolio.totalValue).toBe(15000);
      expect(portfolio.cashBalance).toBe(15000);
      
      const positions = trader.getPositions();
      expect(positions.length).toBe(0);
    });

    test('should throw error for non-positive initial capital', () => {
      expect(() => trader.reset(0)).toThrow();
      expect(() => trader.reset(-1000)).toThrow();
    });
  });

  describe('getStatistics', () => {
    test('should return correct trade statistics', () => {
      trader.updatePrice('BTCUSDT', 45000);
      
      // Open and close a position
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      trader.updatePrice('BTCUSDT', 46000); // Price up
      trader.closePosition('BTCUSDT');

      const stats = trader.getStatistics();
      
      expect(stats.totalTrades).toBeGreaterThan(0);
      expect(stats.winningTrades + stats.losingTrades).toBe(stats.totalTrades);
    });

    test('should return empty statistics for no trades', () => {
      const stats = trader.getStatistics();
      
      expect(stats.totalTrades).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.totalPnL).toBe(0);
    });
  });

  describe('Limit Orders', () => {
    test('should create pending order for limit buy', () => {
      trader.updatePrice('BTCUSDT', 45000);
      
      const order = trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.LIMIT,
        quantity: 0.1,
        price: 44000
      });

      expect(order.status).toBe(OrderStatus.PENDING);
      
      const openOrders = trader.getOpenOrders();
      expect(openOrders.length).toBe(1);
    });

    test('should execute limit buy when price drops to target', () => {
      trader.updatePrice('BTCUSDT', 45000);
      
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.LIMIT,
        quantity: 0.1,
        price: 44000
      });

      // Price drops to limit
      trader.updatePrice('BTCUSDT', 43900);

      const openOrders = trader.getOpenOrders();
      expect(openOrders.length).toBe(0); // Order should be filled
      
      const positions = trader.getPositions();
      expect(positions.length).toBe(1);
    });

    test('should execute limit sell when price rises to target', () => {
      trader.updatePrice('BTCUSDT', 45000);
      
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.SELL,
        type: OrderType.LIMIT,
        quantity: 0.1,
        price: 46000
      });

      // Price rises to limit
      trader.updatePrice('BTCUSDT', 46100);

      const openOrders = trader.getOpenOrders();
      expect(openOrders.length).toBe(0);
    });
  });

  describe('cancelOrder', () => {
    test('should cancel a pending order', () => {
      trader.updatePrice('BTCUSDT', 45000);
      
      const order = trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.LIMIT,
        quantity: 0.1,
        price: 44000
      });

      const result = trader.cancelOrder(order.id);
      expect(result).toBe(true);
      
      const openOrders = trader.getOpenOrders();
      expect(openOrders.length).toBe(0);
    });

    test('should return false for non-existent order', () => {
      const result = trader.cancelOrder('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('Portfolio Protection', () => {
    test('portfolio total value should never go negative', () => {
      trader.updatePrice('BTCUSDT', 45000);
      
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      // Massive price drop
      trader.updatePrice('BTCUSDT', 1);

      const portfolio = trader.getPortfolio();
      expect(portfolio.totalValue).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== v4.0.0 NEW TESTS ====================

  describe('Circuit Breaker Integration', () => {
    test('should start with circuit breaker CLOSED', () => {
      const status = trader.getCircuitBreakerStatus();
      expect(status.state).toBe('CLOSED');
    });

    test('should trip circuit breaker after 5 consecutive losing trades', () => {
      const cbTrader = new DemoTrader(100000, undefined, { consecutiveLossThreshold: 5, cooldownDurationMs: 60000 });
      for (let i = 0; i < 5; i++) {
        cbTrader.updatePrice(`LOSS${i}`, 100);
        cbTrader.placeOrder({ symbol: `LOSS${i}`, side: TradeAction.BUY, type: OrderType.MARKET, quantity: 0.1 });
        cbTrader.updatePrice(`LOSS${i}`, 90); // Loss
        cbTrader.closePosition(`LOSS${i}`);
      }
      expect(cbTrader.getCircuitBreakerStatus().state).toBe('OPEN');
    });

    test('should block trading when circuit breaker is OPEN', () => {
      const cbTrader = new DemoTrader(100000, undefined, { consecutiveLossThreshold: 3, cooldownDurationMs: 60000 });
      for (let i = 0; i < 3; i++) {
        cbTrader.updatePrice(`SYM${i}`, 100);
        cbTrader.placeOrder({ symbol: `SYM${i}`, side: TradeAction.BUY, type: OrderType.MARKET, quantity: 0.1 });
        cbTrader.updatePrice(`SYM${i}`, 90);
        cbTrader.closePosition(`SYM${i}`);
      }
      cbTrader.updatePrice('BLOCKED', 100);
      expect(() => {
        cbTrader.placeOrder({ symbol: 'BLOCKED', side: TradeAction.BUY, type: OrderType.MARKET, quantity: 1 });
      }).toThrow('Circuit breaker is OPEN');
    });

    test('reset should also reset circuit breaker state', () => {
      const cbTrader = new DemoTrader(100000, undefined, { consecutiveLossThreshold: 3, cooldownDurationMs: 60000 });
      for (let i = 0; i < 3; i++) {
        cbTrader.updatePrice(`SYM${i}`, 100);
        cbTrader.placeOrder({ symbol: `SYM${i}`, side: TradeAction.BUY, type: OrderType.MARKET, quantity: 0.1 });
        cbTrader.updatePrice(`SYM${i}`, 90);
        cbTrader.closePosition(`SYM${i}`);
      }
      expect(cbTrader.getCircuitBreakerStatus().state).toBe('OPEN');
      cbTrader.reset(100000);
      expect(cbTrader.getCircuitBreakerStatus().state).toBe('CLOSED');
    });
  });

  describe('checkMarginCall unified return type', () => {
    test('should return object with isMarginCall and closedSymbols', () => {
      const result = trader.checkMarginCall();
      expect(result).toHaveProperty('isMarginCall');
      expect(result).toHaveProperty('closedSymbols');
      expect(typeof result.isMarginCall).toBe('boolean');
      expect(Array.isArray(result.closedSymbols)).toBe(true);
    });

    test('should return no margin call when no positions', () => {
      const result = trader.checkMarginCall();
      expect(result.isMarginCall).toBe(false);
      expect(result.closedSymbols.length).toBe(0);
    });
  });

  describe('updateTrailingStop merged method', () => {
    test('should set trailing stop via public API (string, percent)', () => {
      trader.updatePrice('ETHUSDT', 2500);
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 1,
      });

      const result = trader.updateTrailingStop('ETHUSDT', 5);
      expect(result).toBe(true);

      const positions = trader.getPositions();
      expect(positions[0].stopLoss).toBeDefined();
      expect(positions[0].stopLoss).toBeLessThan(2500);
    });

    test('should return false for non-existent position', () => {
      const result = trader.updateTrailingStop('NOTEXIST', 5);
      expect(result).toBe(false);
    });

    test('should return false for invalid percent values', () => {
      trader.updatePrice('ETHUSDT', 2500);
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 1,
      });

      expect(trader.updateTrailingStop('ETHUSDT', 0)).toBe(false);
      expect(trader.updateTrailingStop('ETHUSDT', 100)).toBe(false);
      expect(trader.updateTrailingStop('ETHUSDT', -5)).toBe(false);
    });

    test('should return false when no trailPercent provided', () => {
      trader.updatePrice('ETHUSDT', 2500);
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 1,
      });
      const result = trader.updateTrailingStop('ETHUSDT');
      expect(result).toBe(false);
    });
  });

  describe('calculateCommission with OrderType parameter', () => {
    test('should use maker fee for LIMIT orders', () => {
      const makerFee = trader.calculateCommission(100, 1, OrderType.LIMIT);
      expect(makerFee).toBeCloseTo(100 * 1 * 0.0002, 10); // 0.02% maker
    });

    test('should use taker fee for MARKET orders', () => {
      const takerFee = trader.calculateCommission(100, 1, OrderType.MARKET);
      expect(takerFee).toBeCloseTo(100 * 1 * 0.0005, 10); // 0.05% taker
    });

    test('maker fee should be less than taker fee for same order', () => {
      const makerFee = trader.calculateCommission(100, 1, OrderType.LIMIT);
      const takerFee = trader.calculateCommission(100, 1, OrderType.MARKET);
      expect(makerFee).toBeLessThan(takerFee);
    });

    test('should use custom commission rates', () => {
      const customTrader = new DemoTrader(10000, { makerFee: 0.001, takerFee: 0.002 });
      const makerFee = customTrader.calculateCommission(100, 1, OrderType.LIMIT);
      const takerFee = customTrader.calculateCommission(100, 1, OrderType.MARKET);
      expect(makerFee).toBeCloseTo(0.1, 5);
      expect(takerFee).toBeCloseTo(0.2, 5);
    });
  });
});
