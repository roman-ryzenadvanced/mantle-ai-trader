/**
 * Smart Money Tracking System
 * Adapted from Polymarket-bot for tracking whale movements and profitable traders
 * 
 * Features:
 * - Track large wallet movements
 * - Analyze trader performance metrics
 * - Filter for quality signals
 * - Copy trading capabilities
 */

export interface TraderMetrics {
  address: string;
  label?: string;
  
  // Performance metrics
  totalTrades: number;
  winRate: number;           // 0-1
  profitFactor: number;      // gross wins / gross losses
  totalPnL: number;
  avgTradeSize: number;
  maxDrawdown: number;
  
  // Consistency metrics
  consistencyScore: number;  // 0-1, how consistent recent performance is
  sharpeRatio?: number;
  
  // Activity metrics
  lastActive: Date;
  tradesLast7d: number;
  tradesLast30d: number;
  
  // Risk metrics
  avgLeverage: number;
  maxLeverage: number;
  riskScore: number;         // 0-1, higher = riskier
  
  // Tracking
  isWhale: boolean;          // Large position sizes
  isVerified: boolean;       // Verified profitable trader
  tags: string[];
}

export interface SmartMoneyFilter {
  // Minimum performance thresholds
  minWinRate: number;        // Default: 0.55
  minProfitFactor: number;   // Default: 1.3
  minTrades: number;         // Default: 20
  minConsistencyScore: number; // Default: 0.5
  
  // Maximum risk thresholds
  maxRiskScore: number;      // Default: 0.7
  maxAvgLeverage: number;    // Default: 5
  
  // Activity thresholds
  minTradesLast7d: number;   // Default: 3
  maxInactiveDays: number;   // Default: 14
  
  // Whale settings
  minWhaleTradeSize?: number;
  maxSingleTradeExposure: number; // Max % of portfolio from one trade
}

export interface WhaleAlert {
  id: string;
  trader: TraderMetrics;
  symbol: string;
  side: 'BUY' | 'SELL';
  size: number;
  sizeUsd: number;
  price: number;
  timestamp: Date;
  txHash?: string;
  significance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  analysis?: string;
}

export interface SmartMoneySignal {
  id: string;
  trader: TraderMetrics;
  symbol: string;
  side: 'BUY' | 'SELL';
  confidence: number;
  reasoning: string;
  traderWeight: number;      // How much to weight this signal
  timestamp: Date;
}

const DEFAULT_FILTER: SmartMoneyFilter = {
  minWinRate: 0.55,
  minProfitFactor: 1.3,
  minTrades: 20,
  minConsistencyScore: 0.5,
  maxRiskScore: 0.7,
  maxAvgLeverage: 5,
  minTradesLast7d: 3,
  maxInactiveDays: 14,
  maxSingleTradeExposure: 0.3,
};

export class SmartMoneyTracker {
  private trackedTraders: Map<string, TraderMetrics>;
  private filter: SmartMoneyFilter;
  private recentAlerts: WhaleAlert[];
  private listeners: Map<string, Array<(data: unknown) => void>>;
  private maxAlerts: number;

  constructor(filter: Partial<SmartMoneyFilter> = {}, maxAlerts: number = 100) {
    this.filter = { ...DEFAULT_FILTER, ...filter };
    this.trackedTraders = new Map();
    this.recentAlerts = [];
    this.listeners = new Map();
    this.maxAlerts = maxAlerts;
  }

