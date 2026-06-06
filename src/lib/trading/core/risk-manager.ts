/**
 * 4-Layer Risk Management System
 * Adapted from Polymarket-bot best practices
 * 
 * Layer 1: Daily Loss Limit - Halts trading if daily losses exceed threshold
 * Layer 2: Monthly Loss Limit - Halts trading if monthly losses exceed threshold
 * Layer 3: Max Drawdown - Halts if portfolio drops from peak by threshold
 * Layer 4: Total Max Loss - Permanent halt if total loss exceeds threshold
 */

export interface RiskConfig {
  // Layer 1: Daily loss limit (default 5%)
  dailyMaxLossPct: number;
  
  // Layer 2: Monthly loss limit (default 15%)
  monthlyMaxLossPct: number;
  
  // Layer 3: Maximum drawdown from peak (default 25%)
  maxDrawdownFromPeak: number;
  
  // Layer 4: Total maximum loss - permanent halt (default 40%)
  totalMaxLossPct: number;
  
  // Enable dynamic position sizing based on performance
  enableDynamicSizing: boolean;
  
  // Base position size as % of portfolio
  basePositionSizePct: number;
  
  // Maximum single position as % of portfolio
  maxSinglePositionPct: number;
  
  // Maximum total exposure as % of portfolio
  maxTotalExposurePct: number;
}

export interface RiskState {
  // Daily tracking
  dailyStartBalance: number;
  dailyRealizedPnL: number;
  dailyTradeCount: number;
  lastDayReset: Date;
  
  // Monthly tracking
  monthlyStartBalance: number;
  monthlyRealizedPnL: number;
  lastMonthReset: Date;
  
  // Peak tracking for drawdown
  portfolioPeak: number;
  currentDrawdown: number;
  
  // Total tracking
  initialCapital: number;
  totalRealizedPnL: number;
  
  // Streak tracking for dynamic sizing
  consecutiveLosses: number;
  consecutiveWins: number;
  
  // Halt status
  isHalted: boolean;
  haltReason: string | null;
  permanentHalt: boolean;
}

export type RiskCheckResult = {
  allowed: boolean;
  reason?: string;
  warning?: string;
  suggestedSize?: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
};

export class RiskManager {
  private config: RiskConfig;
  private state: RiskState;
  private listeners: Array<(event: string, data: unknown) => void> = [];

  constructor(config: Partial<RiskConfig> = {}) {
    this.config = {
      dailyMaxLossPct: 0.05,
      monthlyMaxLossPct: 0.15,
      maxDrawdownFromPeak: 0.25,
      totalMaxLossPct: 0.40,
      enableDynamicSizing: true,
      basePositionSizePct: 0.02,
      maxSinglePositionPct: 0.10,
      maxTotalExposurePct: 0.50,
      ...config,
    };

    const now = new Date();
    this.state = {
      dailyStartBalance: 0,
      dailyRealizedPnL: 0,
      dailyTradeCount: 0,
      lastDayReset: now,
      monthlyStartBalance: 0,
      monthlyRealizedPnL: 0,
      lastMonthReset: now,
      portfolioPeak: 0,
      currentDrawdown: 0,
      initialCapital: 0,
      totalRealizedPnL: 0,
      consecutiveLosses: 0,
      consecutiveWins: 0,
      isHalted: false,
      haltReason: null,
      permanentHalt: false,
    };
  }

  /**
   * Initialize risk manager with starting capital
   */
  initialize(capital: number): void {
    this.state.initialCapital = capital;
    this.state.dailyStartBalance = capital;
    this.state.monthlyStartBalance = capital;
    this.state.portfolioPeak = capital;
    this.emit('initialized', { capital });
  }

