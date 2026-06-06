/**
 * Backtesting Engine for Mantle AI Trading Bot
 * Simulates trading strategies on historical data
 */

import {
  BacktestConfig,
  BacktestResult,
  BacktestSession,
  PerformanceMetrics,
  Signal,
  TradeAction,
  OrderType,
  MarketDataPoint,
  TimeFrame
} from '../core/types';
import { signalEngine } from '../signals/signal-engine';

export class BacktestEngine {
  private trades: BacktestResult[] = [];
  private equityCurve: number[] = [];
  private currentCapital: number = 0;

  /**
   * Run a backtest session
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestSession> {
    const session: BacktestSession = {
      id: `backtest-${Date.now()}`,
      name: config.name,
      symbol: config.symbol,
      startDate: config.startDate,
      endDate: config.endDate,
      initialCapital: config.initialCapital,
      totalTrades: 0,
      status: 'RUNNING',
      results: []
    };

    this.trades = [];
    this.equityCurve = [];
    this.currentCapital = config.initialCapital;

    try {
      // Generate simulated historical data (in production, fetch from API)
      const historicalData = await this.generateHistoricalData(
        config.symbol,
        config.startDate,
        config.endDate
      );

      // Process each data point
      for (let i = 50; i < historicalData.length; i++) {
        const windowData = historicalData.slice(0, i);
        const currentPrice = historicalData[i].close;

        // Generate signal
        const signalOutput = await signalEngine.generateSignal({
          symbol: config.symbol,
          timeframe: TimeFrame.ONE_HOUR,
          marketData: windowData,
          newsArticles: []
        });

        // Check if we should trade
        if (signalOutput.signal.action !== TradeAction.HOLD) {
          await this.processSignal(
            signalOutput.signal,
            currentPrice,
            config,
            historicalData.slice(i)
          );
        }

        // Update equity curve
        this.equityCurve.push(this.currentCapital);
      }

      // Calculate final metrics
      const metrics = this.calculatePerformanceMetrics(
        config.initialCapital,
        this.currentCapital
      );

      // Update session with results
      session.status = 'COMPLETED';
      session.finalCapital = this.currentCapital;
      session.totalTrades = this.trades.length;
      session.winRate = metrics.winRate;
      session.maxDrawdown = metrics.maxDrawdown;
      session.sharpeRatio = metrics.sharpeRatio;
      session.results = this.trades;

      return session;
    } catch (error) {
      session.status = 'FAILED';
      console.error('Backtest failed:', error);
      return session;
    }
  }

  /**
   * Process a trading signal in backtest
   */
  private async processSignal(
    signal: Omit<Signal, 'id' | 'createdAt' | 'updatedAt'>,
    currentPrice: number,
    config: BacktestConfig,
    futureData: MarketDataPoint[]
  ): Promise<void> {
    // Calculate position size
    const riskPerTrade = config.parameters.riskPerTrade || 0.02; // 2% risk
    const maxPosition = this.currentCapital * riskPerTrade;
    const quantity = maxPosition / currentPrice;

    // Apply slippage
    const slippage = config.slippage || 0.001;
    const entryPrice = signal.action === TradeAction.BUY
      ? currentPrice * (1 + slippage)
      : currentPrice * (1 - slippage);

    // Find exit point
    let exitPrice: number | undefined;
    let exitTime: Date | undefined;
    let exitReason = 'Manual';

    const stopLoss = signal.stopLoss || entryPrice * 0.95;
    const takeProfit = signal.takeProfit || entryPrice * 1.05;

    for (const dataPoint of futureData) {
      const high = dataPoint.high;
      const low = dataPoint.low;

      // Check stop loss
      if (signal.action === TradeAction.BUY && low <= stopLoss) {
        exitPrice = stopLoss * (1 - slippage);
        exitTime = dataPoint.timestamp;
        exitReason = 'Stop Loss';
        break;
      }

      if (signal.action === TradeAction.SELL && high >= stopLoss) {
        exitPrice = stopLoss * (1 + slippage);
        exitTime = dataPoint.timestamp;
        exitReason = 'Stop Loss';
        break;
      }

      // Check take profit
      if (signal.action === TradeAction.BUY && high >= takeProfit) {
        exitPrice = takeProfit * (1 - slippage);
        exitTime = dataPoint.timestamp;
        exitReason = 'Take Profit';
        break;
      }

      if (signal.action === TradeAction.SELL && low <= takeProfit) {
        exitPrice = takeProfit * (1 + slippage);
        exitTime = dataPoint.timestamp;
        exitReason = 'Take Profit';
        break;
      }
    }

    // If no exit found, close at last price
    if (!exitPrice && futureData.length > 0) {
      const lastCandle = futureData[futureData.length - 1];
      exitPrice = lastCandle.close;
      exitTime = lastCandle.timestamp;
      exitReason = 'End of Period';
    }

    // Calculate PnL
    if (exitPrice) {
      const fees = config.fees || 0.001;
      const feeAmount = (entryPrice * quantity * fees) + (exitPrice * quantity * fees);

      let pnl: number;
      if (signal.action === TradeAction.BUY) {
        pnl = (exitPrice - entryPrice) * quantity - feeAmount;
      } else {
        pnl = (entryPrice - exitPrice) * quantity - feeAmount;
      }

      const pnlPercent = pnl / (entryPrice * quantity);

      // Update capital
      this.currentCapital += pnl;

      // Record trade
      this.trades.push({
        id: `trade-${this.trades.length}`,
        sessionId: '',
        symbol: signal.symbol,
        action: signal.action,
        entryPrice,
        exitPrice,
        quantity,
        pnl,
        pnlPercent,
        executedAt: new Date(),
        closedAt: exitTime,
        notes: exitReason
      });
    }
  }

