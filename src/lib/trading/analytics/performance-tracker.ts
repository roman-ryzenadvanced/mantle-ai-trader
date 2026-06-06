/**
 * Performance Analytics Module for Mantle AI Trading Bot
 * Tracks trading performance, calculates metrics, and generates reports
 */

export interface TradeRecord {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: number;
  pnl: number;
  pnlPercent: number;
  fees: number;
  openedAt: Date;
  closedAt: Date;
  signalId?: string;
}

export interface EquityPoint {
  timestamp: Date;
  value: number;
  cashBalance: number;
  unrealizedPnL: number;
}

export interface StreakInfo {
  currentStreak: number;
  currentType: 'win' | 'loss' | 'none';
  longestWinStreak: number;
  longestLossStreak: number;
}

export interface PerformanceReport {
  generatedAt: Date;
  period: { start: Date; end: Date };
  summary: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnL: number;
    totalFees: number;
    netPnL: number;
  };
  metrics: {
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    profitFactor: number;
    averageWin: number;
    averageLoss: number;
    avgWinLossRatio: number;
    expectancy: number;
  };
  streaks: StreakInfo;
  bestTrade: TradeRecord | null;
  worstTrade: TradeRecord | null;
  equityCurveStats: {
    startValue: number;
    endValue: number;
    peakValue: number;
    troughValue: number;
    totalReturn: number;
  };
}

export class PerformanceTracker {
  private trades: TradeRecord[] = [];
  private equityCurve: EquityPoint[] = [];
  private initialValue: number;

  constructor(initialValue: number = 10000) {
    this.initialValue = initialValue;
    this.addEquityPoint(initialValue, initialValue, 0);
  }

  /**
   * Record a completed trade
   */
  recordTrade(trade: TradeRecord): void {
    this.trades.push(trade);
  }

  /**
   * Add a point to the equity curve
   */
  addEquityPoint(totalValue: number, cashBalance: number, unrealizedPnL: number): void {
    this.equityCurve.push({
      timestamp: new Date(),
      value: totalValue,
      cashBalance,
      unrealizedPnL
    });
  }

  /**
   * Calculate rolling Sharpe ratio
   */
  calculateRollingSharpe(window: number = 20): number {
    if (this.trades.length < 2) return 0;

    const recentTrades = this.trades.slice(-window);
    const returns = recentTrades.map(t => t.pnlPercent);

    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;
    return (avgReturn / stdDev) * Math.sqrt(252); // Annualized
  }

  /**
   * Calculate Sortino ratio (downside deviation only)
   */
  calculateSortinoRatio(window: number = 20): number {
    if (this.trades.length < 2) return 0;

    const recentTrades = this.trades.slice(-window);
    const returns = recentTrades.map(t => t.pnlPercent);

    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downsideReturns = returns.filter(r => r < 0);

    if (downsideReturns.length < 2) return avgReturn > 0 ? Infinity : 0;

    const downsideDev = Math.sqrt(
      downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / (downsideReturns.length - 1)
    );

    if (downsideDev === 0) return 0;
    return (avgReturn / downsideDev) * Math.sqrt(252);
  }

  /**
   * Track win/loss streaks
   */
  getStreakInfo(): StreakInfo {
    let currentStreak = 0;
    let currentType: 'win' | 'loss' | 'none' = 'none';
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let winStreak = 0;
    let lossStreak = 0;

    for (const trade of this.trades) {
      if (trade.pnl > 0) {
        winStreak++;
        lossStreak = 0;
        longestWinStreak = Math.max(longestWinStreak, winStreak);
      } else if (trade.pnl < 0) {
        lossStreak++;
        winStreak = 0;
        longestLossStreak = Math.max(longestLossStreak, lossStreak);
      } else {
        winStreak = 0;
        lossStreak = 0;
      }
    }

    // Determine current streak
    if (this.trades.length > 0) {
      const lastTrade = this.trades[this.trades.length - 1];
      if (lastTrade.pnl > 0) {
        currentType = 'win';
        // Count backwards
        for (let i = this.trades.length - 1; i >= 0; i--) {
          if (this.trades[i].pnl > 0) currentStreak++;
          else break;
        }
      } else if (lastTrade.pnl < 0) {
        currentType = 'loss';
        for (let i = this.trades.length - 1; i >= 0; i--) {
          if (this.trades[i].pnl < 0) currentStreak++;
          else break;
        }
      }
    }

    return { currentStreak, currentType, longestWinStreak, longestLossStreak };
  }

