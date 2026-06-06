/**
 * Unit Tests for Circuit Breaker Pattern in DemoTrader
 * Tests the v4.0.0 circuit breaker for consecutive loss protection
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DemoTrader } from '../../src/lib/trading/demo/demo-trader';
import { TradeAction, OrderType, OrderStatus } from '../../src/lib/trading/core/types';

/**
 * Helper: open and close a losing trade
 * Uses a low-priced symbol so margin is small and we can do many trades
 */
function openAndCloseLosingTrade(trader: DemoTrader, symbol: string, entryPrice: number, exitPrice: number): void {
  trader.updatePrice(symbol, entryPrice);
  trader.placeOrder({
    symbol,
    side: TradeAction.BUY,
    type: OrderType.MARKET,
    quantity: 0.1,
  });
  // Move price down so closing creates a loss
  trader.updatePrice(symbol, exitPrice);
  trader.closePosition(symbol);
}

function openAndCloseWinningTrade(trader: DemoTrader, symbol: string, entryPrice: number, exitPrice: number): void {
  trader.updatePrice(symbol, entryPrice);
  trader.placeOrder({
    symbol,
    side: TradeAction.BUY,
    type: OrderType.MARKET,
    quantity: 0.1,
  });
  // Move price up so closing creates a win
  trader.updatePrice(symbol, exitPrice);
  trader.closePosition(symbol);
}