  /**
   * Check if a trade is allowed and get suggested position size
   */
  checkTrade(portfolioValue: number, requestedSize?: number): RiskCheckResult {
    // Check if permanently halted
    if (this.state.permanentHalt) {
      return {
        allowed: false,
        reason: `PERMANENT HALT: ${this.state.haltReason}`,
        riskLevel: 'CRITICAL',
      };
    }

    // Check if temporarily halted
    if (this.state.isHalted) {
      return {
        allowed: false,
        reason: `TRADING HALTED: ${this.state.haltReason}`,
        riskLevel: 'CRITICAL',
      };
    }

    // Reset daily/monthly counters if needed
    this.checkAndResetCounters();

    const warnings: string[] = [];
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    // Layer 1: Daily Loss Check
    const dailyLossPct = this.state.dailyRealizedPnL / this.state.dailyStartBalance;
    if (dailyLossPct <= -this.config.dailyMaxLossPct) {
      this.state.isHalted = true;
      this.state.haltReason = `Daily loss limit reached: ${(dailyLossPct * 100).toFixed(2)}%`;
      this.emit('halt', { layer: 1, reason: this.state.haltReason });
      return {
        allowed: false,
        reason: this.state.haltReason,
        riskLevel: 'CRITICAL',
      };
    }
    if (dailyLossPct <= -this.config.dailyMaxLossPct * 0.7) {
      warnings.push(`Approaching daily loss limit: ${(dailyLossPct * 100).toFixed(2)}%`);
      riskLevel = 'HIGH';
    }

    // Layer 2: Monthly Loss Check
    const monthlyLossPct = this.state.monthlyRealizedPnL / this.state.monthlyStartBalance;
    if (monthlyLossPct <= -this.config.monthlyMaxLossPct) {
      this.state.isHalted = true;
      this.state.haltReason = `Monthly loss limit reached: ${(monthlyLossPct * 100).toFixed(2)}%`;
      this.emit('halt', { layer: 2, reason: this.state.haltReason });
      return {
        allowed: false,
        reason: this.state.haltReason,
        riskLevel: 'CRITICAL',
      };
    }
    if (monthlyLossPct <= -this.config.monthlyMaxLossPct * 0.7) {
      warnings.push(`Approaching monthly loss limit: ${(monthlyLossPct * 100).toFixed(2)}%`);
      riskLevel = 'HIGH';
    }

    // Layer 3: Drawdown Check
    this.updateDrawdown(portfolioValue);
    if (this.state.currentDrawdown >= this.config.maxDrawdownFromPeak) {
      this.state.isHalted = true;
      this.state.haltReason = `Max drawdown reached: ${(this.state.currentDrawdown * 100).toFixed(2)}%`;
      this.emit('halt', { layer: 3, reason: this.state.haltReason });
      return {
        allowed: false,
        reason: this.state.haltReason,
        riskLevel: 'CRITICAL',
      };
    }
    if (this.state.currentDrawdown >= this.config.maxDrawdownFromPeak * 0.7) {
      warnings.push(`Approaching max drawdown: ${(this.state.currentDrawdown * 100).toFixed(2)}%`);
      riskLevel = riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM';
    }

    // Layer 4: Total Loss Check (Permanent Halt)
    const totalLossPct = this.state.totalRealizedPnL / this.state.initialCapital;
    if (totalLossPct <= -this.config.totalMaxLossPct) {
      this.state.permanentHalt = true;
      this.state.isHalted = true;
      this.state.haltReason = `CRITICAL: Total loss limit reached: ${(totalLossPct * 100).toFixed(2)}%`;
      this.emit('permanent_halt', { layer: 4, reason: this.state.haltReason });
      return {
        allowed: false,
        reason: this.state.haltReason,
        riskLevel: 'CRITICAL',
      };
    }

    // Calculate suggested position size with dynamic sizing
    const suggestedSize = this.calculatePositionSize(portfolioValue, requestedSize);

    // Check position size limits
    const maxSize = portfolioValue * this.config.maxSinglePositionPct;
    const finalSize = Math.min(suggestedSize, maxSize);

    if (requestedSize !== undefined && finalSize < requestedSize) {
      warnings.push(`Position size reduced from ${requestedSize} to ${finalSize.toFixed(2)}`);
    }

    return {
      allowed: true,
      warning: warnings.length > 0 ? warnings.join('; ') : undefined,
      suggestedSize: finalSize,
      riskLevel,
    };
  }

  /**
   * Calculate position size with dynamic sizing based on performance
   */
  private calculatePositionSize(portfolioValue: number, requestedSize?: number): number {
    let baseSize = requestedSize ?? portfolioValue * this.config.basePositionSizePct;

    if (!this.config.enableDynamicSizing) {
      return baseSize;
    }

    // Reduce during losing streaks (20% per consecutive loss after 2)
    if (this.state.consecutiveLosses > 2) {
      const reduction = Math.pow(1 - 0.20, this.state.consecutiveLosses - 2);
      baseSize *= reduction;
    }

    // Increase during winning streaks (10% per win after 3, capped at 5 wins)
    if (this.state.consecutiveWins > 3) {
      const increase = 1 + Math.min(this.state.consecutiveWins - 3, 5) * 0.10;
      baseSize *= increase;
    }

    return baseSize;
  }

  /**
   * Record a trade result for risk tracking
   */
  recordTrade(pnl: number, portfolioValue: number): void {
    // Update PnL tracking
    this.state.dailyRealizedPnL += pnl;
    this.state.monthlyRealizedPnL += pnl;
    this.state.totalRealizedPnL += pnl;
    this.state.dailyTradeCount++;

    // Update streaks
    if (pnl >= 0) {
      this.state.consecutiveWins++;
      this.state.consecutiveLosses = 0;
    } else {
      this.state.consecutiveLosses++;
      this.state.consecutiveWins = 0;
    }

    // Update peak and drawdown
    if (portfolioValue > this.state.portfolioPeak) {
      this.state.portfolioPeak = portfolioValue;
      this.state.currentDrawdown = 0;
    } else {
      this.state.currentDrawdown = 
        (this.state.portfolioPeak - portfolioValue) / this.state.portfolioPeak;
    }

    // Auto-resume if halted and conditions improve
    if (this.state.isHalted && !this.state.permanentHalt) {
      this.checkAutoResume(portfolioValue);
    }

    this.emit('trade_recorded', {
      pnl,
      portfolioValue,
      dailyPnL: this.state.dailyRealizedPnL,
      monthlyPnL: this.state.monthlyRealizedPnL,
      streak: pnl >= 0 ? `W${this.state.consecutiveWins}` : `L${this.state.consecutiveLosses}`,
    });
  }

