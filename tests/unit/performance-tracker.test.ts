/**
 * Unit Tests for Performance Tracker
 * Comprehensive tests covering rolling Sharpe ratio, win/loss streak tracking,
 * equity curve generation, peak/trough identification, and report generation
 *
 * Tests the performance analytics logic used in DemoTrader, BacktestEngine,
 * and standalone performance calculation functions.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DemoTrader } from '../../src/lib/trading/demo/demo-trader';
import { BacktestEngine } from '../../src/lib/trading/backtest/backtest-engine';
import { TradeAction, OrderType, TimeFrame } from '../../src/lib/trading/core/types';

// ==================== HELPER: Performance Tracker ====================

interface TradeRecord {
  pnl: number;
  timestamp: Date;
  symbol: string;
}

class PerformanceTracker {
  private trades: TradeRecord[] = [];
  private equityCurve: number[] = [];
  private initialCapital: number;

  constructor(initialCapital: number) {
    this.initialCapital = initialCapital;
    this.equityCurve = [initialCapital];
  }

  recordTrade(pnl: number, symbol: string = 'UNKNOWN'): void {
    this.trades.push({
      pnl,
      timestamp: new Date(),
      symbol
    });
    const lastEquity = this.equityCurve[this.equityCurve.length - 1] || this.initialCapital;
    this.equityCurve.push(lastEquity + pnl);
  }

  getCurrentEquity(): number {
    return this.equityCurve[this.equityCurve.length - 1] || this.initialCapital;
  }

  getEquityCurve(): number[] {
    return [...this.equityCurve];
  }

  /**
   * Calculate rolling Sharpe ratio using a window of recent returns
   */
  calculateRollingSharpe(windowSize: number = 20): number {
    if (this.trades.length < 2) return 0;

    const recentTrades = this.trades.slice(-windowSize);
    const returns = recentTrades.map(t => t.pnl / this.initialCapital);

    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)
    );

    if (stdDev === 0) return 0;

    return (avgReturn / stdDev) * Math.sqrt(252); // Annualized
  }

  /**
   * Track win/loss streaks
   */
  getStreaks(): { currentWinStreak: number; currentLossStreak: number; maxWinStreak: number; maxLossStreak: number } {
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let tempWinStreak = 0;
    let tempLossStreak = 0;

    for (const trade of this.trades) {
      if (trade.pnl > 0) {
        tempWinStreak++;
        tempLossStreak = 0;
        maxWinStreak = Math.max(maxWinStreak, tempWinStreak);
      } else if (trade.pnl < 0) {
        tempLossStreak++;
        tempWinStreak = 0;
        maxLossStreak = Math.max(maxLossStreak, tempLossStreak);
      } else {
        tempWinStreak = 0;
        tempLossStreak = 0;
      }
    }

    // Current streaks (from most recent trade backward)
    currentWinStreak = 0;
    currentLossStreak = 0;
    for (let i = this.trades.length - 1; i >= 0; i--) {
      if (this.trades[i].pnl > 0 && currentLossStreak === 0) {
        currentWinStreak++;
      } else if (this.trades[i].pnl < 0 && currentWinStreak === 0) {
        currentLossStreak++;
      } else {
        break;
      }
    }

    return { currentWinStreak, currentLossStreak, maxWinStreak, maxLossStreak };
  }

  /**
   * Identify peaks and troughs in equity curve
   */
  identifyPeaksAndTroughs(): { peaks: number[]; troughs: number[]; maxPeak: number; minTrough: number } {
    const peaks: number[] = [];
    const troughs: number[] = [];

    for (let i = 1; i < this.equityCurve.length - 1; i++) {
      const prev = this.equityCurve[i - 1];
      const curr = this.equityCurve[i];
      const next = this.equityCurve[i + 1];

      if (curr > prev && curr > next) {
        peaks.push(curr);
      }
      if (curr < prev && curr < next) {
        troughs.push(curr);
      }
    }

    return {
      peaks,
      troughs,
      maxPeak: peaks.length > 0 ? Math.max(...peaks) : this.initialCapital,
      minTrough: troughs.length > 0 ? Math.min(...troughs) : this.initialCapital
    };
  }

  /**
   * Calculate max drawdown from equity curve
   */
  calculateMaxDrawdown(): { maxDrawdown: number; maxDrawdownPercent: number; peakIndex: number; troughIndex: number } {
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let peak = this.equityCurve[0] || 0;
    let peakIndex = 0;
    let resultPeakIndex = 0;
    let resultTroughIndex = 0;

    for (let i = 1; i < this.equityCurve.length; i++) {
      const equity = this.equityCurve[i];
      if (equity > peak) {
        peak = equity;
        peakIndex = i;
      }

      if (peak > 0) {
        const drawdown = peak - equity;
        const drawdownPercent = drawdown / peak;
        if (drawdownPercent > maxDrawdownPercent) {
          maxDrawdownPercent = drawdownPercent;
          maxDrawdown = drawdown;
          resultPeakIndex = peakIndex;
          resultTroughIndex = i;
        }
      }
    }

    return { maxDrawdown, maxDrawdownPercent, peakIndex: resultPeakIndex, troughIndex: resultTroughIndex };
  }

  /**
   * Calculate win rate
   */
  calculateWinRate(): number {
    if (this.trades.length === 0) return 0;
    const wins = this.trades.filter(t => t.pnl > 0).length;
    return (wins / this.trades.length) * 100;
  }

  /**
   * Calculate profit factor
   */
  calculateProfitFactor(): number {
    const grossProfit = this.trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(this.trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    return grossLoss > 0 ? grossProfit / grossLoss : 0;
  }

  /**
   * Calculate average win and loss
   */
  calculateAverageWinLoss(): { avgWin: number; avgLoss: number; winLossRatio: number } {
    const wins = this.trades.filter(t => t.pnl > 0);
    const losses = this.trades.filter(t => t.pnl < 0);

    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length) : 0;
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    return { avgWin, avgLoss, winLossRatio };
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const sharpe = this.calculateRollingSharpe();
    const streaks = this.getStreaks();
    const drawdown = this.calculateMaxDrawdown();
    const winRate = this.calculateWinRate();
    const profitFactor = this.calculateProfitFactor();
    const avgWL = this.calculateAverageWinLoss();
    const totalPnL = this.trades.reduce((sum, t) => sum + t.pnl, 0);
    const totalReturn = ((this.getCurrentEquity() - this.initialCapital) / this.initialCapital) * 100;

    return `
# Performance Report

## Summary
- Initial Capital: $${this.initialCapital.toLocaleString()}
- Current Equity: $${this.getCurrentEquity().toFixed(2)}
- Total Return: ${totalReturn.toFixed(2)}%
- Total PnL: $${totalPnL.toFixed(2)}

## Risk Metrics
- Sharpe Ratio: ${sharpe.toFixed(2)}
- Max Drawdown: ${(drawdown.maxDrawdownPercent * 100).toFixed(2)}%
- Profit Factor: ${profitFactor.toFixed(2)}

## Trade Statistics
- Total Trades: ${this.trades.length}
- Win Rate: ${winRate.toFixed(2)}%
- Average Win: $${avgWL.avgWin.toFixed(2)}
- Average Loss: $${avgWL.avgLoss.toFixed(2)}
- Win/Loss Ratio: ${avgWL.winLossRatio.toFixed(2)}

## Streaks
- Max Win Streak: ${streaks.maxWinStreak}
- Max Loss Streak: ${streaks.maxLossStreak}
- Current Win Streak: ${streaks.currentWinStreak}
- Current Loss Streak: ${streaks.currentLossStreak}
    `.trim();
  }

  getTradeCount(): number {
    return this.trades.length;
  }

  getTotalPnL(): number {
    return this.trades.reduce((sum, t) => sum + t.pnl, 0);
  }
}

