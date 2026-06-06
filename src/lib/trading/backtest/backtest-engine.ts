/**
 * Backtesting Engine for Mantle AI Trading Bot
 * Simulates trading strategies on historical data
 * 
 * v2.0.0 - Fixed: State leakage between runs, performance metrics calculation,
 * added trade cooldown, proper Sharpe/Sortino calculation
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
  /**
   * Run a backtest session
   * Fixed: No longer uses mutable instance state - all state is local to prevent leakage
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

    // QA-FIX #7: Calculate the actual period in days for annualized return
    const periodDays = Math.max(1, (config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Local state - prevents leakage between concurrent runs
    let trades: BacktestResult[] = [];
    let equityCurve: number[] = [];
    let currentCapital = config.initialCapital;
    const cooldownPeriod = (config.parameters.cooldownCandles as number) || 10;
    let lastTradeIndex = -cooldownPeriod; // Prevent overtrading

    try {
      // Generate simulated historical data (in production, fetch from API)
      const historicalData = await this.generateHistoricalData(
        config.symbol,
        config.startDate,
        config.endDate
      );

      // Process each data point with a sliding window
      for (let i = 50; i < historicalData.length; i++) {
        const windowData = historicalData.slice(Math.max(0, i - 200), i);
        const currentPrice = historicalData[i].close;

        // Only consider trading if we haven't traded too recently (cooldown)
        if (i - lastTradeIndex >= cooldownPeriod) {
          // Generate signal
          const signalOutput = await signalEngine.generateSignal({
            symbol: config.symbol,
            timeframe: TimeFrame.ONE_HOUR,
            marketData: windowData,
            newsArticles: []
          });

          // Check if we should trade - require high confidence
          if (signalOutput.signal.action !== TradeAction.HOLD && signalOutput.signal.confidence > 0.3) {
            const tradeResult = this.processSignal(
              signalOutput.signal,
              currentPrice,
              config,
              historicalData.slice(i),
              currentCapital
            );

            if (tradeResult) {
              trades.push(tradeResult);
              currentCapital += (tradeResult.pnl || 0);
              lastTradeIndex = i;
            }
          }
        }

        // Update equity curve
        equityCurve.push(currentCapital);
      }

      // Calculate final metrics
      // QA-FIX #7: Pass periodDays to calculatePerformanceMetrics for proper annualization
      const metrics = this.calculatePerformanceMetrics(
        config.initialCapital,
        currentCapital,
        trades,
        equityCurve,
        periodDays
      );

      // Update session with results
      session.status = 'COMPLETED';
      session.finalCapital = currentCapital;
      session.totalTrades = trades.length;
      session.winRate = metrics.winRate;
      session.maxDrawdown = metrics.maxDrawdown;
      session.sharpeRatio = metrics.sharpeRatio;
      session.results = trades;

      return session;
    } catch (error) {
      session.status = 'FAILED';
      console.error('Backtest failed:', error);
      return session;
    }
  }

  /**
   * Process a trading signal in backtest
   * Fixed: Now returns a result instead of mutating shared state
   */
  private processSignal(
    signal: Omit<Signal, 'id' | 'createdAt' | 'updatedAt'>,
    currentPrice: number,
    config: BacktestConfig,
    futureData: MarketDataPoint[],
    currentCapital: number = 10000
  ): BacktestResult | null {
    if (currentPrice <= 0) return null;

    // Calculate position size based on current capital and risk
    const riskPerTrade = (config.parameters.riskPerTrade as number) || 0.02;
    const stopLossPrice = signal.stopLoss || currentPrice * 0.95;
    const stopDistance = Math.abs(currentPrice - stopLossPrice);
    // Risk-based position sizing: risk amount / stop distance = position size
    // This ensures each trade risks exactly riskPerTrade % of capital
    const riskAmount = currentCapital * riskPerTrade;
    const quantity = stopDistance > 0 
      ? Math.min(riskAmount / stopDistance, (currentCapital * 0.5) / currentPrice) // Cap at 50% of capital
      : (currentCapital * riskPerTrade * 0.1) / currentPrice; // Fallback: small position

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

    // Limit how far into the future we look for exit (max 100 candles)
    const maxLookAhead = Math.min(futureData.length, 100);

    for (let j = 0; j < maxLookAhead; j++) {
      const dataPoint = futureData[j];
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
      const lastCandle = futureData[Math.min(futureData.length - 1, maxLookAhead - 1)];
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

      const pnlPercent = entryPrice > 0 ? pnl / (entryPrice * quantity) : 0;

      return {
        id: `trade-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
      };
    }

    return null;
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
    const basePrices: Record<string, number> = {
      BTCUSDT: 45000, ETHUSDT: 2500, SOLUSDT: 100,
      BNBUSDT: 300, XRPUSDT: 0.5
    };
    let price = basePrices[symbol] || 100;

    // Use a seeded random for more consistent results
    let seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const seededRandom = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let timestamp = start; timestamp <= end; timestamp += hour) {
      // Random walk with drift
      const change = (seededRandom() - 0.48) * price * 0.02; // Slight upward bias
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + seededRandom() * Math.abs(change) * 0.5;
      const low = Math.min(open, close) - seededRandom() * Math.abs(change) * 0.5;
      const volume = 1000 + seededRandom() * 5000;

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
   * Fixed: Now takes trades and equity curve as parameters (no shared state)
   * QA-FIX #7: Added periodDays parameter for correct annualized return calculation.
   * The original formula `Math.pow(final/initial, 365/365)` simplifies to just `final/initial`,
   * making annualization meaningless. Now uses actual period for compounding.
   */
  private calculatePerformanceMetrics(
    initialCapital: number,
    finalCapital: number,
    trades: BacktestResult[],
    equityCurve: number[],
    periodDays: number = 365
  ): PerformanceMetrics {
    const winningTrades = trades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = trades.filter(t => (t.pnl || 0) <= 0);

    const totalReturn = initialCapital > 0 
      ? ((finalCapital - initialCapital) / initialCapital) * 100 
      : 0;

    // QA-FIX #7: Calculate annualized return using the actual period
    // Original formula Math.pow(final/initial, 365/365) always equals final/initial (useless).
    // Correct formula: ((final/initial) ^ (365/periodDays)) - 1
    const annualizedReturn = initialCapital > 0 && periodDays > 0
      ? ((Math.pow(finalCapital / initialCapital, 365 / periodDays) - 1) * 100) 
      : 0;

    // Calculate Sharpe Ratio from trade returns
    const returns = trades.map(t => t.pnlPercent || 0);
    const avgReturn = returns.length > 0 
      ? returns.reduce((a, b) => a + b, 0) / returns.length 
      : 0;
    const stdDev = returns.length > 1
      ? Math.sqrt(
          returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)
        )
      : 0;
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    // Calculate Sortino Ratio (downside deviation only)
    const downsideReturns = returns.filter(r => r < 0);
    const downsideDev = downsideReturns.length > 1
      ? Math.sqrt(
          downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / (downsideReturns.length - 1)
        )
      : 0;
    const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(252) : 0;

    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = equityCurve[0] || initialCapital;
    
    for (const equity of equityCurve) {
      if (equity > peak) {
        peak = equity;
      }
      if (peak > 0) {
        const drawdown = (peak - equity) / peak;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }

    // Win rate
    const winRate = trades.length > 0 
      ? (winningTrades.length / trades.length) * 100
      : 0;

    // Profit factor
    const grossProfit = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

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
      winRate,
      profitFactor,
      averageWin,
      averageLoss,
      totalTrades: trades.length,
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

      try {
        const session = await this.runBacktest(config);
        
        if (session.status === 'COMPLETED') {
          // QA-FIX #7: Pass periodDays for proper annualization in optimization
          const optPeriodDays = Math.max(1, (config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24));
          const metrics = this.calculatePerformanceMetrics(
            config.initialCapital,
            session.finalCapital || config.initialCapital,
            session.results,
            [],
            optPeriodDays
          );

          results.push({ parameters: params, metrics });
        }
      } catch (error) {
        console.error('Optimization run failed:', error);
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
    const initialCapital = session.initialCapital;
    const finalCapital = session.finalCapital || initialCapital;
    // QA-FIX #7: Pass periodDays for proper annualization in report generation
    const reportPeriodDays = Math.max(1, (session.endDate.getTime() - session.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const metrics = this.calculatePerformanceMetrics(
      initialCapital,
      finalCapital,
      session.results,
      [],
      reportPeriodDays
    );

    return `
# Backtest Report: ${session.name}

## Summary
- Symbol: ${session.symbol}
- Period: ${session.startDate.toDateString()} - ${session.endDate.toDateString()}
- Initial Capital: $${session.initialCapital.toLocaleString()}
- Final Capital: $${finalCapital.toLocaleString()}

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
