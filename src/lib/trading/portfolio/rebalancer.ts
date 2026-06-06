/**
 * Portfolio Rebalancing Logic for Mantle AI Trading Bot
 * Manages target allocations, detects drift, and suggests rebalancing actions
 * 
 * Features:
 * - Target allocation by symbol or sector
 * - Rebalancing threshold (drift triggers)
 * - Rebalancing suggestions (which positions to adjust)
 * - Risk-adjusted allocation based on volatility
 * - Support for both manual and auto-rebalancing modes
 */

// ==================== TYPES ====================

/** Rebalancing mode */
export type RebalanceMode = 'MANUAL' | 'AUTO';

/** A target allocation for a symbol or sector */
export interface TargetAllocation {
  /** Symbol or sector identifier */
  key: string;
  /** Target allocation as a decimal (e.g., 0.4 = 40%) */
  targetPercent: number;
  /** Optional minimum allocation floor */
  minPercent?: number;
  /** Optional maximum allocation ceiling */
  maxPercent?: number;
}

/** Current position allocation */
export interface PositionAllocation {
  /** Symbol */
  symbol: string;
  /** Current market value of the position */
  marketValue: number;
  /** Current allocation as a decimal */
  currentPercent: number;
  /** Target allocation as a decimal */
  targetPercent: number;
  /** Drift from target (current - target) */
  drift: number;
  /** Absolute drift value */
  absDrift: number;
  /** Whether this position needs rebalancing */
  needsRebalance: boolean;
  /** Volatility of the position (for risk-adjusted allocation) */
  volatility?: number;
}

/** A rebalancing suggestion for a single position */
export interface RebalanceSuggestion {
  /** Symbol to rebalance */
  symbol: string;
  /** Action: BUY to increase, SELL to decrease, HOLD if within threshold */
  action: 'BUY' | 'SELL' | 'HOLD';
  /** Suggested dollar amount to trade */
  suggestedAmount: number;
  /** Suggested quantity to trade (if price available) */
  suggestedQuantity?: number;
  /** Current allocation percent */
  currentPercent: number;
  /** Target allocation percent */
  targetPercent: number;
  /** Priority: higher = more urgent */
  priority: number;
  /** Reason for the suggestion */
  reason: string;
}

/** Result of a rebalancing analysis */
export interface RebalanceAnalysis {
  /** Timestamp of the analysis */
  analyzedAt: Date;
  /** Total portfolio value */
  totalPortfolioValue: number;
  /** All position allocations with drift */
  allocations: PositionAllocation[];
  /** Positions that need rebalancing */
  positionsNeedingRebalance: PositionAllocation[];
  /** Suggested rebalancing actions, sorted by priority */
  suggestions: RebalanceSuggestion[];
  /** Overall portfolio drift score (0 = perfect, higher = more drifted) */
  portfolioDriftScore: number;
  /** Whether the portfolio is within acceptable drift range */
  isWithinThreshold: boolean;
  /** Rebalancing mode */
  mode: RebalanceMode;
}

/** Configuration for the rebalancer */
export interface RebalancerConfig {
  /** Drift threshold that triggers rebalancing (default: 0.05 = 5%) */
  driftThreshold: number;
  /** Rebalancing mode (default: MANUAL) */
  mode: RebalanceMode;
  /** Whether to use risk-adjusted allocations (default: true) */
  useRiskAdjustedAllocations: boolean;
  /** Risk-free rate for Sharpe-based allocation (default: 0.04 = 4% annual) */
  riskFreeRate: number;
  /** Maximum single position size as percent (default: 0.3 = 30%) */
  maxPositionSize: number;
  /** Minimum position size to keep (default: 0.02 = 2%) */
  minPositionSize: number;
}

// ==================== REBALANCER CLASS ====================

/**
 * Portfolio Rebalancer
 * Manages target allocations and suggests rebalancing actions
 * to keep the portfolio within acceptable drift ranges
 */
export class PortfolioRebalancer {
  private targetAllocations: Map<string, TargetAllocation> = new Map();
  private config: RebalancerConfig;

  constructor(config?: Partial<RebalancerConfig>) {
    this.config = {
      driftThreshold: config?.driftThreshold ?? 0.05,
      mode: config?.mode ?? 'MANUAL',
      useRiskAdjustedAllocations: config?.useRiskAdjustedAllocations ?? true,
      riskFreeRate: config?.riskFreeRate ?? 0.04,
      maxPositionSize: config?.maxPositionSize ?? 0.30,
      minPositionSize: config?.minPositionSize ?? 0.02
    };
  }

  // ==================== CONFIGURATION ====================