  /**
   * Add or update a trader to track
   */
  trackTrader(metrics: Partial<TraderMetrics> & { address: string }): void {
    const existing = this.trackedTraders.get(metrics.address);
    
    const trader: TraderMetrics = {
      address: metrics.address,
      label: metrics.label,
      totalTrades: metrics.totalTrades ?? existing?.totalTrades ?? 0,
      winRate: metrics.winRate ?? existing?.winRate ?? 0,
      profitFactor: metrics.profitFactor ?? existing?.profitFactor ?? 0,
      totalPnL: metrics.totalPnL ?? existing?.totalPnL ?? 0,
      avgTradeSize: metrics.avgTradeSize ?? existing?.avgTradeSize ?? 0,
      maxDrawdown: metrics.maxDrawdown ?? existing?.maxDrawdown ?? 0,
      consistencyScore: metrics.consistencyScore ?? existing?.consistencyScore ?? 0,
      sharpeRatio: metrics.sharpeRatio ?? existing?.sharpeRatio,
      lastActive: metrics.lastActive ?? new Date(),
      tradesLast7d: metrics.tradesLast7d ?? existing?.tradesLast7d ?? 0,
      tradesLast30d: metrics.tradesLast30d ?? existing?.tradesLast30d ?? 0,
      avgLeverage: metrics.avgLeverage ?? existing?.avgLeverage ?? 1,
      maxLeverage: metrics.maxLeverage ?? existing?.maxLeverage ?? 1,
      riskScore: metrics.riskScore ?? existing?.riskScore ?? 0.5,
      isWhale: metrics.isWhale ?? existing?.isWhale ?? false,
      isVerified: metrics.isVerified ?? existing?.isVerified ?? false,
      tags: metrics.tags ?? existing?.tags ?? [],
    };

    this.trackedTraders.set(metrics.address, trader);
    this.emit('trader_updated', trader);
  }

  /**
   * Remove a trader from tracking
   */
  untrackTrader(address: string): boolean {
    const result = this.trackedTraders.delete(address);
    if (result) {
      this.emit('trader_removed', { address });
    }
    return result;
  }

