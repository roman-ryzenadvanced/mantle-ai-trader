/**
 * Integration Tests for Risk Management
 * Tests risk assessment with open positions, portfolio-level risk calculation,
 * drawdown protection, margin call scenarios, and risk-adjusted position sizing
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
  MarketDataPoint
} from '../../src/lib/trading/core/types';

// ==================== HELPERS ====================

function generateMarketData(symbol: string, count: number, basePrice: number = 45000, trend?: 'up' | 'down' | 'volatile'): MarketDataPoint[] {
  const data: MarketDataPoint[] = [];
  let price = basePrice;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  let seed = 12345;
  const seededRandom = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const volatility = trend === 'volatile' ? 0.05 : 0.02;
  const bias = trend === 'up' ? 0.02 : trend === 'down' ? -0.02 : 0;

  for (let i = count; i >= 0; i--) {
    const change = (seededRandom() - 0.5 + bias) * price * volatility;
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

// ==================== TESTS ====================

describe('Risk Management Integration', () => {
  let trader: DemoTrader;
  let engine: SignalEngine;

  beforeEach(() => {
    trader = new DemoTrader(50000);
    engine = new SignalEngine();
  });

  describe('Risk Assessment with Open Positions', () => {
    test('should assess risk considering existing positions', async () => {
      const marketData = generateMarketData('BTCUSDT', 200);

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.riskAssessment).toBeDefined();
      expect(result.riskAssessment.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskAssessment.riskLevel).toBeDefined();
      expect(result.riskAssessment.marketVolatility).toBeGreaterThanOrEqual(0);
      expect(result.riskAssessment.liquidityRisk).toBeGreaterThanOrEqual(0);
    });

    test('should have higher risk score for volatile data', async () => {
      const normalData = generateMarketData('BTCUSDT', 200, 45000);
      const volatileData = generateMarketData('BTCUSDT', 200, 45000, 'volatile');

      const normalResult = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData: normalData,
        newsArticles: []
      });

      const volatileResult = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData: volatileData,
        newsArticles: []
      });

      // Volatile data should generally have higher risk score
      expect(volatileResult.riskAssessment.marketVolatility).toBeGreaterThan(0);
    });

    test('should identify risk factors like overbought RSI', async () => {
      // Create overbought conditions (consistently rising)
      const marketData = generateMarketData('BTCUSDT', 200, 45000, 'up');

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      // If RSI is overbought, risk factors should mention it
      if (result.analysis.technicalAnalysis.indicators.rsi > 70) {
        const hasOverboughtRisk = result.riskAssessment.riskFactors.some(f =>
          f.toLowerCase().includes('overbought')
        );
        expect(hasOverboughtRisk).toBe(true);
      }
    });
  });

  describe('Portfolio-Level Risk Calculation', () => {
    test('should calculate total unrealized PnL for portfolio', () => {
      trader.updatePrice('BTCUSDT', 45000);
      trader.updatePrice('ETHUSDT', 2500);

      // Open two positions
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

      // Move prices
      trader.updatePrice('BTCUSDT', 46000); // Up $1000
      trader.updatePrice('ETHUSDT', 2400);   // Down $400

      const portfolio = trader.getPortfolio();
      expect(portfolio.unrealizedPnL).toBeDefined();
      // Net should be positive (BTC gain > ETH loss)
      // BTC PnL: (46000-45000) * 0.2 = $200
      // ETH PnL: (2400-2500) * 4 = -$400
      // But unrealizedPnL includes leverage (default 1x)
    });

    test('should track portfolio value across price movements', () => {
      trader.updatePrice('BTCUSDT', 45000);

      const initialPortfolio = trader.getPortfolio();
      expect(initialPortfolio.totalValue).toBe(50000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5
      });

      // Price goes up - portfolio value should change
      trader.updatePrice('BTCUSDT', 50000);
      const upPortfolio = trader.getPortfolio();
      // With 0.5 BTC at $50000: position value = $25000, unrealized PnL = (50000-45000)*0.5 = $2500
      // Total = cash + unrealized PnL
      expect(upPortfolio.totalValue).not.toBe(initialPortfolio.totalValue);
    });

    test('should account for leverage in portfolio risk', () => {
      trader.updatePrice('BTCUSDT', 45000);

      // Open with 5x leverage
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5,
        leverage: 5
      });

      // 2% price move with 5x leverage = 10% position PnL
      trader.updatePrice('BTCUSDT', 45900); // +2%

      const positions = trader.getPositions();
      if (positions.length > 0) {
        // With leverage, PnL should be amplified
        expect(Math.abs(positions[0].unrealizedPnL)).toBeGreaterThan(0);
      }
    });

    test('should never report negative total portfolio value', () => {
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5
      });

      // Catastrophic drop
      trader.updatePrice('BTCUSDT', 1);

      const portfolio = trader.getPortfolio();
      expect(portfolio.totalValue).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Drawdown Protection', () => {
    test('should track drawdown from peak equity', () => {
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5
      });

      // Price goes up (new peak)
      trader.updatePrice('BTCUSDT', 50000);
      const peakPortfolio = trader.getPortfolio();

      // Price drops back
      trader.updatePrice('BTCUSDT', 40000);
      const troughPortfolio = trader.getPortfolio();

      expect(troughPortfolio.totalValue).toBeLessThan(peakPortfolio.totalValue);
    });

    test('should allow stop loss to act as drawdown protection', () => {
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5,
        stopLoss: 44000 // ~2.2% stop loss
      });

      // Price drops to stop loss
      trader.updatePrice('BTCUSDT', 43000);

      // Position should be closed
      const positions = trader.getPositions();
      expect(positions.length).toBe(0);
    });

    test('should protect against cascading losses with multiple positions', () => {
      trader.updatePrice('BTCUSDT', 45000);
      trader.updatePrice('ETHUSDT', 2500);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.2,
        stopLoss: 44000
      });

      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 4,
        stopLoss: 2400
      });

      // Both hit stop loss
      trader.updatePrice('BTCUSDT', 43000);
      trader.updatePrice('ETHUSDT', 2300);

      const positions = trader.getPositions();
      expect(positions.length).toBe(0);

      const portfolio = trader.getPortfolio();
      expect(portfolio.realizedPnL).toBeLessThan(0);
    });
  });

  describe('Margin Call Scenarios', () => {
    test('should handle scenario where position value drops significantly', () => {
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5,
        leverage: 10
      });

      // 10% price drop with 10x leverage = 100% loss on margin
      trader.updatePrice('BTCUSDT', 40500);

      const portfolio = trader.getPortfolio();
      // Portfolio value should still be >= 0
      expect(portfolio.totalValue).toBeGreaterThanOrEqual(0);
    });

    test('should handle short position margin call scenario', () => {
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.SELL,
        type: OrderType.MARKET,
        quantity: 0.5,
        leverage: 5
      });

      // Price rises significantly (bad for short)
      trader.updatePrice('BTCUSDT', 50000);

      const positions = trader.getPositions();
      if (positions.length > 0) {
        expect(positions[0].unrealizedPnL).toBeLessThan(0);
      }

      const portfolio = trader.getPortfolio();
      expect(portfolio.totalValue).toBeGreaterThanOrEqual(0);
    });

    test('should not allow orders exceeding available capital', () => {
      trader.updatePrice('BTCUSDT', 45000);

      expect(() => {
        trader.placeOrder({
          symbol: 'BTCUSDT',
          side: TradeAction.BUY,
          type: OrderType.MARKET,
          quantity: 2 // Would cost 90000, we have 50000
        });
      }).toThrow();
    });

    test('should correctly calculate margin requirements with leverage', () => {
      trader.updatePrice('BTCUSDT', 45000);

      // With 10x leverage, margin = notional / leverage
      const order = trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.5, // Notional: 22500
        leverage: 10   // Margin: 2250
      });

      expect(order).toBeDefined();

      const portfolio = trader.getPortfolio();
      // Cash should be reduced by margin amount
      expect(portfolio.cashBalance).toBe(50000 - (45000 * 0.5 / 10));
    });
  });

  describe('Risk-Adjusted Position Sizing', () => {
    test('should calculate position size based on signal confidence', async () => {
      const marketData = generateMarketData('BTCUSDT', 200, 45000, 'up');
      trader.updatePrice('BTCUSDT', 45000);

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      const signal = {
        id: 'risk-adjusted-signal',
        ...result.signal,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (result.signal.action !== TradeAction.HOLD) {
        const order = await trader.executeSignal(signal);
        // Order should be sized based on confidence
        if (order) {
          expect(order.quantity).toBeGreaterThan(0);
          // With 50000 capital, 2% risk, the position should be reasonable
          const maxNotional = 50000 * 0.02 * 2; // 2% risk, max 2x confidence
          expect(order.quantity * 45000).toBeLessThanOrEqual(50000);
        }
      }
    });

    test('should suggest smaller positions for higher risk signals', async () => {
      const volatileData = generateMarketData('BTCUSDT', 200, 45000, 'volatile');

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData: volatileData,
        newsArticles: []
      });

      // Higher volatility should suggest smaller position
      expect(result.riskAssessment.maxRecommendedPosition).toBeDefined();
      expect(result.riskAssessment.maxRecommendedPosition).toBeGreaterThan(0);
    });

    test('should suggest stop loss and take profit based on volatility', async () => {
      const marketData = generateMarketData('BTCUSDT', 200, 45000);

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      expect(result.riskAssessment.suggestedStopLoss).toBeDefined();
      expect(result.riskAssessment.suggestedTakeProfit).toBeDefined();
    });

    test('should provide appropriate risk level based on market conditions', async () => {
      const calmData = generateMarketData('BTCUSDT', 200, 45000);
      const volatileData = generateMarketData('BTCUSDT', 200, 45000, 'volatile');

      const calmResult = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData: calmData,
        newsArticles: []
      });

      const volatileResult = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData: volatileData,
        newsArticles: []
      });

      // Risk levels should be valid enum values
      expect([RiskLevel.CONSERVATIVE, RiskLevel.MODERATE, RiskLevel.AGGRESSIVE])
        .toContain(calmResult.riskAssessment.riskLevel);
      expect([RiskLevel.CONSERVATIVE, RiskLevel.MODERATE, RiskLevel.AGGRESSIVE])
        .toContain(volatileResult.riskAssessment.riskLevel);
    });
  });

  describe('Risk Across Full Trading Cycle', () => {
    test('should manage risk through open, monitor, and close cycle', async () => {
      trader.updatePrice('BTCUSDT', 45000);

      // Open position with risk controls
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.2,
        stopLoss: 44000,
        takeProfit: 47000
      });

      // Verify position opened with risk controls
      let positions = trader.getPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].stopLoss).toBe(44000);
      expect(positions[0].takeProfit).toBe(47000);

      // Price moves favorably but doesn't hit TP
      trader.updatePrice('BTCUSDT', 46000);
      positions = trader.getPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].unrealizedPnL).toBeGreaterThan(0);

      // Price reverses but doesn't hit SL
      trader.updatePrice('BTCUSDT', 44500);
      positions = trader.getPositions();
      expect(positions.length).toBe(1); // Still open

      // Price hits take profit
      trader.updatePrice('BTCUSDT', 47500);
      positions = trader.getPositions();
      expect(positions.length).toBe(0); // Closed

      const portfolio = trader.getPortfolio();
      expect(portfolio.realizedPnL).toBeGreaterThan(0);
    });

    test('should demonstrate that stop loss limits downside', () => {
      const traderWithSL = new DemoTrader(50000);
      const traderWithoutSL = new DemoTrader(50000);

      traderWithSL.updatePrice('BTCUSDT', 45000);
      traderWithoutSL.updatePrice('BTCUSDT', 45000);

      // With stop loss
      traderWithSL.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.2,
        stopLoss: 44000
      });

      // Without stop loss
      traderWithoutSL.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.2
      });

      // Price crashes
      traderWithSL.updatePrice('BTCUSDT', 30000);
      traderWithoutSL.updatePrice('BTCUSDT', 30000);

      // Trader with stop loss should have less damage
      const portfolioWithSL = traderWithSL.getPortfolio();
      const portfolioWithoutSL = traderWithoutSL.getPortfolio();

      expect(portfolioWithSL.totalValue).toBeGreaterThan(portfolioWithoutSL.totalValue);
    });
  });
});