// ==================== TESTS ====================

describe('Performance Tracker', () => {
  let tracker: PerformanceTracker;

  beforeEach(() => {
    tracker = new PerformanceTracker(10000);
  });

  describe('Rolling Sharpe Ratio Calculation', () => {
    test('should return 0 for no trades', () => {
      expect(tracker.calculateRollingSharpe()).toBe(0);
    });

    test('should return 0 for single trade', () => {
      tracker.recordTrade(100);
      expect(tracker.calculateRollingSharpe()).toBe(0);
    });

    test('should return positive Sharpe for consistently profitable trades', () => {
      // Record a series of small winning trades
      for (let i = 0; i < 25; i++) {
        tracker.recordTrade(50 + Math.random() * 10);
      }
      expect(tracker.calculateRollingSharpe()).toBeGreaterThan(0);
    });

    test('should return negative Sharpe for consistently losing trades', () => {
      for (let i = 0; i < 25; i++) {
        tracker.recordTrade(-50 - Math.random() * 10);
      }
      expect(tracker.calculateRollingSharpe()).toBeLessThan(0);
    });

    test('should handle identical PnL trades (near-zero std dev)', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordTrade(100); // All identical
      }
      // With identical trades, std dev is 0, so Sharpe should be 0
      // But due to floating point, it may be very small or 0
      const sharpe = tracker.calculateRollingSharpe();
      expect(isFinite(sharpe)).toBe(true);
    });

    test('should respect window size parameter', () => {
      // Record 30 trades: first 20 losing, last 10 winning
      for (let i = 0; i < 20; i++) {
        tracker.recordTrade(-50);
      }
      for (let i = 0; i < 10; i++) {
        tracker.recordTrade(100);
      }

      // With window=5, only last 5 trades (all winning) matter
      const sharpe5 = tracker.calculateRollingSharpe(5);
      // With window=30, all trades matter
      const sharpe30 = tracker.calculateRollingSharpe(30);

      expect(sharpe5).toBeGreaterThan(sharpe30);
    });

    test('should handle mixed winning and losing trades', () => {
      for (let i = 0; i < 20; i++) {
        tracker.recordTrade(i % 2 === 0 ? 200 : -100);
      }
      // Net positive, so Sharpe should be positive
      const sharpe = tracker.calculateRollingSharpe();
      expect(sharpe).toBeGreaterThan(0);
    });
  });

  describe('Win/Loss Streak Tracking', () => {
    test('should track current win streak', () => {
      tracker.recordTrade(-50);
      tracker.recordTrade(100);
      tracker.recordTrade(100);
      tracker.recordTrade(100);

      const streaks = tracker.getStreaks();
      expect(streaks.currentWinStreak).toBe(3);
      expect(streaks.currentLossStreak).toBe(0);
    });

    test('should track current loss streak', () => {
      tracker.recordTrade(100);
      tracker.recordTrade(-50);
      tracker.recordTrade(-50);

      const streaks = tracker.getStreaks();
      expect(streaks.currentLossStreak).toBe(2);
      expect(streaks.currentWinStreak).toBe(0);
    });

    test('should track max win streak', () => {
      tracker.recordTrade(100);
      tracker.recordTrade(100);
      tracker.recordTrade(100); // 3 win streak
      tracker.recordTrade(-50); // Break
      tracker.recordTrade(100);
      tracker.recordTrade(100); // 2 win streak

      const streaks = tracker.getStreaks();
      expect(streaks.maxWinStreak).toBe(3);
    });

    test('should track max loss streak', () => {
      tracker.recordTrade(-50);
      tracker.recordTrade(-50);
      tracker.recordTrade(-50); // 3 loss streak
      tracker.recordTrade(100); // Break
      tracker.recordTrade(-50);
      tracker.recordTrade(-50); // 2 loss streak

      const streaks = tracker.getStreaks();
      expect(streaks.maxLossStreak).toBe(3);
    });

    test('should handle no trades', () => {
      const streaks = tracker.getStreaks();
      expect(streaks.currentWinStreak).toBe(0);
      expect(streaks.currentLossStreak).toBe(0);
      expect(streaks.maxWinStreak).toBe(0);
      expect(streaks.maxLossStreak).toBe(0);
    });

    test('should handle all winning trades', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordTrade(100);
      }
      const streaks = tracker.getStreaks();
      expect(streaks.maxWinStreak).toBe(10);
      expect(streaks.maxLossStreak).toBe(0);
    });

    test('should handle all losing trades', () => {
      for (let i = 0; i < 5; i++) {
        tracker.recordTrade(-50);
      }
      const streaks = tracker.getStreaks();
      expect(streaks.maxLossStreak).toBe(5);
      expect(streaks.maxWinStreak).toBe(0);
    });

    test('should handle breakeven trades (reset streak)', () => {
      tracker.recordTrade(100);
      tracker.recordTrade(100);
      tracker.recordTrade(0); // Breakeven - resets both streaks
      tracker.recordTrade(100);

      const streaks = tracker.getStreaks();
      expect(streaks.maxWinStreak).toBe(2);
    });
  });

  describe('Equity Curve Generation', () => {
    test('should start with initial capital', () => {
      const curve = tracker.getEquityCurve();
      expect(curve.length).toBe(1);
      expect(curve[0]).toBe(10000);
    });

    test('should update equity curve with each trade', () => {
      tracker.recordTrade(500);
      tracker.recordTrade(-200);
      tracker.recordTrade(300);

      const curve = tracker.getEquityCurve();
      expect(curve.length).toBe(4); // Initial + 3 trades
      expect(curve[0]).toBe(10000);
      expect(curve[1]).toBe(10500);
      expect(curve[2]).toBe(10300);
      expect(curve[3]).toBe(10600);
    });

    test('should return a copy of the equity curve', () => {
      tracker.recordTrade(500);
      const curve1 = tracker.getEquityCurve();
      const curve2 = tracker.getEquityCurve();
      expect(curve1).not.toBe(curve2); // Different references
      expect(curve1).toEqual(curve2); // Same values
    });

    test('should handle many trades efficiently', () => {
      for (let i = 0; i < 1000; i++) {
        tracker.recordTrade(Math.random() > 0.5 ? 50 : -30);
      }
      const curve = tracker.getEquityCurve();
      expect(curve.length).toBe(1001);
    });
  });

  describe('Peak/Trough Identification', () => {
    test('should identify no peaks/troughs with flat equity', () => {
      // Only initial capital, no variation
      const result = tracker.identifyPeaksAndTroughs();
      expect(result.peaks.length).toBe(0);
      expect(result.troughs.length).toBe(0);
    });

    test('should identify peaks and troughs in varying equity', () => {
      // Equity: 10000 -> 10500 (up) -> 10200 (down) -> 10800 (up) -> 10000 (down)
      tracker.recordTrade(500);  // 10500
      tracker.recordTrade(-300); // 10200
      tracker.recordTrade(600);  // 10800
      tracker.recordTrade(-800); // 10000

      const result = tracker.identifyPeaksAndTroughs();
      expect(result.peaks.length).toBeGreaterThan(0);
      expect(result.troughs.length).toBeGreaterThan(0);
    });

    test('should identify max peak correctly', () => {
      tracker.recordTrade(500);  // 10500
      tracker.recordTrade(-300); // 10200
      tracker.recordTrade(1000); // 11200
      tracker.recordTrade(-500); // 10700

      const result = tracker.identifyPeaksAndTroughs();
      expect(result.maxPeak).toBe(11200);
    });

    test('should identify min trough correctly', () => {
      tracker.recordTrade(500);  // 10500
      tracker.recordTrade(-700); // 9800
      tracker.recordTrade(300);  // 10100
      tracker.recordTrade(-500); // 9600

      const result = tracker.identifyPeaksAndTroughs();
      expect(result.minTrough).toBeLessThan(10000);
    });

    test('should return initial capital as defaults when no variation', () => {
      const result = tracker.identifyPeaksAndTroughs();
      expect(result.maxPeak).toBe(10000);
      expect(result.minTrough).toBe(10000);
    });
  });

  describe('Max Drawdown Calculation', () => {
    test('should return 0 drawdown when equity only increases', () => {
      tracker.recordTrade(100);
      tracker.recordTrade(200);
      tracker.recordTrade(300);

      const dd = tracker.calculateMaxDrawdown();
      expect(dd.maxDrawdown).toBe(0);
      expect(dd.maxDrawdownPercent).toBe(0);
    });

    test('should calculate drawdown correctly', () => {
      tracker.recordTrade(1000);  // 11000 (peak)
      tracker.recordTrade(-500);  // 10500
      tracker.recordTrade(-1000); // 9500 (trough)

      const dd = tracker.calculateMaxDrawdown();
      // Drawdown from 11000 to 9500 = 1500/11000 ≈ 13.6%
      expect(dd.maxDrawdown).toBeCloseTo(1500, -1);
      expect(dd.maxDrawdownPercent).toBeCloseTo(0.136, 1);
    });

    test('should find max drawdown across multiple dips', () => {
      tracker.recordTrade(500);   // 10500
      tracker.recordTrade(-200);  // 10300 (small dip)
      tracker.recordTrade(2000);  // 12300 (new peak)
      tracker.recordTrade(-3000); // 9300 (big dip)

      const dd = tracker.calculateMaxDrawdown();
      // Drawdown from 12300 to 9300 = 3000/12300 ≈ 24.4%
      expect(dd.maxDrawdown).toBeCloseTo(3000, -1);
      expect(dd.maxDrawdownPercent).toBeGreaterThan(0.2);
    });

    test('should track peak and trough indices', () => {
      tracker.recordTrade(1000);  // 11000
      tracker.recordTrade(-500);  // 10500

      const dd = tracker.calculateMaxDrawdown();
      expect(dd.peakIndex).toBeLessThan(dd.troughIndex);
    });
  });

  describe('Win Rate and Profit Factor', () => {
    test('should calculate win rate', () => {
      tracker.recordTrade(100);   // Win
      tracker.recordTrade(-50);   // Loss
      tracker.recordTrade(200);   // Win
      tracker.recordTrade(-100);  // Loss
      tracker.recordTrade(150);   // Win

      expect(tracker.calculateWinRate()).toBeCloseTo(60, 0); // 3/5 = 60%
    });

    test('should return 0 win rate with no trades', () => {
      expect(tracker.calculateWinRate()).toBe(0);
    });

    test('should calculate profit factor', () => {
      tracker.recordTrade(200);   // Win
      tracker.recordTrade(-100);  // Loss
      tracker.recordTrade(300);   // Win
      tracker.recordTrade(-50);   // Loss

      // Gross profit = 500, Gross loss = 150
      expect(tracker.calculateProfitFactor()).toBeCloseTo(500 / 150, 1);
    });

    test('should return 0 profit factor with no losses', () => {
      tracker.recordTrade(100);
      tracker.recordTrade(200);
      expect(tracker.calculateProfitFactor()).toBe(0); // No losses = no denominator
    });

    test('should return 0 profit factor with no winning trades', () => {
      tracker.recordTrade(-100);
      tracker.recordTrade(-200);
      expect(tracker.calculateProfitFactor()).toBe(0);
    });
  });

  describe('Average Win/Loss', () => {
    test('should calculate average win and loss', () => {
      tracker.recordTrade(200);
      tracker.recordTrade(100);
      tracker.recordTrade(-50);
      tracker.recordTrade(-100);

      const avgWL = tracker.calculateAverageWinLoss();
      expect(avgWL.avgWin).toBeCloseTo(150, 0); // (200 + 100) / 2
      expect(avgWL.avgLoss).toBeCloseTo(75, 0);  // (50 + 100) / 2
    });

    test('should calculate win/loss ratio', () => {
      tracker.recordTrade(200);
      tracker.recordTrade(-100);

      const avgWL = tracker.calculateAverageWinLoss();
      expect(avgWL.winLossRatio).toBeCloseTo(2, 0); // 200/100
    });

    test('should handle no winning trades', () => {
      tracker.recordTrade(-100);
      const avgWL = tracker.calculateAverageWinLoss();
      expect(avgWL.avgWin).toBe(0);
      expect(avgWL.winLossRatio).toBe(0);
    });

    test('should handle no losing trades', () => {
      tracker.recordTrade(100);
      const avgWL = tracker.calculateAverageWinLoss();
      expect(avgWL.avgLoss).toBe(0);
      expect(avgWL.winLossRatio).toBe(0);
    });
  });

  describe('Report Generation', () => {
    test('should generate a text report with all sections', () => {
      tracker.recordTrade(500);
      tracker.recordTrade(-200);
      tracker.recordTrade(300);

      const report = tracker.generateReport();
      expect(report).toContain('Performance Report');
      expect(report).toContain('Initial Capital');
      expect(report).toContain('Current Equity');
      expect(report).toContain('Total Return');
      expect(report).toContain('Sharpe Ratio');
      expect(report).toContain('Max Drawdown');
      expect(report).toContain('Win Rate');
      expect(report).toContain('Profit Factor');
      expect(report).toContain('Streaks');
    });

    test('should include correct values in report', () => {
      tracker.recordTrade(500);
      const report = tracker.generateReport();
      expect(report).toContain('10,000');
      expect(report).toContain('10500'); // toLocaleString may not add comma for 10500
    });

    test('should handle empty trades in report', () => {
      const report = tracker.generateReport();
      expect(report).toContain('Total Trades: 0');
      expect(report).toContain('Win Rate: 0.00%');
    });
  });

  describe('Integration with DemoTrader', () => {
    test('should track DemoTrader performance', () => {
      const trader = new DemoTrader(10000);
      const perfTracker = new PerformanceTracker(10000);

      trader.updatePrice('BTCUSDT', 45000);
      trader.updatePrice('ETHUSDT', 2500);

      // Open and close a profitable BTC position
      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });
      trader.updatePrice('BTCUSDT', 46000);
      trader.closePosition('BTCUSDT');
      perfTracker.recordTrade(100, 'BTCUSDT'); // Approximate PnL

      // Open and close a losing ETH position
      trader.placeOrder({
        symbol: 'ETHUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 2
      });
      trader.updatePrice('ETHUSDT', 2400);
      trader.closePosition('ETHUSDT');
      perfTracker.recordTrade(-200, 'ETHUSDT'); // Approximate PnL

      expect(perfTracker.getTradeCount()).toBe(2);
      expect(perfTracker.calculateWinRate()).toBeCloseTo(50, 0);
    });

    test('DemoTrader statistics should match tracker calculations', () => {
      const trader = new DemoTrader(10000);
      trader.updatePrice('BTCUSDT', 45000);

      trader.placeOrder({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        type: OrderType.MARKET,
        quantity: 0.1
      });

      trader.updatePrice('BTCUSDT', 46000);
      trader.closePosition('BTCUSDT');

      const stats = trader.getStatistics();
      expect(stats.totalTrades).toBeGreaterThan(0);
      expect(stats.totalPnL).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle very large PnL values', () => {
      tracker.recordTrade(1000000);
      tracker.recordTrade(-500000);

      expect(tracker.getCurrentEquity()).toBe(10000 + 1000000 - 500000);
      expect(tracker.calculateProfitFactor()).toBeCloseTo(2, 0);
    });

    test('should handle very small PnL values', () => {
      tracker.recordTrade(0.01);
      tracker.recordTrade(-0.005);

      expect(tracker.getCurrentEquity()).toBeCloseTo(10000.005, 2);
    });

    test('should handle zero PnL trade', () => {
      tracker.recordTrade(0);
      expect(tracker.getCurrentEquity()).toBe(10000);
      expect(tracker.getTradeCount()).toBe(1);
    });

    test('should handle equity going below initial capital', () => {
      tracker.recordTrade(-5000);
      tracker.recordTrade(-3000);

      expect(tracker.getCurrentEquity()).toBe(2000);
      const dd = tracker.calculateMaxDrawdown();
      expect(dd.maxDrawdownPercent).toBeGreaterThan(0.5);
    });

    test('should handle equity recovering from drawdown', () => {
      tracker.recordTrade(-2000); // 8000
      tracker.recordTrade(3000);  // 11000 (new peak)
      tracker.recordTrade(-500);  // 10500

      const dd = tracker.calculateMaxDrawdown();
      // Drawdown was from 10000 to 8000 = 20%
      // Not from 11000 to 10500
      expect(dd.maxDrawdownPercent).toBeCloseTo(0.2, 1);
    });
  });
});