  /**
   * Get the current rebalancer configuration
   * @returns Current config (read-only copy)
   */
  getConfig(): Readonly<RebalancerConfig> {
    return { ...this.config };
  }

  /**
   * Update the rebalancer configuration
   * @param updates - Partial config to merge
   */
  updateConfig(updates: Partial<RebalancerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // ==================== TARGET ALLOCATION MANAGEMENT ====================

  /**
   * Set a target allocation for a symbol
   * @param allocation - Target allocation details
   */
  setTargetAllocation(allocation: TargetAllocation): void {
    if (allocation.targetPercent < 0 || allocation.targetPercent > 1) {
      throw new Error('Target percent must be between 0 and 1');
    }
    if (allocation.minPercent !== undefined && allocation.minPercent < 0) {
      throw new Error('Min percent must be >= 0');
    }
    if (allocation.maxPercent !== undefined && allocation.maxPercent > 1) {
      throw new Error('Max percent must be <= 1');
    }
    this.targetAllocations.set(allocation.key, allocation);
  }

  /**
   * Set multiple target allocations at once
   * @param allocations - Array of target allocations
   */
  setTargetAllocations(allocations: TargetAllocation[]): void {
    // Validate total doesn't exceed 100%
    const total = allocations.reduce((sum, a) => sum + a.targetPercent, 0);
    if (total > 1.01) {
      throw new Error(`Total target allocation (${(total * 100).toFixed(1)}%) exceeds 100%`);
    }
    
    allocations.forEach(a => this.setTargetAllocation(a));
  }

  /**
   * Remove a target allocation
   * @param key - Symbol or sector key to remove
   */
  removeTargetAllocation(key: string): boolean {
    return this.targetAllocations.delete(key);
  }

  /**
   * Get all target allocations
   * @returns Array of target allocations
   */
  getTargetAllocations(): TargetAllocation[] {
    return Array.from(this.targetAllocations.values());
  }

  // ==================== ANALYSIS ====================

  /**
   * Analyze the current portfolio and generate rebalancing suggestions
   * @param positions - Current positions with symbol, marketValue, and optional volatility
   * @returns Rebalancing analysis with suggestions
   */
  analyze(
    positions: Array<{
      symbol: string;
      marketValue: number;
      volatility?: number;
    }>
  ): RebalanceAnalysis {
    const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);

    if (totalValue <= 0) {
      return {
        analyzedAt: new Date(),
        totalPortfolioValue: 0,
        allocations: [],
        positionsNeedingRebalance: [],
        suggestions: [],
        portfolioDriftScore: 0,
        isWithinThreshold: true,
        mode: this.config.mode
      };
    }

    // Calculate current allocations and drift
    const allocations: PositionAllocation[] = positions.map(pos => {
      const currentPercent = pos.marketValue / totalValue;
      const target = this.targetAllocations.get(pos.symbol);
      const targetPercent = target?.targetPercent ?? 0;
      const drift = currentPercent - targetPercent;
      
      return {
        symbol: pos.symbol,
        marketValue: pos.marketValue,
        currentPercent,
        targetPercent,
        drift,
        absDrift: Math.abs(drift),
        needsRebalance: Math.abs(drift) > this.config.driftThreshold,
        volatility: pos.volatility
      };
    });

    // Apply risk-adjusted allocations if enabled
    if (this.config.useRiskAdjustedAllocations) {
      this.applyRiskAdjustedAllocations(allocations);
    }

    // Calculate overall portfolio drift score
    const portfolioDriftScore = allocations.reduce(
      (score, a) => score + Math.pow(a.absDrift, 2), 0
    );

    const positionsNeedingRebalance = allocations.filter(a => a.needsRebalance);
    const isWithinThreshold = positionsNeedingRebalance.length === 0;

    // Generate suggestions
    const suggestions = this.generateSuggestions(allocations, totalValue);

    return {
      analyzedAt: new Date(),
      totalPortfolioValue: totalValue,
      allocations,
      positionsNeedingRebalance,
      suggestions,
      portfolioDriftScore,
      isWithinThreshold,
      mode: this.config.mode
    };
  }

  // ==================== RISK-ADJUSTED ALLOCATION ====================

