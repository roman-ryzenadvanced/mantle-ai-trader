/**
 * E2E Tests - End-to-End Trading Workflow Tests
 * Tests complete trading scenarios from signal generation to trade execution
 */

import { describe, test, expect } from 'bun:test';
import { DemoTrader } from '../../src/lib/trading/demo/demo-trader';
import { SignalEngine } from '../../src/lib/trading/signals/signal-engine';
import { TradeAction, OrderType, TimeFrame } from '../../src/lib/trading/core/types';

describe('E2E: Complete Trading Workflow', () => {
  test('Full cycle: Signal -> Order -> Position -> Close -> Stats', async () => {
    const trader = new DemoTrader(50000);
    const engine = new SignalEngine();
    
    // Step 1: Set up market prices
    trader.updatePrice('BTCUSDT', 45000);
    trader.updatePrice('ETHUSDT', 2500);
    trader.updatePrice('SOLUSDT', 100);
    
    // Step 2: Generate market data
    const marketData = generateTrendingData('BTCUSDT', 200, 'up');
    
    // Step 3: Generate signal
    const signalOutput = await engine.generateSignal({
      symbol: 'BTCUSDT',
      timeframe: TimeFrame.ONE_HOUR,
      marketData,
      newsArticles: []
    });
    
    expect(signalOutput.signal).toBeDefined();
    expect(signalOutput.analysis).toBeDefined();
    expect(signalOutput.riskAssessment).toBeDefined();
    
    // Step 4: Execute the signal
    if (signalOutput.signal.action !== TradeAction.HOLD) {
      const order = trader.placeOrder({
        symbol: 'BTCUSDT',
        side: signalOutput.signal.action,
        type: OrderType.MARKET,
        quantity: 0.1,
        stopLoss: signalOutput.signal.stopLoss,
        takeProfit: signalOutput.signal.takeProfit
      });
      
      expect(order).toBeDefined();
      expect(order.status).toBe('FILLED');
      
      // Step 5: Verify position exists
      const positions = trader.getPositions();
      expect(positions.length).toBeGreaterThan(0);
      
      // Step 6: Simulate price movement
      const currentPrice = 45000;
      trader.updatePrice('BTCUSDT', currentPrice * 1.05); // 5% up
      
      // Step 7: Close position
      const closeOrder = trader.closePosition('BTCUSDT');
      expect(closeOrder).toBeDefined();
      
      // Step 8: Check statistics
      const stats = trader.getStatistics();
      expect(stats.totalTrades).toBeGreaterThan(0);
    }
  });
  
  test('Multiple symbols trading workflow', async () => {
    const trader = new DemoTrader(100000);
    
    // Set up prices
    trader.updatePrice('BTCUSDT', 45000);
    trader.updatePrice('ETHUSDT', 2500);
    trader.updatePrice('SOLUSDT', 100);
    
    // Open multiple positions
    trader.placeOrder({
      symbol: 'BTCUSDT',
      side: TradeAction.BUY,
      type: OrderType.MARKET,
      quantity: 0.5
    });
    
    trader.placeOrder({
      symbol: 'ETHUSDT',
      side: TradeAction.BUY,
      type: OrderType.MARKET,
      quantity: 5
    });
    
    trader.placeOrder({
      symbol: 'SOLUSDT',
      side: TradeAction.BUY,
      type: OrderType.MARKET,
      quantity: 50
    });
    
    // Verify all positions
    const positions = trader.getPositions();
    expect(positions.length).toBe(3);
    
    // Simulate market movement
    trader.updatePrice('BTCUSDT', 46000);  // Up
    trader.updatePrice('ETHUSDT', 2400);   // Down
    trader.updatePrice('SOLUSDT', 110);    // Up
    
    // Close all positions
    trader.closePosition('BTCUSDT');
    trader.closePosition('ETHUSDT');
    trader.closePosition('SOLUSDT');
    
    // Verify all positions closed
    const remainingPositions = trader.getPositions();
    expect(remainingPositions.length).toBe(0);
    
    // Check statistics
    const stats = trader.getStatistics();
    expect(stats.totalTrades).toBeGreaterThan(0);
  });
  
  test('Stop loss protection workflow', async () => {
    const trader = new DemoTrader(10000);
    
    trader.updatePrice('BTCUSDT', 45000);
    
    // Open position with stop loss
    trader.placeOrder({
      symbol: 'BTCUSDT',
      side: TradeAction.BUY,
      type: OrderType.MARKET,
      quantity: 0.1,
      stopLoss: 44000 // 2.2% stop loss
    });
    
    // Position should be open
    expect(trader.getPositions().length).toBe(1);
    
    // Price drops to stop loss
    trader.updatePrice('BTCUSDT', 43500);
    
    // Position should be automatically closed
    expect(trader.getPositions().length).toBe(0);
    
    // Should have a realized loss
    const portfolio = trader.getPortfolio();
    expect(portfolio.realizedPnL).toBeLessThan(0);
  });
  
  test('Reset and retrade workflow', async () => {
    const trader = new DemoTrader(10000);
    
    // Make some trades
    trader.updatePrice('BTCUSDT', 45000);
    trader.placeOrder({
      symbol: 'BTCUSDT',
      side: TradeAction.BUY,
      type: OrderType.MARKET,
      quantity: 0.1
    });
    
    // Verify we have a position
    expect(trader.getPositions().length).toBe(1);
    
    // Reset
    trader.reset(20000);
    
    // Verify clean state
    expect(trader.getPositions().length).toBe(0);
    expect(trader.getPortfolio().totalValue).toBe(20000);
    expect(trader.getPortfolio().cashBalance).toBe(20000);
    expect(trader.getPortfolio().realizedPnL).toBe(0);
    
    // Can trade again
    trader.updatePrice('ETHUSDT', 2500);
    trader.placeOrder({
      symbol: 'ETHUSDT',
      side: TradeAction.BUY,
      type: OrderType.MARKET,
      quantity: 2
    });
    
    expect(trader.getPositions().length).toBe(1);
  });
});

function generateTrendingData(symbol: string, count: number, direction: 'up' | 'down') {
  const data = [];
  let price = 45000;
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
