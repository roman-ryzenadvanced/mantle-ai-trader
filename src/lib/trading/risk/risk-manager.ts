/**
 * Risk Management Module for Mantle AI Trading Bot
 * Provides position sizing, drawdown protection, and portfolio-level risk controls
 */

import {
  RiskLevel,
  Position,
  Portfolio,
  TradeAction,
  Signal
} from '../core/types';

export interface RiskConfig {
  maxDrawdownPercent: number;      // Max drawdown before auto-stop (default: 20%)
  dailyLossLimitPercent: number;    // Max daily loss before halt (default: 5%)
  riskPerTrade: number;             // Risk per trade as % of portfolio (default: 2%)
  maxOpenPositions: number;         // Maximum concurrent positions (default: 5)
  maxPortfolioRisk: number;         // Max total portfolio risk score (default: 0.8)
  maxCorrelation: number;           // Max correlation between positions (default: 0.7)
  marginCallThreshold: number;      // Margin ratio threshold for margin call (default: 0.5)
}

export interface RiskAssessmentResult {
  allowed: boolean;
  reason?: string;
  suggestedSize: number;
  riskScore: number;
  portfolioRisk: number;
}

export class RiskManager {
  private config: RiskConfig;
  private dailyPnL: number;
  private dailyStartValue: number;
  private lastResetDate: string;
  private tradingHalted: boolean;
  private haltReason: string | null;

  constructor(config?: Partial<RiskConfig>) {
    // Merge with defaults
    this.config = {
      maxDrawdownPercent: 20,
      dailyLossLimitPercent: 5,
      riskPerTrade: 2,
      maxOpenPositions: 5,
      maxPortfolioRisk: 0.8,
      maxCorrelation: 0.7,
      marginCallThreshold: 0.5,
      ...config
    };
    this.dailyPnL = 0;
    this.dailyStartValue = 0;
    this.lastResetDate = '';
    this.tradingHalted = false;
    this.haltReason = null;
  }

  /**
   * Calculate position size based on risk parameters
   * Uses fixed-fractional position sizing with Kelly Criterion influence
   */
  calculatePositionSize(params: {
    portfolioValue: number;
    entryPrice: number;
    stopLossPrice: number;
    confidence: number;
    riskLevel: RiskLevel;
  }): number {
    // Validate inputs
    if (params.portfolioValue <= 0 || params.entryPrice <= 0) return 0;
    if (params.stopLossPrice <= 0 || params.stopLossPrice >= params.entryPrice) return 0;
    
    // Risk amount based on portfolio value and risk per trade
    const riskPercent = this.config.riskPerTrade / 100;
    const riskAmount = params.portfolioValue * riskPercent;
    
    // Adjust by confidence (0.5-1.5x)
    const confidenceMultiplier = 0.5 + params.confidence;
    
    // Adjust by risk level
    const riskLevelMultiplier = params.riskLevel === RiskLevel.CONSERVATIVE ? 0.5 :
                                 params.riskLevel === RiskLevel.AGGRESSIVE ? 1.5 : 1.0;
    
    // Risk per unit
    const riskPerUnit = Math.abs(params.entryPrice - params.stopLossPrice);
    if (riskPerUnit === 0) return 0;
    
    // Position size
    const size = (riskAmount * confidenceMultiplier * riskLevelMultiplier) / riskPerUnit;
    
    return Math.max(0, size);
  }