  /**
   * Generate simulated historical data
   * In production, this would fetch real data from Bybit API
   */
  private async generateHistoricalData(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<MarketDataPoint[]> {
    const data: MarketDataPoint[] = [];
    const start = startDate.getTime();
    const end = endDate.getTime();
    const hour = 60 * 60 * 1000;

    // Generate realistic price movements
    let price = 40000 + Math.random() * 10000; // Starting price

    for (let timestamp = start; timestamp <= end; timestamp += hour) {
      // Random walk with drift
      const change = (Math.random() - 0.48) * price * 0.02; // Slight upward bias
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random() * Math.abs(change) * 0.5;
      const low = Math.min(open, close) - Math.random() * Math.abs(change) * 0.5;
      const volume = 1000 + Math.random() * 5000;

      data.push({
        symbol,
        timeframe: TimeFrame.ONE_HOUR,
        timestamp: new Date(timestamp),
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

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(
    initialCapital: number,
    finalCapital: number
  ): PerformanceMetrics {
    const winningTrades = this.trades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = this.trades.filter(t => (t.pnl || 0) <= 0);

    const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;

    // Calculate annualized return (assuming 365 days)
    const days = 365;
    const annualizedReturn = ((Math.pow(finalCapital / initialCapital, 365 / days) - 1) * 100);

    // Calculate Sharpe Ratio
    const returns = this.trades.map(t => t.pnlPercent || 0);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length || 0;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    ) || 0;
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    // Calculate Sortino Ratio (downside deviation)
    const downsideReturns = returns.filter(r => r < 0);
    const downsideDev = Math.sqrt(
      downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
    ) || 0;
    const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(252) : 0;

    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = this.equityCurve[0] || initialCapital;
    
    for (const equity of this.equityCurve) {
      if (equity > peak) {
        peak = equity;
      }
      const drawdown = (peak - equity) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Win rate
    const winRate = this.trades.length > 0 
      ? winningTrades.length / this.trades.length 
      : 0;

    // Profit factor
    const grossProfit = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    // Average win/loss
    const averageWin = winningTrades.length > 0
      ? grossProfit / winningTrades.length
      : 0;
    const averageLoss = losingTrades.length > 0
      ? grossLoss / losingTrades.length
      : 0;

    return {
      totalReturn,
      annualizedReturn,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown: maxDrawdown * 100,
      winRate: winRate * 100,
      profitFactor,
      averageWin,
      averageLoss,
      totalTrades: this.trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length
    };
  }

  /**
   * Optimize strategy parameters
   */
  async optimizeStrategy(
    symbol: string,
    startDate: Date,
    endDate: Date,
    parameterRanges: Record<string, number[]>
  ): Promise<{
    bestParameters: Record<string, number>;
    bestPerformance: PerformanceMetrics;
    allResults: Array<{ parameters: Record<string, number>; metrics: PerformanceMetrics }>;
  }> {
    const results: Array<{ parameters: Record<string, number>; metrics: PerformanceMetrics }> = [];

    // Generate all parameter combinations
    const combinations = this.generateCombinations(parameterRanges);

    for (const params of combinations) {
      const config: BacktestConfig = {
        name: `Optimization ${JSON.stringify(params)}`,
        symbol,
        startDate,
        endDate,
        initialCapital: 10000,
        strategy: 'default',
        parameters: params,
        fees: 0.001,
        slippage: 0.001
      };

      const session = await this.runBacktest(config);
      
      if (session.status === 'COMPLETED') {
        const metrics = this.calculatePerformanceMetrics(
          config.initialCapital,
          session.finalCapital || config.initialCapital
        );

        results.push({ parameters: params, metrics });
      }
    }

    // Sort by Sharpe ratio
    results.sort((a, b) => b.metrics.sharpeRatio - a.metrics.sharpeRatio);

    return {
      bestParameters: results[0]?.parameters || {},
      bestPerformance: results[0]?.metrics || this.getEmptyMetrics(),
      allResults: results
    };
  }

  /**
   * Generate parameter combinations
   */
  private generateCombinations(
    ranges: Record<string, number[]>
  ): Record<string, number>[] {
    const keys = Object.keys(ranges);
    if (keys.length === 0) return [{}];

    const result: Record<string, number>[] = [];
    const [firstKey, ...restKeys] = keys;

    for (const value of ranges[firstKey]) {
      const restCombinations = this.generateCombinations(
        Object.fromEntries(restKeys.map(k => [k, ranges[k]]))
      );

      for (const rest of restCombinations) {
        result.push({ [firstKey]: value, ...rest });
      }
    }

    return result;
  }

  /**
   * Get empty metrics
   */
  private getEmptyMetrics(): PerformanceMetrics {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdown: 0,
      winRate: 0,
      profitFactor: 0,
      averageWin: 0,
      averageLoss: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0
    };
  }

  /**
   * Generate backtest report
   */
  generateReport(session: BacktestSession): string {
    const metrics = this.calculatePerformanceMetrics(
      session.initialCapital,
      session.finalCapital || session.initialCapital
    );

    return `
# Backtest Report: ${session.name}

## Summary
- Symbol: ${session.symbol}
- Period: ${session.startDate.toDateString()} - ${session.endDate.toDateString()}
- Initial Capital: $${session.initialCapital.toLocaleString()}
- Final Capital: $${(session.finalCapital || session.initialCapital).toLocaleString()}

## Performance Metrics
- Total Return: ${metrics.totalReturn.toFixed(2)}%
- Annualized Return: ${metrics.annualizedReturn.toFixed(2)}%
- Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}
- Sortino Ratio: ${metrics.sortinoRatio.toFixed(2)}
- Max Drawdown: ${metrics.maxDrawdown.toFixed(2)}%
- Win Rate: ${metrics.winRate.toFixed(2)}%
- Profit Factor: ${metrics.profitFactor.toFixed(2)}

## Trade Statistics
- Total Trades: ${metrics.totalTrades}
- Winning Trades: ${metrics.winningTrades}
- Losing Trades: ${metrics.losingTrades}
- Average Win: $${metrics.averageWin.toFixed(2)}
- Average Loss: $${metrics.averageLoss.toFixed(2)}
    `.trim();
  }
}

// Export singleton
export const backtestEngine = new BacktestEngine();