  /**
   * Calculate max drawdown from equity curve
   */
  calculateMaxDrawdown(): number {
    if (this.equityCurve.length === 0) return 0;

    let maxDrawdown = 0;
    let peak = this.equityCurve[0].value;

    for (const point of this.equityCurve) {
      if (point.value > peak) peak = point.value;
      if (peak > 0) {
        const drawdown = ((peak - point.value) / peak) * 100;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Find peak and trough in equity curve
   */
  findPeakAndTrough(): { peak: number; peakTime: Date; trough: number; troughTime: Date } {
    let peak = -Infinity;
    let trough = Infinity;
    let peakTime = new Date();
    let troughTime = new Date();

    for (const point of this.equityCurve) {
      if (point.value > peak) {
        peak = point.value;
        peakTime = point.timestamp;
      }
      if (point.value < trough) {
        trough = point.value;
        troughTime = point.timestamp;
      }
    }

    return { peak, peakTime, trough, troughTime };
  }

  /**
   * Get best trade
   */
  getBestTrade(): TradeRecord | null {
    if (this.trades.length === 0) return null;
    return this.trades.reduce((best, trade) =>
      trade.pnl > (best?.pnl ?? -Infinity) ? trade : best, null as TradeRecord | null
    );
  }

  /**
   * Get worst trade
   */
  getWorstTrade(): TradeRecord | null {
    if (this.trades.length === 0) return null;
    return this.trades.reduce((worst, trade) =>
      trade.pnl < (worst?.pnl ?? Infinity) ? trade : worst, null as TradeRecord | null
    );
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
   * Calculate expectancy (average $ per trade)
   */
  calculateExpectancy(): number {
    if (this.trades.length === 0) return 0;
    const totalPnL = this.trades.reduce((sum, t) => sum + t.pnl, 0);
    return totalPnL / this.trades.length;
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport(): PerformanceReport {
    const winningTrades = this.trades.filter(t => t.pnl > 0);
    const losingTrades = this.trades.filter(t => t.pnl < 0);
    const totalPnL = this.trades.reduce((sum, t) => sum + t.pnl, 0);
    const totalFees = this.trades.reduce((sum, t) => sum + t.fees, 0);
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.pnl, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0) / losingTrades.length) : 0;

    const { peak, trough } = this.findPeakAndTrough();

    return {
      generatedAt: new Date(),
      period: {
        start: this.equityCurve[0]?.timestamp || new Date(),
        end: this.equityCurve[this.equityCurve.length - 1]?.timestamp || new Date()
      },
      summary: {
        totalTrades: this.trades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: this.trades.length > 0 ? (winningTrades.length / this.trades.length) * 100 : 0,
        totalPnL,
        totalFees,
        netPnL: totalPnL - totalFees
      },
      metrics: {
        sharpeRatio: this.calculateRollingSharpe(),
        sortinoRatio: this.calculateSortinoRatio(),
        maxDrawdown: this.calculateMaxDrawdown(),
        profitFactor: this.calculateProfitFactor(),
        averageWin: avgWin,
        averageLoss: avgLoss,
        avgWinLossRatio: avgLoss > 0 ? avgWin / avgLoss : 0,
        expectancy: this.calculateExpectancy()
      },
      streaks: this.getStreakInfo(),
      bestTrade: this.getBestTrade(),
      worstTrade: this.getWorstTrade(),
      equityCurveStats: {
        startValue: this.initialValue,
        endValue: this.equityCurve[this.equityCurve.length - 1]?.value || this.initialValue,
        peakValue: peak,
        troughValue: trough,
        totalReturn: this.initialValue > 0
          ? (((this.equityCurve[this.equityCurve.length - 1]?.value || this.initialValue) - this.initialValue) / this.initialValue) * 100
          : 0
      }
    };
  }

  /**
   * Export equity curve as JSON
   */
  exportEquityCurve(): string {
    return JSON.stringify(this.equityCurve.map(p => ({
      timestamp: p.timestamp.toISOString(),
      value: p.value,
      cashBalance: p.cashBalance,
      unrealizedPnL: p.unrealizedPnL
    })));
  }

  /**
   * Export all trades as JSON
   */
  exportTrades(): string {
    return JSON.stringify(this.trades.map(t => ({
      ...t,
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt.toISOString()
    })));
  }

  /**
   * Get all trades
   */
  getTrades(): TradeRecord[] {
    return [...this.trades];
  }

  /**
   * Get equity curve
   */
  getEquityCurve(): EquityPoint[] {
    return [...this.equityCurve];
  }

  /**
   * Reset tracker
   */
  reset(initialValue: number = 10000): void {
    this.trades = [];
    this.equityCurve = [];
    this.initialValue = initialValue;
    this.addEquityPoint(initialValue, initialValue, 0);
  }
}

// Export singleton
export const performanceTracker = new PerformanceTracker();