  /**
   * Assess whether a new trade is allowed based on portfolio risk
   */
  assessTradeRisk(params: {
    signal: Signal;
    portfolio: Portfolio;
    openPositions: Position[];
    currentDrawdown: number;
  }): RiskAssessmentResult {
    // Check if trading is halted
    if (this.tradingHalted) {
      return {
        allowed: false,
        reason: `Trading halted: ${this.haltReason}`,
        suggestedSize: 0,
        riskScore: 1,
        portfolioRisk: this.calculatePortfolioRisk(params.openPositions)
      };
    }

    // Check daily loss limit
    if (this.isDailyLossLimitExceeded(params.portfolio)) {
      return {
        allowed: false,
        reason: `Daily loss limit exceeded (${this.config.dailyLossLimitPercent}%)`,
        suggestedSize: 0,
        riskScore: 1,
        portfolioRisk: this.calculatePortfolioRisk(params.openPositions)
      };
    }

    // Check max drawdown
    if (params.currentDrawdown >= this.config.maxDrawdownPercent) {
      this.haltTrading(`Max drawdown reached: ${params.currentDrawdown.toFixed(1)}%`);
      return {
        allowed: false,
        reason: `Max drawdown reached: ${params.currentDrawdown.toFixed(1)}%`,
        suggestedSize: 0,
        riskScore: 1,
        portfolioRisk: this.calculatePortfolioRisk(params.openPositions)
      };
    }

    // Check max open positions
    if (params.openPositions.length >= this.config.maxOpenPositions) {
      return {
        allowed: false,
        reason: `Max open positions reached (${this.config.maxOpenPositions})`,
        suggestedSize: 0,
        riskScore: 0.8,
        portfolioRisk: this.calculatePortfolioRisk(params.openPositions)
      };
    }

    // Calculate portfolio risk
    const portfolioRisk = this.calculatePortfolioRisk(params.openPositions);
    if (portfolioRisk >= this.config.maxPortfolioRisk) {
      return {
        allowed: false,
        reason: `Portfolio risk too high: ${(portfolioRisk * 100).toFixed(1)}%`,
        suggestedSize: 0,
        riskScore: portfolioRisk,
        portfolioRisk
      };
    }

    // Calculate suggested position size
    const currentPrice = params.signal.priceTarget || params.signal.stopLoss || 0;
    const stopLoss = params.signal.stopLoss || currentPrice * 0.95;
    
    const suggestedSize = this.calculatePositionSize({
      portfolioValue: params.portfolio.totalValue,
      entryPrice: currentPrice || 1,
      stopLossPrice: stopLoss,
      confidence: params.signal.confidence,
      riskLevel: params.signal.confidence > 0.7 ? RiskLevel.AGGRESSIVE :
                 params.signal.confidence < 0.4 ? RiskLevel.CONSERVATIVE : RiskLevel.MODERATE
    });

    // Calculate individual trade risk score
    const riskScore = this.calculateTradeRiskScore(params.signal, params.openPositions);

    return {
      allowed: riskScore < this.config.maxPortfolioRisk,
      reason: riskScore >= this.config.maxPortfolioRisk ? 'Trade risk too high' : undefined,
      suggestedSize,
      riskScore,
      portfolioRisk
    };
  }

  /**
   * Calculate risk score for a potential trade (0-1)
   */
  calculateTradeRiskScore(signal: Signal, openPositions: Position[]): number {
    let riskScore = 0.3; // Base risk

    // Confidence adjustment
    riskScore -= signal.confidence * 0.15; // Higher confidence = lower risk

    // Position concentration
    const sameSymbolPositions = openPositions.filter(p => p.symbol === signal.symbol);
    if (sameSymbolPositions.length > 0) {
      riskScore += 0.2; // Concentration risk
    }

    // Same side positions
    const sameDirectionPositions = openPositions.filter(p => 
      (p.side === 'LONG' && signal.action === TradeAction.BUY) ||
      (p.side === 'SHORT' && signal.action === TradeAction.SELL)
    );
    riskScore += sameDirectionPositions.length * 0.05;

    // Leverage risk
    if (sameSymbolPositions.some(p => p.leverage > 1)) {
      riskScore += 0.1;
    }

    return Math.max(0, Math.min(1, riskScore));
  }

  /**
   * Calculate overall portfolio risk score (0-1)
   */
  calculatePortfolioRisk(positions: Position[]): number {
    if (positions.length === 0) return 0;

    let totalRisk = 0;

    positions.forEach(position => {
      let positionRisk = 0.2; // Base risk per position

      // Leverage increases risk
      positionRisk += (position.leverage - 1) * 0.05;

      // Large unrealized losses increase risk
      if (position.unrealizedPnL < 0) {
        positionRisk += Math.min(Math.abs(position.unrealizedPnLPercent) / 100, 0.3);
      }

      totalRisk += positionRisk;
    });

    // Normalize by number of positions
    const avgRisk = totalRisk / positions.length;

    // More positions = more risk (but diminishing)
    const concentrationRisk = 1 - (1 / (1 + positions.length * 0.15));

    return Math.min(avgRisk * 0.6 + concentrationRisk * 0.4, 1);
  }