describe('Circuit Breaker', () => {
  let trader: DemoTrader;

  beforeEach(() => {
    // Use a small cooldown for testing (1 second)
    trader = new DemoTrader(100000, undefined, {
      consecutiveLossThreshold: 5,
      cooldownDurationMs: 1000, // 1 second for testing
      reducedPositionMultiplier: 0.5,
      recoveryStep: 0.25,
    });
  });

  describe('initial state', () => {
    test('should start in CLOSED state', () => {
      const status = trader.getCircuitBreakerStatus();
      expect(status.state).toBe('CLOSED');
    });

    test('should have zero consecutive losses initially', () => {
      const status = trader.getCircuitBreakerStatus();
      expect(status.consecutiveLosses).toBe(0);
    });

    test('should have position size multiplier of 1.0 initially', () => {
      const status = trader.getCircuitBreakerStatus();
      expect(status.positionSizeMultiplier).toBe(1.0);
    });

    test('should have no trippedAt timestamp initially', () => {
      const status = trader.getCircuitBreakerStatus();
      expect(status.trippedAt).toBeNull();
    });

    test('should have no cooldownExpiresAt initially', () => {
      const status = trader.getCircuitBreakerStatus();
      expect(status.cooldownExpiresAt).toBeNull();
    });

    test('should have zero recovery wins initially', () => {
      const status = trader.getCircuitBreakerStatus();
      expect(status.recoveryWins).toBe(0);
    });

    test('should have correct threshold from config', () => {
      const status = trader.getCircuitBreakerStatus();
      expect(status.threshold).toBe(5);
    });
  });

  describe('opening after 5 consecutive losses', () => {
    test('should trip circuit breaker after exactly 5 consecutive losing trades', () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      const status = trader.getCircuitBreakerStatus();
      // The 5th close triggers the breaker
      expect(status.state).toBe('OPEN');
    });

    test('should NOT trip after 4 consecutive losses', () => {
      for (let i = 0; i < 4; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      const status = trader.getCircuitBreakerStatus();
      expect(status.state).toBe('CLOSED');
    });

    test('should set trippedAt when circuit breaker opens', () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      const status = trader.getCircuitBreakerStatus();
      expect(status.trippedAt).not.toBeNull();
    });

    test('should set cooldownExpiresAt when circuit breaker opens', () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      const status = trader.getCircuitBreakerStatus();
      expect(status.cooldownExpiresAt).not.toBeNull();
    });

    test('should set position size multiplier to 0 when OPEN', () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      const status = trader.getCircuitBreakerStatus();
      expect(status.positionSizeMultiplier).toBe(0);
    });
  });

  describe('trading blocked when OPEN', () => {
    test('should throw error when trying to place order with OPEN circuit breaker', () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      // Now breaker is OPEN
      trader.updatePrice('BLOCKED', 100);
      expect(() => {
        trader.placeOrder({
          symbol: 'BLOCKED',
          side: TradeAction.BUY,
          type: OrderType.MARKET,
          quantity: 1,
        });
      }).toThrow('Circuit breaker is OPEN');
    });
  });

  describe('transition to HALF_OPEN after cooldown', () => {
    test('should move to HALF_OPEN when cooldown expires', async () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      // Wait for cooldown (1 second)
      await new Promise(resolve => setTimeout(resolve, 1100));

      const status = trader.getCircuitBreakerStatus();
      expect(status.state).toBe('HALF_OPEN');
    });

    test('should set reduced position multiplier in HALF_OPEN', async () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      const status = trader.getCircuitBreakerStatus();
      expect(status.positionSizeMultiplier).toBe(0.5); // reducedPositionMultiplier
    });

    test('should reset recovery wins when entering HALF_OPEN', async () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      const status = trader.getCircuitBreakerStatus();
      expect(status.recoveryWins).toBe(0);
    });
  });

  describe('position size reduction in HALF_OPEN', () => {
    test('should apply reduced position size when in HALF_OPEN state', async () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      trader.updatePrice('HALF', 100);
      const order = trader.placeOrder({
        symbol: 'HALF',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 10,
      });
      // Quantity should be reduced by the multiplier (0.5)
      expect(order.quantity).toBeLessThan(10);
      expect(order.quantity).toBeCloseTo(5, 1);
    });
  });

  describe('gradual recovery after winning trades', () => {
    test('should increase position size multiplier after winning trade in HALF_OPEN', async () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Win a trade
      openAndCloseWinningTrade(trader, 'WIN1', 100, 110);

      const status = trader.getCircuitBreakerStatus();
      // multiplier should be 0.5 + 0.25 = 0.75
      expect(status.positionSizeMultiplier).toBeCloseTo(0.75, 2);
      expect(status.recoveryWins).toBe(1);
    });

    test('should continue increasing multiplier with more wins', async () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      openAndCloseWinningTrade(trader, 'WIN1', 100, 110);
      openAndCloseWinningTrade(trader, 'WIN2', 100, 110);

      const status = trader.getCircuitBreakerStatus();
      // multiplier should be 0.5 + 0.25 + 0.25 = 1.0 (capped)
      expect(status.positionSizeMultiplier).toBe(1.0);
    });
  });

  describe('full recovery closes circuit breaker', () => {
    test('should close circuit breaker after multiplier reaches 1.0', async () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Need 2 wins: 0.5 + 0.25 + 0.25 = 1.0
      openAndCloseWinningTrade(trader, 'WIN1', 100, 110);
      openAndCloseWinningTrade(trader, 'WIN2', 100, 110);

      const status = trader.getCircuitBreakerStatus();
      expect(status.state).toBe('CLOSED');
      expect(status.trippedAt).toBeNull();
      expect(status.cooldownExpiresAt).toBeNull();
    });
  });

  describe('loss during HALF_OPEN resets recovery', () => {
    test('should reset recovery wins on a loss during HALF_OPEN', async () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Win one, then lose one
      openAndCloseWinningTrade(trader, 'WIN1', 100, 110);
      openAndCloseLosingTrade(trader, 'LOSE1', 100, 90);

      const status = trader.getCircuitBreakerStatus();
      // Should still be in HALF_OPEN (not re-tripped because already HALF_OPEN)
      expect(status.state).toBe('HALF_OPEN');
      // Recovery wins reset
      expect(status.recoveryWins).toBe(0);
    });

    test('consecutive losses during HALF_OPEN should NOT re-trip breaker', async () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Lose more trades
      openAndCloseLosingTrade(trader, 'LOSE1', 100, 90);
      openAndCloseLosingTrade(trader, 'LOSE2', 100, 90);

      const status = trader.getCircuitBreakerStatus();
      // Should remain HALF_OPEN (not go back to OPEN)
      expect(status.state).toBe('HALF_OPEN');
    });
  });

  describe('manual override (resetCircuitBreaker)', () => {
    test('should reset circuit breaker to CLOSED via resetCircuitBreaker()', () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      expect(trader.getCircuitBreakerStatus().state).toBe('OPEN');

      trader.resetCircuitBreaker();

      const status = trader.getCircuitBreakerStatus();
      expect(status.state).toBe('CLOSED');
      expect(status.consecutiveLosses).toBe(0);
      expect(status.positionSizeMultiplier).toBe(1.0);
      expect(status.trippedAt).toBeNull();
      expect(status.cooldownExpiresAt).toBeNull();
      expect(status.recoveryWins).toBe(0);
    });

    test('should allow trading after manual reset', () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      trader.resetCircuitBreaker();

      trader.updatePrice('AFTER', 100);
      const order = trader.placeOrder({
        symbol: 'AFTER',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 1,
      });
      expect(order).toBeDefined();
      expect(order.quantity).toBe(1);
    });
  });

  describe('reset() also resets circuit breaker', () => {
    test('should reset circuit breaker when trader.reset() is called', () => {
      for (let i = 0; i < 5; i++) {
        openAndCloseLosingTrade(trader, `SYM${i}`, 100, 90);
      }
      expect(trader.getCircuitBreakerStatus().state).toBe('OPEN');

      trader.reset(100000);

      const status = trader.getCircuitBreakerStatus();
      expect(status.state).toBe('CLOSED');
      expect(status.consecutiveLosses).toBe(0);
      expect(status.positionSizeMultiplier).toBe(1.0);
    });
  });

  describe('getCircuitBreakerStatus()', () => {
    test('should return all required fields', () => {
      const status = trader.getCircuitBreakerStatus();
      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('consecutiveLosses');
      expect(status).toHaveProperty('totalTradesWhileActive');
      expect(status).toHaveProperty('trippedAt');
      expect(status).toHaveProperty('cooldownExpiresAt');
      expect(status).toHaveProperty('positionSizeMultiplier');
      expect(status).toHaveProperty('threshold');
      expect(status).toHaveProperty('recoveryWins');
    });

    test('should include totalTradesWhileActive from trade history', () => {
      openAndCloseLosingTrade(trader, 'SYM1', 100, 90);
      const status = trader.getCircuitBreakerStatus();
      expect(status.totalTradesWhileActive).toBeGreaterThan(0);
    });
  });

  describe('custom configuration', () => {
    test('should use custom consecutive loss threshold', () => {
      const customTrader = new DemoTrader(100000, undefined, {
        consecutiveLossThreshold: 3,
        cooldownDurationMs: 1000,
      });

      // 3 losses should trip it
      for (let i = 0; i < 3; i++) {
        openAndCloseLosingTrade(customTrader, `SYM${i}`, 100, 90);
      }
      expect(customTrader.getCircuitBreakerStatus().state).toBe('OPEN');
    });

    test('should use custom reduced position multiplier', async () => {
      const customTrader = new DemoTrader(100000, undefined, {
        consecutiveLossThreshold: 3,
        cooldownDurationMs: 500,
        reducedPositionMultiplier: 0.3,
        recoveryStep: 0.35,
      });

      for (let i = 0; i < 3; i++) {
        openAndCloseLosingTrade(customTrader, `SYM${i}`, 100, 90);
      }
      await new Promise(resolve => setTimeout(resolve, 600));

      const status = customTrader.getCircuitBreakerStatus();
      expect(status.state).toBe('HALF_OPEN');
      expect(status.positionSizeMultiplier).toBeCloseTo(0.3, 2);
    });
  });
});
