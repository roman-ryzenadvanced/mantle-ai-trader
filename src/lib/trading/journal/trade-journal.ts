/**
 * Trade Journal / Trade Review System for Mantle AI Trading Bot
 * Records, reviews, and analyzes trading activity for continuous improvement
 * 
 * Features:
 * - Record trade entries with signal data, emotional state, and market condition
 * - Record trade exits with PnL and lessons learned
 * - Generate trade review reports (best/worst setups, common mistakes)
 * - Calculate statistics by time of day, day of week, market condition
 * - Track win rate by strategy type (technical, fundamental, combined)
 * - Export journal to JSON
 */

import { TradeAction } from '../core/types';

// ==================== TYPES ====================

/** Emotional state tags for self-awareness tracking */
export type EmotionalState = 
  | 'CONFIDENT'
  | 'ANXIOUS'
  | 'FOMO'
  | 'PATIENT'
  | 'REVENGE_TRADING'
  | 'DISCIPLINED'
  | 'UNCERTAIN'
  | 'EUPHORIC'
  | 'FEARFUL';

/** Market condition at time of trade */
export type MarketCondition = 
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'RANGING'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'NEWS_DRIVEN'
  | 'BREAKOUT'
  | 'REVERSAL';

/** Strategy type classification */
export type StrategyType = 'TECHNICAL' | 'FUNDAMENTAL' | 'COMBINED';

/** Exit reason for closing a trade */
export type ExitReason = 
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'TRAILING_STOP'
  | 'MANUAL_CLOSE'
  | 'SIGNAL_REVERSAL'
  | 'TIME_BASED'
  | 'MARGIN_CALL'
  | 'CIRCUIT_BREAKER';

/** A journal entry for a single trade */
export interface JournalEntry {
  /** Unique identifier */
  id: string;
  /** Symbol traded */
  symbol: string;
  /** Trade side */
  side: TradeAction;
  /** Strategy type used */
  strategyType: StrategyType;
  
  // Entry details
  /** Reason for entering the trade */
  entryReason: string;
  /** Signal data that triggered the entry */
  signalData?: Record<string, unknown>;
  /** Emotional state at time of entry */
  emotionalState: EmotionalState;
  /** Market condition at time of entry */
  marketCondition: MarketCondition;
  /** Entry price */
  entryPrice: number;
  /** Entry timestamp */
  entryTime: Date;
  /** Position size */
  quantity: number;
  /** Leverage used */
  leverage: number;
  /** Stop loss price */
  stopLoss?: number;
  /** Take profit price */
  takeProfit?: number;
  
  // Exit details (filled when trade is closed)
  /** Exit price */
  exitPrice?: number;
  /** Exit timestamp */
  exitTime?: Date;
  /** Reason for exiting */
  exitReason?: ExitReason;
  /** Realized PnL */
  pnl?: number;
  /** PnL as percentage */
  pnlPercent?: number;
  /** Lessons learned from this trade */
  lessonsLearned?: string;
  /** Additional notes */
  notes?: string;
  
  // Computed fields
  /** Duration of trade in milliseconds */
  durationMs?: number;
  /** Whether the trade was profitable */
  isWin?: boolean;
}

/** Statistics grouped by a specific dimension */
export interface GroupedStats {
  /** Group key (e.g., "Monday", "TECHNICAL", "TRENDING_UP") */
  group: string;
  /** Number of trades in this group */
  count: number;
  /** Number of winning trades */
  wins: number;
  /** Number of losing trades */
  losses: number;
  /** Win rate as percentage */
  winRate: number;
  /** Total PnL in this group */
  totalPnL: number;
  /** Average PnL per trade */
  avgPnL: number;
  /** Best trade PnL */
  bestTrade: number;
  /** Worst trade PnL */
  worstTrade: number;
}

/** Trade review report */
export interface TradeReviewReport {
  /** Report generation timestamp */
  generatedAt: Date;
  /** Total number of closed trades analyzed */
  totalTrades: number;
  /** Overall win rate */
  overallWinRate: number;
  /** Total PnL */
  totalPnL: number;
  /** Average PnL per trade */
  avgPnL: number;
  /** Profit factor (gross profit / gross loss) */
  profitFactor: number;
  