  /**
   * Check if daily loss limit is exceeded
   */
  isDailyLossLimitExceeded(portfolio: Portfolio): boolean {
    this.resetDailyIfNeeded();
    if (this.dailyStartValue === 0) return false;
    
    const dailyLossPercent = ((this.dailyStartValue - portfolio.totalValue) / this.dailyStartValue) * 100;
    return dailyLossPercent >= this.config.dailyLossLimitPercent;
  }

  /**
   * Check margin call condition
   */
  checkMarginCall(portfolio: Portfolio, positions: Position[]): boolean {
    if (positions.length === 0) return false;

    const totalMargin = positions.reduce((sum, p) => 
      sum + (p.avgEntryPrice * p.quantity) / p.leverage, 0
    );
    
    const marginRatio = totalMargin > 0 
      ? portfolio.cashBalance / totalMargin 
      : 1;

    return marginRatio < this.config.marginCallThreshold;
  }

  /**
   * Get positions to liquidate in case of margin call
   * Returns positions sorted by loss (worst first)
   */
  getMarginCallLiquidationOrder(positions: Position[]): Position[] {
    return [...positions].sort((a, b) => a.unrealizedPnL - b.unrealizedPnL);
  }

  /**
   * Halt all trading
   */
  haltTrading(reason: string): void {
    this.tradingHalted = true;
    this.haltReason = reason;
  }

  /**
   * Resume trading after halt
   */
  resumeTrading(): void {
    this.tradingHalted = false;
    this.haltReason = null;
  }

  /**
   * Check if trading is halted
   */
  isTradingHalted(): boolean {
    return this.tradingHalted;
  }

  /**
   * Get halt reason
   */
  getHaltReason(): string | null {
    return this.haltReason;
  }

  /**
   * Get current risk configuration
   */
  getConfig(): RiskConfig {
    return { ...this.config };
  }

  /**
   * Update risk configuration
   */
  updateConfig(updates: Partial<RiskConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Calculate max drawdown from equity curve
   */
  calculateMaxDrawdown(equityCurve: number[]): number {
    if (equityCurve.length === 0) return 0;

    let maxDrawdown = 0;
    let peak = equityCurve[0];

    for (const value of equityCurve) {
      if (value > peak) peak = value;
      if (peak > 0) {
        const drawdown = ((peak - value) / peak) * 100;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Get risk report for current portfolio
   */
  getRiskReport(portfolio: Portfolio, positions: Position[]): {
    portfolioRisk: number;
    positionCount: number;
    maxDrawdown: number;
    isHalted: boolean;
    haltReason: string | null;
    marginCallRisk: boolean;
    dailyLossPercent: number;
  } {
    return {
      portfolioRisk: this.calculatePortfolioRisk(positions),
      positionCount: positions.length,
      maxDrawdown: this.calculateMaxDrawdown(
        positions.map(p => p.marketValue || 0)
      ),
      isHalted: this.tradingHalted,
      haltReason: this.haltReason,
      marginCallRisk: this.checkMarginCall(portfolio, positions),
      dailyLossPercent: this.dailyStartValue > 0 
        ? ((this.dailyStartValue - portfolio.totalValue) / this.dailyStartValue) * 100 
        : 0
    };
  }

  /**
   * Reset daily tracking if new day
   */
  private resetDailyIfNeeded(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.lastResetDate = today;
      this.dailyPnL = 0;
      // Reset halt status on new day (unless drawdown halt)
      if (this.haltReason?.includes('Daily loss')) {
        this.tradingHalted = false;
        this.haltReason = null;
      }
    }
  }
}

// Export singleton
export const riskManager = new RiskManager();