  /**
   * Update drawdown calculation
   */
  private updateDrawdown(portfolioValue: number): void {
    if (portfolioValue > this.state.portfolioPeak) {
      this.state.portfolioPeak = portfolioValue;
    }
    this.state.currentDrawdown = 
      (this.state.portfolioPeak - portfolioValue) / this.state.portfolioPeak;
  }

  /**
   * Check and reset daily/monthly counters
   */
  private checkAndResetCounters(): void {
    const now = new Date();
    
    // Reset daily counters at midnight
    const lastDay = this.state.lastDayReset.getDate();
    const currentDay = now.getDate();
    if (lastDay !== currentDay) {
      this.state.dailyStartBalance += this.state.dailyRealizedPnL;
      this.state.dailyRealizedPnL = 0;
      this.state.dailyTradeCount = 0;
      this.state.lastDayReset = now;
      this.emit('daily_reset', { newStartBalance: this.state.dailyStartBalance });
    }

    // Reset monthly counters
    const lastMonth = this.state.lastMonthReset.getMonth();
    const currentMonth = now.getMonth();
    if (lastMonth !== currentMonth) {
      this.state.monthlyStartBalance += this.state.monthlyRealizedPnL;
      this.state.monthlyRealizedPnL = 0;
      this.state.lastMonthReset = now;
      this.emit('monthly_reset', { newStartBalance: this.state.monthlyStartBalance });
    }
  }

  /**
   * Check if trading can auto-resume after being halted
   */
  private checkAutoResume(portfolioValue: number): void {
    // Check if daily losses have recovered
    const dailyLossPct = this.state.dailyRealizedPnL / this.state.dailyStartBalance;
    if (dailyLossPct > -this.config.dailyMaxLossPct * 0.5) {
      // Conditions improved, can resume
      const oldReason = this.state.haltReason;
      this.state.isHalted = false;
      this.state.haltReason = null;
      this.emit('resumed', { previousReason: oldReason });
    }
  }

  /**
   * Manually resume trading (admin override)
   */
  forceResume(): boolean {
    if (this.state.permanentHalt) {
      return false; // Cannot override permanent halt
    }
    const oldReason = this.state.haltReason;
    this.state.isHalted = false;
    this.state.haltReason = null;
    this.emit('force_resumed', { previousReason: oldReason });
    return true;
  }

  /**
   * Get current risk state
   */
  getState(): RiskState {
    return { ...this.state };
  }

  /**
   * Get risk configuration
   */
  getConfig(): RiskConfig {
    return { ...this.config };
  }

  /**
   * Update risk configuration
   */
  updateConfig(newConfig: Partial<RiskConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config_updated', { config: this.config });
  }

  /**
   * Get risk metrics summary
   */
  getMetrics(): {
    dailyPnLPct: number;
    monthlyPnLPct: number;
    totalPnLPct: number;
    currentDrawdown: number;
    winStreak: number;
    lossStreak: number;
    isHalted: boolean;
    riskLevel: string;
  } {
    const dailyPnLPct = this.state.dailyRealizedPnL / this.state.dailyStartBalance;
    const monthlyPnLPct = this.state.monthlyRealizedPnL / this.state.monthlyStartBalance;
    const totalPnLPct = this.state.totalRealizedPnL / this.state.initialCapital;

    let riskLevel = 'LOW';
    if (Math.abs(dailyPnLPct) > this.config.dailyMaxLossPct * 0.7 ||
        Math.abs(monthlyPnLPct) > this.config.monthlyMaxLossPct * 0.7 ||
        this.state.currentDrawdown > this.config.maxDrawdownFromPeak * 0.7) {
      riskLevel = 'HIGH';
    } else if (Math.abs(dailyPnLPct) > this.config.dailyMaxLossPct * 0.5 ||
               Math.abs(monthlyPnLPct) > this.config.monthlyMaxLossPct * 0.5 ||
               this.state.currentDrawdown > this.config.maxDrawdownFromPeak * 0.5) {
      riskLevel = 'MEDIUM';
    }

    return {
      dailyPnLPct,
      monthlyPnLPct,
      totalPnLPct,
      currentDrawdown: this.state.currentDrawdown,
      winStreak: this.state.consecutiveWins,
      lossStreak: this.state.consecutiveLosses,
      isHalted: this.state.isHalted,
      riskLevel,
    };
  }

  /**
   * Add event listener
   */
  on(event: string, callback: (data: unknown) => void): void {
    this.listeners.push((e, d) => {
      if (e === event) callback(d);
    });
  }

  /**
   * Emit event
   */
  private emit(event: string, data: unknown): void {
    this.listeners.forEach(listener => listener(event, data));
  }
}

// Singleton instance for global use
let riskManagerInstance: RiskManager | null = null;

export function getRiskManager(config?: Partial<RiskConfig>): RiskManager {
  if (!riskManagerInstance) {
    riskManagerInstance = new RiskManager(config);
  }
  return riskManagerInstance;
}

export function resetRiskManager(): void {
  riskManagerInstance = null;
}
