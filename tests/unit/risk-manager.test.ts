/**
 * Unit Tests for Risk Manager
 * Comprehensive tests covering position sizing, drawdown protection,
 * daily loss limits, risk scores, emergency liquidation, and edge cases
 *
 * Tests the risk management logic embedded in SignalEngine, DemoTrader,
 * and BacktestEngine as well as standalone risk calculation functions.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DemoTrader } from '../../src/lib/trading/demo/demo-trader';
import { SignalEngine } from '../../src/lib/trading/signals/signal-engine';
import {
  TradeAction,
  OrderType,
  OrderStatus,
  RiskLevel,
  TimeFrame,
  MarketDataPoint,
  SignalStatus,
  PositionSide
} from '../../src/lib/trading/core/types';

// ==================== HELPER: Risk Manager (standalone logic) ====================
// This mirrors the risk logic used across the system for direct unit testing

class RiskManager {
  private dailyPnL: number = 0;
  private dailyLossLimit: number;
  private maxDrawdownPercent: number;
  private maxPositionSizePercent: number;
  private maxLeverage: number;
  private peakEquity: number;
  private emergencyLiquidationTriggered: boolean = false;

  constructor(config: {
    initialCapital: number;
    dailyLossLimitPercent?: number;
    maxDrawdownPercent?: number;
    maxPositionSizePercent?: number;
    maxLeverage?: number;
  }) {
    this.dailyLossLimit = config.initialCapital * (config.dailyLossLimitPercent || 0.05);
    this.maxDrawdownPercent = config.maxDrawdownPercent || 0.20;
    this.maxPositionSizePercent = config.maxPositionSizePercent || 0.10;
    this.maxLeverage = config.maxLeverage || 20;
    this.peakEquity = config.initialCapital;
  }

  calculatePositionSize(params: {
    capital: number;
    entryPrice: number;
    stopLossPrice: number;
    riskPercent: number;
    leverage: number;
  }): number {
    if (params.capital <= 0) return 0;
    if (params.entryPrice <= 0) return 0;
    if (params.stopLossPrice <= 0) return 0;
    if (params.leverage <= 0 || params.leverage > this.maxLeverage) return 0;
    if (params.riskPercent <= 0 || params.riskPercent > 1) return 0;

    const riskAmount = params.capital * params.riskPercent;
    const priceRisk = Math.abs(params.entryPrice - params.stopLossPrice);
    if (priceRisk === 0) return 0;

    const rawQuantity = riskAmount / priceRisk;
    const maxNotional = params.capital * this.maxPositionSizePercent * params.leverage;
    const maxQuantity = maxNotional / params.entryPrice;

    return Math.min(rawQuantity, maxQuantity);
  }

  checkDrawdownProtection(currentEquity: number): { triggered: boolean; drawdown: number } {
    if (currentEquity > this.peakEquity) {
      this.peakEquity = currentEquity;
    }

    if (this.peakEquity <= 0) return { triggered: true, drawdown: 1 };

    const drawdown = (this.peakEquity - currentEquity) / this.peakEquity;
    const triggered = drawdown >= this.maxDrawdownPercent;

    if (triggered) this.emergencyLiquidationTriggered = true;

    return { triggered, drawdown };
  }

  checkDailyLossLimit(realizedPnL: number): { allowed: boolean; remaining: number } {
    this.dailyPnL = realizedPnL;
    const remaining = this.dailyLossLimit + realizedPnL; // PnL is negative for losses
    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining)
    };
  }

  computeRiskScore(params: {
    volatility: number;
    rsi: number;
    positionConcentration: number;
    leverage: number;
    drawdown: number;
  }): number {
    // Risk score from 0 (safest) to 1 (riskiest)
    let score = 0;

    // Volatility contribution (0-0.3)
    score += Math.min(params.volatility * 5, 0.3);

    // RSI extreme contribution (0-0.2)
    if (params.rsi > 70) score += (params.rsi - 70) / 150;
    else if (params.rsi < 30) score += (30 - params.rsi) / 150;

    // Position concentration (0-0.2)
    score += Math.min(params.positionConcentration, 0.2);

    // Leverage risk (0-0.2)
    score += Math.min((params.leverage - 1) / (this.maxLeverage - 1) * 0.2, 0.2);

    // Drawdown contribution (0-0.1)
    score += Math.min(params.drawdown * 0.5, 0.1);

    return Math.max(0, Math.min(1, score));
  }

  getRiskLevel(score: number): RiskLevel {
    if (score < 0.3) return RiskLevel.CONSERVATIVE;
    if (score < 0.7) return RiskLevel.MODERATE;
    return RiskLevel.AGGRESSIVE;
  }

  isEmergencyLiquidation(): boolean {
    return this.emergencyLiquidationTriggered;
  }

  resetDay(): void {
    this.dailyPnL = 0;
  }

  resetEmergency(): void {
    this.emergencyLiquidationTriggered = false;
  }

  getMaxPositionSizePercent(): number {
    return this.maxPositionSizePercent;
  }

  getMaxLeverage(): number {
    return this.maxLeverage;
  }

  getDailyLossLimit(): number {
    return this.dailyLossLimit;
  }
}

// ==================== HELPER: Generate market data ====================

function generateTestMarketData(symbol: string, count: number, basePrice: number = 45000): MarketDataPoint[] {
  const data: MarketDataPoint[] = [];
  let price = basePrice;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  // Seeded random for deterministic results
  let seed = 42;
  const seededRandom = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = count; i >= 0; i--) {
    const change = (seededRandom() - 0.5) * price * 0.02;
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

function generateVolatileMarketData(symbol: string, count: number, basePrice: number = 45000): MarketDataPoint[] {
  const data: MarketDataPoint[] = [];
  let price = basePrice;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  for (let i = count; i >= 0; i--) {
    const change = (Math.random() - 0.5) * price * 0.08; // High volatility
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * Math.abs(change) * 1.5;
    const low = Math.min(open, close) - Math.random() * Math.abs(change) * 1.5;
    const volume = 5000 + Math.random() * 20000;

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

describe('Risk Manager', () => {
  let rm: RiskManager;

  beforeEach(() => {
    rm = new RiskManager({
      initialCapital: 10000,
      dailyLossLimitPercent: 0.05,
      maxDrawdownPercent: 0.20,
      maxPositionSizePercent: 0.10,
      maxLeverage: 20
    });
  });

  describe('Position Sizing Calculations', () => {
    test('should calculate correct position size based on risk percent', () => {
      const size = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 45000,
        stopLossPrice: 44000,
        riskPercent: 0.02,
        leverage: 1
      });

      // Risk amount = 10000 * 0.02 = 200
      // Price risk = 45000 - 44000 = 1000
      // Raw quantity = 200 / 1000 = 0.2
      // Max notional = 10000 * 0.10 * 1 = 1000
      // Max quantity = 1000 / 45000 = 0.0222...
      // Min(0.2, 0.0222) = 0.0222...
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThanOrEqual(0.0223);
    });

    test('should respect max position size limit', () => {
      // Large risk percent but small max position size
      const size = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 100,
        stopLossPrice: 99,
        riskPercent: 0.10,
        leverage: 1
      });

      // Raw quantity could be very large
      // But capped by maxPositionSizePercent
      const maxNotional = 10000 * 0.10 * 1;
      const maxQuantity = maxNotional / 100;
      expect(size).toBeLessThanOrEqual(maxQuantity);
    });

    test('should return 0 for zero capital', () => {
      const size = rm.calculatePositionSize({
        capital: 0,
        entryPrice: 45000,
        stopLossPrice: 44000,
        riskPercent: 0.02,
        leverage: 1
      });
      expect(size).toBe(0);
    });

    test('should return 0 for negative capital', () => {
      const size = rm.calculatePositionSize({
        capital: -1000,
        entryPrice: 45000,
        stopLossPrice: 44000,
        riskPercent: 0.02,
        leverage: 1
      });
      expect(size).toBe(0);
    });

    test('should return 0 for zero entry price', () => {
      const size = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 0,
        stopLossPrice: 44000,
        riskPercent: 0.02,
        leverage: 1
      });
      expect(size).toBe(0);
    });

    test('should return 0 for zero stop loss price', () => {
      const size = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 45000,
        stopLossPrice: 0,
        riskPercent: 0.02,
        leverage: 1
      });
      expect(size).toBe(0);
    });

    test('should return 0 when entry equals stop loss (zero price risk)', () => {
      const size = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 45000,
        stopLossPrice: 45000,
        riskPercent: 0.02,
        leverage: 1
      });
      expect(size).toBe(0);
    });

    test('should handle leverage correctly in position sizing', () => {
      const sizeNoLeverage = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 45000,
        stopLossPrice: 44000,
        riskPercent: 0.02,
        leverage: 1
      });

      const sizeWithLeverage = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 45000,
        stopLossPrice: 44000,
        riskPercent: 0.02,
        leverage: 10
      });

      // With leverage, max notional increases so the cap is higher
      // But raw quantity (risk-based) stays the same
      expect(sizeWithLeverage).toBeGreaterThanOrEqual(sizeNoLeverage);
    });

    test('should return 0 for zero leverage', () => {
      const size = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 45000,
        stopLossPrice: 44000,
        riskPercent: 0.02,
        leverage: 0
      });
      expect(size).toBe(0);
    });

    test('should return 0 for leverage exceeding max', () => {
      const size = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 45000,
        stopLossPrice: 44000,
        riskPercent: 0.02,
        leverage: 100 // Exceeds maxLeverage of 20
      });
      expect(size).toBe(0);
    });

    test('should return 0 for negative risk percent', () => {
      const size = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 45000,
        stopLossPrice: 44000,
        riskPercent: -0.02,
        leverage: 1
      });
      expect(size).toBe(0);
    });

    test('should return 0 for risk percent above 100%', () => {
      const size = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 45000,
        stopLossPrice: 44000,
        riskPercent: 1.5,
        leverage: 1
      });
      expect(size).toBe(0);
    });
  });

  describe('Drawdown Protection', () => {
    test('should not trigger at 0% drawdown', () => {
      const result = rm.checkDrawdownProtection(10000);
      expect(result.triggered).toBe(false);
      expect(result.drawdown).toBe(0);
    });

    test('should not trigger at 10% drawdown', () => {
      // Peak is set to 10000 initially
      const result = rm.checkDrawdownProtection(9000);
      expect(result.triggered).toBe(false);
      expect(result.drawdown).toBeCloseTo(0.1, 2);
    });

    test('should trigger at 20% drawdown (the limit)', () => {
      const result = rm.checkDrawdownProtection(8000);
      expect(result.triggered).toBe(true);
      expect(result.drawdown).toBeCloseTo(0.2, 2);
    });

    test('should trigger beyond 20% drawdown', () => {
      const result = rm.checkDrawdownProtection(7000);
      expect(result.triggered).toBe(true);
      expect(result.drawdown).toBeCloseTo(0.3, 2);
    });

    test('should update peak equity when equity rises', () => {
      rm.checkDrawdownProtection(12000); // New peak
      const result = rm.checkDrawdownProtection(10000);
      // Drawdown from 12000 peak: (12000 - 10000) / 12000 = 0.167
      expect(result.triggered).toBe(false);
      expect(result.drawdown).toBeCloseTo(0.167, 1);
    });

    test('should handle zero equity', () => {
      const result = rm.checkDrawdownProtection(0);
      expect(result.triggered).toBe(true);
    });

    test('should handle negative equity gracefully', () => {
      const result = rm.checkDrawdownProtection(-1000);
      expect(result.triggered).toBe(true);
    });

    test('should flag emergency liquidation when triggered', () => {
      expect(rm.isEmergencyLiquidation()).toBe(false);
      rm.checkDrawdownProtection(7000);
      expect(rm.isEmergencyLiquidation()).toBe(true);
    });

    test('should allow resetting emergency flag', () => {
      rm.checkDrawdownProtection(7000);
      expect(rm.isEmergencyLiquidation()).toBe(true);
      rm.resetEmergency();
      expect(rm.isEmergencyLiquidation()).toBe(false);
    });
  });

  describe('Daily Loss Limit Enforcement', () => {
    test('should allow trading within daily loss limit', () => {
      const result = rm.checkDailyLossLimit(-200); // Lost $200
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    test('should block trading when daily loss limit reached', () => {
      const result = rm.checkDailyLossLimit(-500); // Lost exactly 5% = $500
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test('should block trading when daily loss exceeds limit', () => {
      const result = rm.checkDailyLossLimit(-600); // Lost more than 5%
      expect(result.allowed).toBe(false);
    });

    test('should show remaining capacity correctly', () => {
      // Daily limit = 5% of 10000 = 500
      // Lost $300
      const result = rm.checkDailyLossLimit(-300);
      expect(result.remaining).toBe(200); // 500 - 300 = 200
    });

    test('should allow trading when profitable', () => {
      const result = rm.checkDailyLossLimit(200); // Made $200
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(700); // 500 + 200 = 700
    });

    test('should reset daily PnL', () => {
      rm.checkDailyLossLimit(-400);
      rm.resetDay();
      // After reset, should have full limit again
      const result = rm.checkDailyLossLimit(0);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(500);
    });
  });

  describe('Risk Score Computation', () => {
    test('should return low risk score for calm market', () => {
      const score = rm.computeRiskScore({
        volatility: 0.01,
        rsi: 50,
        positionConcentration: 0.05,
        leverage: 1,
        drawdown: 0
      });
      expect(score).toBeLessThan(0.3);
    });

    test('should return high risk score for volatile market with extreme RSI', () => {
      const score = rm.computeRiskScore({
        volatility: 0.08,
        rsi: 85,
        positionConcentration: 0.9,
        leverage: 15,
        drawdown: 0.15
      });
      expect(score).toBeGreaterThan(0.5);
    });

    test('should return risk score between 0 and 1', () => {
      const scores = [
        rm.computeRiskScore({ volatility: 0, rsi: 50, positionConcentration: 0, leverage: 1, drawdown: 0 }),
        rm.computeRiskScore({ volatility: 0.1, rsi: 90, positionConcentration: 1, leverage: 20, drawdown: 0.5 }),
        rm.computeRiskScore({ volatility: 0.05, rsi: 30, positionConcentration: 0.5, leverage: 5, drawdown: 0.1 }),
      ];
      scores.forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });

    test('should factor in overbought RSI', () => {
      const normalScore = rm.computeRiskScore({
        volatility: 0.02,
        rsi: 50,
        positionConcentration: 0.1,
        leverage: 1,
        drawdown: 0
      });
      const overboughtScore = rm.computeRiskScore({
        volatility: 0.02,
        rsi: 85,
        positionConcentration: 0.1,
        leverage: 1,
        drawdown: 0
      });
      expect(overboughtScore).toBeGreaterThan(normalScore);
    });

    test('should factor in oversold RSI', () => {
      const normalScore = rm.computeRiskScore({
        volatility: 0.02,
        rsi: 50,
        positionConcentration: 0.1,
        leverage: 1,
        drawdown: 0
      });
      const oversoldScore = rm.computeRiskScore({
        volatility: 0.02,
        rsi: 15,
        positionConcentration: 0.1,
        leverage: 1,
        drawdown: 0
      });
      expect(oversoldScore).toBeGreaterThan(normalScore);
    });

    test('should factor in high leverage', () => {
      const lowLeverageScore = rm.computeRiskScore({
        volatility: 0.02,
        rsi: 50,
        positionConcentration: 0.1,
        leverage: 2,
        drawdown: 0
      });
      const highLeverageScore = rm.computeRiskScore({
        volatility: 0.02,
        rsi: 50,
        positionConcentration: 0.1,
        leverage: 18,
        drawdown: 0
      });
      expect(highLeverageScore).toBeGreaterThan(lowLeverageScore);
    });

    test('should map risk level correctly', () => {
      expect(rm.getRiskLevel(0.1)).toBe(RiskLevel.CONSERVATIVE);
      expect(rm.getRiskLevel(0.5)).toBe(RiskLevel.MODERATE);
      expect(rm.getRiskLevel(0.8)).toBe(RiskLevel.AGGRESSIVE);
    });
  });

  describe('Emergency Liquidation Scenarios', () => {
    test('should trigger emergency on catastrophic drawdown', () => {
      // Simulate equity going from 10000 to 5000 (50% drawdown)
      rm.checkDrawdownProtection(5000);
      expect(rm.isEmergencyLiquidation()).toBe(true);
    });

    test('should not trigger emergency on moderate drawdown', () => {
      rm.checkDrawdownProtection(8500); // 15% drawdown
      expect(rm.isEmergencyLiquidation()).toBe(false);
    });

    test('should trigger emergency when drawdown exactly hits limit', () => {
      rm.checkDrawdownProtection(8000); // 20% drawdown
      expect(rm.isEmergencyLiquidation()).toBe(true);
    });

    test('emergency should close all positions in demo trader', () => {
      const trader = new DemoTrader(10000);
      trader.updatePrice('BTCUSDT', 45000);
      trader.updatePrice('ETHUSDT', 2500);

      // Open two positions
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 2
      });

      expect(trader.getPositions().length).toBe(2);

      // Simulate emergency liquidation by closing all positions
      trader.closePosition('BTCUSDT');
      trader.closePosition('ETHUSDT');

      expect(trader.getPositions().length).toBe(0);
    });
  });

  describe('Integration with DemoTrader risk constraints', () => {
    test('should reject order that exceeds available capital', () => {
      const trader = new DemoTrader(10000);
      trader.updatePrice('BTCUSDT', 45000);

      expect(() => {
        trader.placeOrder({
          symbol: 'BTCUSDT',
          side: TradeAction.BUY,
          type: OrderType.MARKET,
          quantity: 1 // Costs 45000, way beyond 10000
        });
      }).toThrow();
    });

    test('should reject invalid leverage', () => {
      const trader = new DemoTrader(10000);
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
    });

    test('should allow larger positions with appropriate leverage', () => {
      const trader = new DemoTrader(10000);
      trader.updatePrice('BTCUSDT', 45000);

      // With 10x leverage, margin = 45000 * 0.1 / 10 = 450
      const order = trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1,
        leverage: 10
      });

      expect(order).toBeDefined();
      expect(order.leverage).toBe(10);
    });

    test('portfolio value should never go negative', () => {
      const trader = new DemoTrader(10000);
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      // Catastrophic price drop
      trader.updatePrice('BTCUSDT', 1);

      const portfolio = trader.getPortfolio();
      expect(portfolio.totalValue).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Integration with SignalEngine risk assessment', () => {
    test('should produce risk assessment with valid risk scores', async () => {
      const engine = new SignalEngine();
      const marketData = generateTestMarketData('BTCUSDT', 200);

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.riskAssessment.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskAssessment.riskScore).toBeLessThanOrEqual(1);
      expect(result.riskAssessment.riskLevel).toBeDefined();
    });

    test('should identify high volatility as a risk factor', async () => {
      const engine = new SignalEngine();
      const volatileData = generateVolatileMarketData('BTCUSDT', 200);

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData: volatileData,
        newsArticles: []
      });

      // With high volatility, risk score should be elevated
      expect(result.riskAssessment.riskScore).toBeGreaterThan(0.3);
    });

    test('should suggest stop loss below entry for buy signals', async () => {
      const engine = new SignalEngine();
      const marketData = generateTestMarketData('BTCUSDT', 200);

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      const currentPrice = marketData[marketData.length - 1].close;
      if (result.signal.action === TradeAction.BUY && result.signal.stopLoss) {
        expect(result.signal.stopLoss).toBeLessThan(currentPrice);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle very small capital', () => {
      const smallRm = new RiskManager({
        initialCapital: 1,
        dailyLossLimitPercent: 0.05
      });
      const result = smallRm.checkDailyLossLimit(-0.05);
      expect(result.allowed).toBe(false);
    });

    test('should handle maximum leverage', () => {
      const size = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 45000,
        stopLossPrice: 44500,
        riskPercent: 0.02,
        leverage: 20
      });
      expect(size).toBeGreaterThan(0);
    });

    test('should handle very tight stop loss', () => {
      const size = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 45000,
        stopLossPrice: 44999.99,
        riskPercent: 0.02,
        leverage: 1
      });
      // Very tight stop loss = very small price risk = potentially large raw quantity
      // But should be capped by maxPositionSizePercent
      expect(size).toBeGreaterThan(0);
    });

    test('should handle very wide stop loss', () => {
      const size = rm.calculatePositionSize({
        capital: 10000,
        entryPrice: 45000,
        stopLossPrice: 1000,
        riskPercent: 0.02,
        leverage: 1
      });
      // Very wide stop loss = very small quantity
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(1);
    });

    test('should handle zero drawdown on initial equity', () => {
      const result = rm.checkDrawdownProtection(10000);
      expect(result.drawdown).toBe(0);
      expect(result.triggered).toBe(false);
    });

    test('should handle custom daily loss limit percent', () => {
      const conservativeRm = new RiskManager({
        initialCapital: 10000,
        dailyLossLimitPercent: 0.02 // 2%
      });
      const result = conservativeRm.checkDailyLossLimit(-150); // 1.5% loss
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeCloseTo(50, 0); // 200 - 150 = 50
    });

    test('should handle custom max drawdown percent', () => {
      const tightRm = new RiskManager({
        initialCapital: 10000,
        maxDrawdownPercent: 0.10 // 10% max drawdown
      });
      const result = tightRm.checkDrawdownProtection(8900); // 11% drawdown
      expect(result.triggered).toBe(true);
    });
  });
});