  /**
   * Apply risk-adjusted allocation based on volatility
   * Positions with higher volatility get reduced target allocation
   * @param allocations - Current allocations to adjust
   */
  private applyRiskAdjustedAllocations(allocations: PositionAllocation[]): void {
    const positionsWithVol = allocations.filter(a => a.volatility !== undefined && a.volatility > 0);
    if (positionsWithVol.length === 0) return;

    // Calculate inverse-volatility weights
    const inverseVols = positionsWithVol.map(a => 1 / (a.volatility || 1));
    const totalInverseVol = inverseVols.reduce((sum, v) => sum + v, 0);

    // Scale each target by its risk-adjustment factor
    positionsWithVol.forEach((a, i) => {
      const riskWeight = inverseVols[i] / totalInverseVol;
      const baseTarget = this.targetAllocations.get(a.symbol)?.targetPercent ?? a.currentPercent;
      // Blend: 70% base target + 30% risk-adjusted
      const adjustedTarget = baseTarget * 0.7 + riskWeight * 0.3;
      
      // Enforce min/max constraints
      const target = this.targetAllocations.get(a.symbol);
      const minPct = target?.minPercent ?? this.config.minPositionSize;
      const maxPct = target?.maxPercent ?? this.config.maxPositionSize;
      
      a.targetPercent = Math.max(minPct, Math.min(maxPct, adjustedTarget));
      a.drift = a.currentPercent - a.targetPercent;
      a.absDrift = Math.abs(a.drift);
      a.needsRebalance = a.absDrift > this.config.driftThreshold;
    });
  }

  // ==================== SUGGESTION GENERATION ====================

  /**
   * Generate rebalancing suggestions based on allocations
   * @param allocations - Position allocations with drift
   * @param totalValue - Total portfolio value
   * @returns Sorted list of rebalancing suggestions
   */
  private generateSuggestions(
    allocations: PositionAllocation[],
    totalValue: number
  ): RebalanceSuggestion[] {
    const suggestions: RebalanceSuggestion[] = [];

    for (const alloc of allocations) {
      if (!alloc.needsRebalance) {
        suggestions.push({
          symbol: alloc.symbol,
          action: 'HOLD',
          suggestedAmount: 0,
          currentPercent: alloc.currentPercent,
          targetPercent: alloc.targetPercent,
          priority: 0,
          reason: `Within ${this.config.driftThreshold * 100}% threshold`
        });
        continue;
      }

      const driftAmount = alloc.drift * totalValue;

      if (alloc.drift > 0) {
        // Over-allocated: suggest selling
        suggestions.push({
          symbol: alloc.symbol,
          action: 'SELL',
          suggestedAmount: Math.abs(driftAmount),
          currentPercent: alloc.currentPercent,
          targetPercent: alloc.targetPercent,
          priority: Math.round(alloc.absDrift * 1000),
          reason: `Over-allocated by ${(alloc.absDrift * 100).toFixed(1)}%. Reduce by $${Math.abs(driftAmount).toFixed(2)}`
        });
      } else {
        // Under-allocated: suggest buying
        suggestions.push({
          symbol: alloc.symbol,
          action: 'BUY',
          suggestedAmount: Math.abs(driftAmount),
          currentPercent: alloc.currentPercent,
          targetPercent: alloc.targetPercent,
          priority: Math.round(alloc.absDrift * 1000),
          reason: `Under-allocated by ${(alloc.absDrift * 100).toFixed(1)}%. Increase by $${Math.abs(driftAmount).toFixed(2)}`
        });
      }
    }

    // Sort by priority (highest drift first)
    return suggestions.sort((a, b) => b.priority - a.priority);
  }

  // ==================== EQUAL-WEIGHT HELPER ====================

  /**
   * Generate equal-weight target allocations for a set of symbols
   * @param symbols - Array of symbols to allocate equally
   * @returns Array of equal-weight target allocations
   */
  static generateEqualWeight(symbols: string[]): TargetAllocation[] {
    const percent = symbols.length > 0 ? 1 / symbols.length : 0;
    return symbols.map(symbol => ({
      key: symbol,
      targetPercent: percent
    }));
  }

  /**
   * Generate volatility-weighted target allocations
   * Lower volatility assets get higher allocation
   * @param volatilities - Array of symbol and annualized volatility pairs
   * @returns Array of risk-adjusted target allocations
   */
  static generateRiskWeighted(
    volatilities: Array<{ symbol: string; annualizedVol: number }>
  ): TargetAllocation[] {
    if (volatilities.length === 0) return [];

    const inverseVols = volatilities.map(v => ({
      symbol: v.symbol,
      inverseVol: 1 / Math.max(v.annualizedVol, 0.001)
    }));

    const totalInverseVol = inverseVols.reduce((sum, v) => sum + v.inverseVol, 0);

    return inverseVols.map(v => ({
      key: v.symbol,
      targetPercent: totalInverseVol > 0 ? v.inverseVol / totalInverseVol : 1 / volatilities.length,
      minPercent: 0.02,
      maxPercent: 0.40
    }));
  }
}

/** Singleton rebalancer instance */
export const portfolioRebalancer = new PortfolioRebalancer();