  /** Best performing setups (top 5 by avg PnL) */
  bestSetups: Array<{ description: string; avgPnL: number; count: number; winRate: number }>;
  /** Worst performing setups (bottom 5 by avg PnL) */
  worstSetups: Array<{ description: string; avgPnL: number; count: number; winRate: number }>;
  /** Common mistakes identified from lessons learned */
  commonMistakes: Array<{ mistake: string; frequency: number }>;
  
  /** Stats by time of day */
  statsByTimeOfDay: GroupedStats[];
  /** Stats by day of week */
  statsByDayOfWeek: GroupedStats[];
  /** Stats by market condition */
  statsByMarketCondition: GroupedStats[];
  /** Stats by strategy type */
  statsByStrategyType: GroupedStats[];
  /** Stats by emotional state */
  statsByEmotionalState: GroupedStats[];
}

// ==================== TRADE JOURNAL CLASS ====================

/**
 * Trade Journal for recording and reviewing trades
 * Maintains an in-memory store of journal entries and provides
 * analytical methods for trade review and improvement
 */
export class TradeJournal {
  private entries: Map<string, JournalEntry> = new Map();

  /**
   * Record a new trade entry
   * @param params - Entry details
   * @returns The created journal entry
   */
  recordEntry(params: {
    symbol: string;
    side: TradeAction;
    strategyType: StrategyType;
    entryReason: string;
    signalData?: Record<string, unknown>;
    emotionalState: EmotionalState;
    marketCondition: MarketCondition;
    entryPrice: number;
    quantity: number;
    leverage: number;
    stopLoss?: number;
    takeProfit?: number;
    notes?: string;
  }): JournalEntry {
    const entry: JournalEntry = {
      id: `journal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      symbol: params.symbol,
      side: params.side,
      strategyType: params.strategyType,
      entryReason: params.entryReason,
      signalData: params.signalData,
      emotionalState: params.emotionalState,
      marketCondition: params.marketCondition,
      entryPrice: params.entryPrice,
      entryTime: new Date(),
      quantity: params.quantity,
      leverage: params.leverage,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      notes: params.notes
    };

    this.entries.set(entry.id, entry);
    return entry;
  }

  /**
   * Record a trade exit, completing the journal entry
   * @param entryId - ID of the journal entry to close
   * @param params - Exit details
   * @returns The updated journal entry, or null if not found
   */
  recordExit(
    entryId: string,
    params: {
      exitPrice: number;
      exitReason: ExitReason;
      pnl: number;
      lessonsLearned?: string;
      notes?: string;
    }
  ): JournalEntry | null {
    const entry = this.entries.get(entryId);
    if (!entry) return null;

    entry.exitPrice = params.exitPrice;
    entry.exitTime = new Date();
    entry.exitReason = params.exitReason;
    entry.pnl = params.pnl;
    entry.pnlPercent = entry.entryPrice > 0
      ? (params.pnl / (entry.entryPrice * entry.quantity)) * 100
      : 0;
    entry.lessonsLearned = params.lessonsLearned;
    entry.notes = params.notes
      ? `${entry.notes || ''}\n${params.notes}`.trim()
      : entry.notes;
    entry.durationMs = entry.exitTime.getTime() - entry.entryTime.getTime();
    entry.isWin = params.pnl > 0;

    this.entries.set(entryId, entry);
    return entry;
  }

  /**
   * Get a journal entry by ID
   * @param entryId - The journal entry ID
   * @returns The entry or undefined
   */
  getEntry(entryId: string): JournalEntry | undefined {
    return this.entries.get(entryId);
  }

  /**
   * Get all journal entries
   * @returns Array of all entries
   */
  getAllEntries(): JournalEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get only closed (completed) entries
   * @returns Array of closed entries
   */
  getClosedEntries(): JournalEntry[] {
    return this.getAllEntries().filter(e => e.exitTime !== undefined);
  }

  /**
   * Get only open (in-progress) entries
   * @returns Array of open entries
   */
  getOpenEntries(): JournalEntry[] {
    return this.getAllEntries().filter(e => e.exitTime === undefined);
  }

  /**
   * Get entries for a specific symbol
   * @param symbol - Trading symbol
   * @returns Array of entries for the symbol
   */
  getEntriesBySymbol(symbol: string): JournalEntry[] {
    return this.getAllEntries().filter(e => e.symbol === symbol);
  }

  /**
   * Generate a comprehensive trade review report
   * @returns Detailed analysis of all closed trades
   */
  generateReviewReport(): TradeReviewReport {
    const closed = this.getClosedEntries();
    const now = new Date();

    const wins = closed.filter(e => e.isWin === true);
    const losses = closed.filter(e => e.isWin === false);
    const totalPnL = closed.reduce((sum, e) => sum + (e.pnl || 0), 0);
    const grossProfit = wins.reduce((sum, e) => sum + (e.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, e) => sum + (e.pnl || 0), 0));

    // Build setup descriptions from entry reasons and group them
    const setupMap = new Map<string, { pnl: number; wins: number; count: number }>();
    closed.forEach(e => {
      const key = `${e.strategyType}:${e.marketCondition}:${e.entryReason.substring(0, 50)}`;
      const existing = setupMap.get(key) || { pnl: 0, wins: 0, count: 0 };
      existing.pnl += e.pnl || 0;
      existing.count++;
      if (e.isWin) existing.wins++;
      setupMap.set(key, existing);
    });

    const allSetups = Array.from(setupMap.entries()).map(([desc, stats]) => ({
      description: desc,
      avgPnL: stats.count > 0 ? stats.pnl / stats.count : 0,
      count: stats.count,
      winRate: stats.count > 0 ? (stats.wins / stats.count) * 100 : 0
    }));

    const bestSetups = [...allSetups].sort((a, b) => b.avgPnL - a.avgPnL).slice(0, 5);
    const worstSetups = [...allSetups].sort((a, b) => a.avgPnL - b.avgPnL).slice(0, 5);

    // Common mistakes from lessons learned
    const mistakeMap = new Map<string, number>();
    closed.forEach(e => {
      if (e.lessonsLearned) {
        const words = e.lessonsLearned.toLowerCase().split(/[,;.]+/).map(w => w.trim()).filter(w => w.length > 3);
        words.forEach(w => {
          mistakeMap.set(w, (mistakeMap.get(w) || 0) + 1);
        });
      }
    });
    const commonMistakes = Array.from(mistakeMap.entries())
      .map(([mistake, frequency]) => ({ mistake, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    // Stats by time of day
    const timeBuckets = new Map<string, { pnl: number; wins: number; losses: number; count: number; best: number; worst: number }>();
    closed.forEach(e => {
      const hour = e.entryTime.getHours();
      const bucket = hour < 6 ? '00-06' : hour < 12 ? '06-12' : hour < 18 ? '12-18' : '18-24';
      const stats = timeBuckets.get(bucket) || { pnl: 0, wins: 0, losses: 0, count: 0, best: -Infinity, worst: Infinity };
      stats.pnl += e.pnl || 0;
      stats.count++;
      if (e.isWin) stats.wins++; else stats.losses++;
      stats.best = Math.max(stats.best, e.pnl || 0);
      stats.worst = Math.min(stats.worst, e.pnl || 0);
      timeBuckets.set(bucket, stats);
    });
    const statsByTimeOfDay = this.mapToGroupedStats(timeBuckets);

    // Stats by day of week
    const dayBuckets = new Map<string, { pnl: number; wins: number; losses: number; count: number; best: number; worst: number }>();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    closed.forEach(e => {
      const day = dayNames[e.entryTime.getDay()];
      const stats = dayBuckets.get(day) || { pnl: 0, wins: 0, losses: 0, count: 0, best: -Infinity, worst: Infinity };
      stats.pnl += e.pnl || 0;
      stats.count++;
      if (e.isWin) stats.wins++; else stats.losses++;
      stats.best = Math.max(stats.best, e.pnl || 0);
      stats.worst = Math.min(stats.worst, e.pnl || 0);
      dayBuckets.set(day, stats);
    });
    const statsByDayOfWeek = this.mapToGroupedStats(dayBuckets);

    // Stats by market condition
    const conditionBuckets = new Map<string, { pnl: number; wins: number; losses: number; count: number; best: number; worst: number }>();
    closed.forEach(e => {
      const stats = conditionBuckets.get(e.marketCondition) || { pnl: 0, wins: 0, losses: 0, count: 0, best: -Infinity, worst: Infinity };
      stats.pnl += e.pnl || 0;
      stats.count++;
      if (e.isWin) stats.wins++; else stats.losses++;
      stats.best = Math.max(stats.best, e.pnl || 0);
      stats.worst = Math.min(stats.worst, e.pnl || 0);
      conditionBuckets.set(e.marketCondition, stats);
    });
    const statsByMarketCondition = this.mapToGroupedStats(conditionBuckets);

    // Stats by strategy type
    const strategyBuckets = new Map<string, { pnl: number; wins: number; losses: number; count: number; best: number; worst: number }>();
    closed.forEach(e => {
      const stats = strategyBuckets.get(e.strategyType) || { pnl: 0, wins: 0, losses: 0, count: 0, best: -Infinity, worst: Infinity };
      stats.pnl += e.pnl || 0;
      stats.count++;
      if (e.isWin) stats.wins++; else stats.losses++;
      stats.best = Math.max(stats.best, e.pnl || 0);
      stats.worst = Math.min(stats.worst, e.pnl || 0);
      strategyBuckets.set(e.strategyType, stats);
    });
    const statsByStrategyType = this.mapToGroupedStats(strategyBuckets);

    // Stats by emotional state
    const emotionBuckets = new Map<string, { pnl: number; wins: number; losses: number; count: number; best: number; worst: number }>();
    closed.forEach(e => {
      const stats = emotionBuckets.get(e.emotionalState) || { pnl: 0, wins: 0, losses: 0, count: 0, best: -Infinity, worst: Infinity };
      stats.pnl += e.pnl || 0;
      stats.count++;
      if (e.isWin) stats.wins++; else stats.losses++;
      stats.best = Math.max(stats.best, e.pnl || 0);
      stats.worst = Math.min(stats.worst, e.pnl || 0);
      emotionBuckets.set(e.emotionalState, stats);
    });
    const statsByEmotionalState = this.mapToGroupedStats(emotionBuckets);

    return {
      generatedAt: now,
      totalTrades: closed.length,
      overallWinRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
      totalPnL,
      avgPnL: closed.length > 0 ? totalPnL / closed.length : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 0,
      bestSetups,
      worstSetups,
      commonMistakes,
      statsByTimeOfDay,
      statsByDayOfWeek,
      statsByMarketCondition,
      statsByStrategyType,
      statsByEmotionalState
    };
  }

  /**
   * Export the journal to JSON format
   * @returns JSON string of all journal entries
   */
  exportToJSON(): string {
    const data = {
      exportedAt: new Date().toISOString(),
      version: '4.0.0',
      totalEntries: this.entries.size,
      entries: this.getAllEntries().map(e => ({
        ...e,
        entryTime: e.entryTime.toISOString(),
        exitTime: e.exitTime?.toISOString(),
      }))
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import journal entries from JSON
   * @param jsonString - JSON string of journal data
   * @returns Number of entries imported
   */
  importFromJSON(jsonString: string): number {
    const data = JSON.parse(jsonString);
    let count = 0;
    if (data.entries && Array.isArray(data.entries)) {
      for (const entry of data.entries) {
        this.entries.set(entry.id, {
          ...entry,
          entryTime: new Date(entry.entryTime),
          exitTime: entry.exitTime ? new Date(entry.exitTime) : undefined,
        });
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all journal entries
   */
  clear(): void {
    this.entries.clear();
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Convert a bucket map to GroupedStats array
   * @param buckets - Map of group key to aggregated stats
   * @returns Array of GroupedStats
   */
  private mapToGroupedStats(
    buckets: Map<string, { pnl: number; wins: number; losses: number; count: number; best: number; worst: number }>
  ): GroupedStats[] {
    return Array.from(buckets.entries()).map(([group, stats]) => ({
      group,
      count: stats.count,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.count > 0 ? (stats.wins / stats.count) * 100 : 0,
      totalPnL: stats.pnl,
      avgPnL: stats.count > 0 ? stats.pnl / stats.count : 0,
      bestTrade: stats.best === -Infinity ? 0 : stats.best,
      worstTrade: stats.worst === Infinity ? 0 : stats.worst
    }));
  }
}

/** Singleton trade journal instance */
export const tradeJournal = new TradeJournal();