  /**
   * Record a whale alert
   */
  recordWhaleAlert(alert: Omit<WhaleAlert, 'id'>): WhaleAlert {
    const fullAlert: WhaleAlert = {
      ...alert,
      id: `${alert.trader.address}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    this.recentAlerts.unshift(fullAlert);
    
    // Trim alerts to max
    if (this.recentAlerts.length > this.maxAlerts) {
      this.recentAlerts = this.recentAlerts.slice(0, this.maxAlerts);
    }

    this.emit('whale_alert', fullAlert);
    return fullAlert;
  }

  /**
   * Check if a trader passes the quality filter
   */
  passesFilter(trader: TraderMetrics): boolean {
    // Win rate check
    if (trader.winRate < this.filter.minWinRate) return false;
    
    // Profit factor check
    if (trader.profitFactor < this.filter.minProfitFactor) return false;
    
    // Minimum trades check
    if (trader.totalTrades < this.filter.minTrades) return false;
    
    // Consistency check
    if (trader.consistencyScore < this.filter.minConsistencyScore) return false;
    
    // Risk check
    if (trader.riskScore > this.filter.maxRiskScore) return false;
    
    // Leverage check
    if (trader.avgLeverage > this.filter.maxAvgLeverage) return false;
    
    // Activity check
    const daysSinceActive = (Date.now() - trader.lastActive.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceActive > this.filter.maxInactiveDays) return false;
    
    if (trader.tradesLast7d < this.filter.minTradesLast7d) return false;

    return true;
  }

  /**
   * Get all traders that pass the quality filter
   */
  getQualityTraders(): TraderMetrics[] {
    return Array.from(this.trackedTraders.values())
      .filter(trader => this.passesFilter(trader))
      .sort((a, b) => b.profitFactor - a.profitFactor);
  }

  /**
   * Get all whales (large position traders)
   */
  getWhales(): TraderMetrics[] {
    return Array.from(this.trackedTraders.values())
      .filter(trader => trader.isWhale)
      .sort((a, b) => b.avgTradeSize - a.avgTradeSize);
  }

  /**
   * Generate signal from smart money activity
   */
  generateSignal(
    symbol: string,
    side: 'BUY' | 'SELL',
    traders: TraderMetrics[]
  ): SmartMoneySignal | null {
    // Filter quality traders
    const qualityTraders = traders.filter(t => this.passesFilter(t));
    
    if (qualityTraders.length === 0) return null;

    // Calculate weighted confidence based on trader metrics
    let totalWeight = 0;
    let weightedConfidence = 0;

    for (const trader of qualityTraders) {
      const weight = this.calculateTraderWeight(trader);
      totalWeight += weight;
      weightedConfidence += weight * trader.winRate;
    }

    const confidence = totalWeight > 0 ? weightedConfidence / totalWeight : 0;
    const avgWeight = totalWeight / qualityTraders.length;

    // Generate reasoning
    const reasoning = this.generateReasoning(symbol, side, qualityTraders);

    return {
      id: `SM-${symbol}-${Date.now()}`,
      trader: qualityTraders[0], // Lead trader
      symbol,
      side,
      confidence,
      reasoning,
      traderWeight: avgWeight,
      timestamp: new Date(),
    };
  }

  /**
   * Calculate weight for a trader (higher = more reliable)
   */
  private calculateTraderWeight(trader: TraderMetrics): number {
    let weight = 1;

    // Win rate contribution (up to 2x)
    weight *= 1 + trader.winRate;

    // Profit factor contribution (up to 1.5x)
    weight *= Math.min(1 + (trader.profitFactor - 1) * 0.5, 1.5);

    // Consistency contribution (up to 1.3x)
    weight *= 1 + trader.consistencyScore * 0.3;

    // Whale bonus
    if (trader.isWhale) weight *= 1.2;

    // Verified bonus
    if (trader.isVerified) weight *= 1.15;

    // Risk penalty
    weight *= 1 - trader.riskScore * 0.3;

    return weight;
  }

  /**
   * Generate reasoning for signal
   */
  private generateReasoning(
    symbol: string,
    side: 'BUY' | 'SELL',
    traders: TraderMetrics[]
  ): string {
    const count = traders.length;
    const avgWinRate = traders.reduce((sum, t) => sum + t.winRate, 0) / count;
    const avgProfitFactor = traders.reduce((sum, t) => sum + t.profitFactor, 0) / count;
    const whales = traders.filter(t => t.isWhale).length;

    let reasoning = `${count} quality trader${count > 1 ? 's' : ''} ${side === 'BUY' ? 'buying' : 'selling'} ${symbol}. `;
    reasoning += `Avg win rate: ${(avgWinRate * 100).toFixed(1)}%, Profit factor: ${avgProfitFactor.toFixed(2)}.`;
    
    if (whales > 0) {
      reasoning += ` Includes ${whales} whale${whales > 1 ? 's' : ''}.`;
    }

    return reasoning;
  }

  /**
   * Get recent whale alerts
   */
  getRecentAlerts(limit: number = 20): WhaleAlert[] {
    return this.recentAlerts.slice(0, limit);
  }

  /**
   * Get trader by address
   */
  getTrader(address: string): TraderMetrics | undefined {
    return this.trackedTraders.get(address);
  }

  /**
   * Get all tracked traders
   */
  getAllTraders(): TraderMetrics[] {
    return Array.from(this.trackedTraders.values());
  }

  /**
   * Get tracking statistics
   */
  getStats(): {
    totalTracked: number;
    qualityTraders: number;
    whales: number;
    avgWinRate: number;
    avgProfitFactor: number;
  } {
    const all = Array.from(this.trackedTraders.values());
    const quality = this.getQualityTraders();
    const whales = this.getWhales();

    return {
      totalTracked: all.length,
      qualityTraders: quality.length,
      whales: whales.length,
      avgWinRate: all.length > 0 
        ? all.reduce((sum, t) => sum + t.winRate, 0) / all.length 
        : 0,
      avgProfitFactor: all.length > 0 
        ? all.reduce((sum, t) => sum + t.profitFactor, 0) / all.length 
        : 0,
    };
  }

  /**
   * Update filter settings
   */
  updateFilter(newFilter: Partial<SmartMoneyFilter>): void {
    this.filter = { ...this.filter, ...newFilter };
    this.emit('filter_updated', { filter: this.filter });
  }

  /**
   * Add event listener
   */
  on(event: string, callback: (data: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  /**
   * Emit event
   */
  private emit(event: string, data: unknown): void {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => cb(data));
  }

  /**
   * Clear all tracked data
   */
  clear(): void {
    this.trackedTraders.clear();
    this.recentAlerts = [];
    this.emit('cleared', {});
  }
}

// Singleton instance
let smartMoneyTrackerInstance: SmartMoneyTracker | null = null;

export function getSmartMoneyTracker(filter?: Partial<SmartMoneyFilter>): SmartMoneyTracker {
  if (!smartMoneyTrackerInstance) {
    smartMoneyTrackerInstance = new SmartMoneyTracker(filter);
  }
  return smartMoneyTrackerInstance;
}

export function resetSmartMoneyTracker(): void {
  if (smartMoneyTrackerInstance) {
    smartMoneyTrackerInstance.clear();
  }
  smartMoneyTrackerInstance = null;
}
