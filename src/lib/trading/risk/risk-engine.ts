/**
 * Advanced Risk Engine with 4-Layer Circuit Breaker & Dynamic Position Sizing
 *
 * Inspired by Polymarket-bot architecture. Provides layered loss protection
 * that escalates from temporary pauses to permanent halts, plus a consecutive
 * win/loss-adjusted position sizing model.
 *
 * Pure functions only — no class, no framework dependency.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RiskEngineState {
  dailyPnL: number;
  monthlyPnL: number;
  totalPnL: number;
  peakCapital: number;
  currentCapital: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  tradesExecuted: number;
  lastDailyReset: number;
  monthStartTime: number;
  isPaused: boolean;
  pauseUntil: number;
  permanentlyHalted: boolean;
}

export interface RiskEngineConfig {
  dailyMaxLossPct: number;        // default 0.05 (5%)
  monthlyMaxLossPct: number;      // default 0.15 (15%)
  maxDrawdownFromPeak: number;    // default 0.25 (25%)
  totalMaxLossPct: number;        // default 0.40 (40%)
  pauseOnBreachMinutes: number;    // default 60
  enableDynamicSizing: boolean;   // default true
  minPositionPct: number;         // default 0.01 (1%)
  maxPositionPct: number;         // default 0.05 (5%)
  lossSizingReduction: number;    // default 0.20 (20%)
  winSizingIncrease: number;      // default 0.10 (10%)
}

export interface RiskCheckResult {
  allowed: boolean;
  reason: string;
  layer?: 'daily' | 'monthly' | 'drawdown' | 'total';
  pauseMinutes?: number;
}

export interface PositionSizeResult {
  size: number;
  multiplier: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MS_PER_MINUTE = 60 * 1000;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getDefaultConfig(): RiskEngineConfig {
  return {
    dailyMaxLossPct: 0.05,
    monthlyMaxLossPct: 0.15,
    maxDrawdownFromPeak: 0.25,
    totalMaxLossPct: 0.40,
    pauseOnBreachMinutes: 60,
    enableDynamicSizing: true,
    minPositionPct: 0.01,
    maxPositionPct: 0.05,
    lossSizingReduction: 0.20,
    winSizingIncrease: 0.10,
  };
}

export function createDefaultState(initialCapital: number): RiskEngineState {
  return {
    dailyPnL: 0,
    monthlyPnL: 0,
    totalPnL: 0,
    peakCapital: initialCapital,
    currentCapital: initialCapital,
    consecutiveWins: 0,
    consecutiveLosses: 0,
    tradesExecuted: 0,
    lastDailyReset: Date.now(),
    monthStartTime: Date.now(),
    isPaused: false,
    pauseUntil: 0,
    permanentlyHalted: false,
  };
}

// ---------------------------------------------------------------------------
// Circuit Breaker — 4-layer check
// ---------------------------------------------------------------------------

/**
 * Determines whether a new trade is permitted given the current risk state.
 *
 * Layers are checked in order of severity (lightest → heaviest):
 *   1. Daily loss limit  → temporary pause
 *   2. Monthly loss limit → 30-day pause
 *   3. Drawdown from peak → 7-day pause
 *   4. Total loss limit    → permanent halt
 */
export function canTrade(
  state: RiskEngineState,
  config: RiskEngineConfig,
): RiskCheckResult {
  // Permanent halt always blocks
  if (state.permanentlyHalted) {
    return { allowed: false, reason: 'Trading permanently halted — total loss limit exceeded', layer: 'total' };
  }

  // Auto-resume if pause period has elapsed
  if (state.isPaused && Date.now() > state.pauseUntil) {
    return { allowed: true, reason: 'Pause period expired — trading resumed' };
  }

  // Currently inside a pause window
  if (state.isPaused) {
    const remainingMinutes = Math.ceil((state.pauseUntil - Date.now()) / MS_PER_MINUTE);
    return { allowed: false, reason: `Trading paused — ${remainingMinutes} min remaining`, pauseMinutes: remainingMinutes };
  }

  const { currentCapital, peakCapital, dailyPnL, monthlyPnL, totalPnL } = state;

  // Layer 1 — Daily loss limit
  const dailyThreshold = currentCapital * config.dailyMaxLossPct;
  if (dailyPnL <= -dailyThreshold) {
    return {
      allowed: false,
      reason: `Daily loss limit breached (-${(Math.abs(dailyPnL) / currentCapital * 100).toFixed(2)}% of capital)`,
      layer: 'daily',
      pauseMinutes: config.pauseOnBreachMinutes,
    };
  }

  // Layer 2 — Monthly loss limit
  const monthlyThreshold = currentCapital * config.monthlyMaxLossPct;
  if (monthlyPnL <= -monthlyThreshold) {
    return {
      allowed: false,
      reason: `Monthly loss limit breached (-${(Math.abs(monthlyPnL) / currentCapital * 100).toFixed(2)}% of capital)`,
      layer: 'monthly',
      pauseMinutes: 43200, // 30 days
    };
  }

  // Layer 3 — Drawdown from peak
  if (peakCapital > 0) {
    const drawdown = (peakCapital - currentCapital) / peakCapital;
    if (drawdown >= config.maxDrawdownFromPeak) {
      return {
        allowed: false,
        reason: `Max drawdown breached (${(drawdown * 100).toFixed(2)}% from peak)`,
        layer: 'drawdown',
        pauseMinutes: 10080, // 7 days
      };
    }
  }

  // Layer 4 — Total loss limit (measured from original peak capital)
  const totalThreshold = peakCapital * config.totalMaxLossPct;
  if (totalPnL <= -totalThreshold) {
    return {
      allowed: false,
      reason: `Total loss limit breached (-${(Math.abs(totalPnL) / peakCapital * 100).toFixed(2)}% of peak capital)`,
      layer: 'total',
    };
  }

  return { allowed: true, reason: 'All risk checks passed' };
}

// ---------------------------------------------------------------------------
// Dynamic Position Sizing
// ---------------------------------------------------------------------------

/**
 * Adjusts a base position-size percentage according to consecutive
 * win/loss streaks.
 */
export function calculatePositionSize(
  basePct: number,
  state: RiskEngineState,
  config: RiskEngineConfig,
): PositionSizeResult {
  if (!config.enableDynamicSizing) {
    return { size: basePct, multiplier: 1, reason: 'Dynamic sizing disabled' };
  }

  let multiplier = 1;

  // Reduce size after consecutive losses (> 2)
  if (state.consecutiveLosses > 2) {
    const exponent = state.consecutiveLosses - 2;
    multiplier *= Math.pow(config.lossSizingReduction, exponent);
  }

  // Increase size after consecutive wins (> 3)
  if (state.consecutiveWins > 3) {
    const winBonusSteps = Math.min(state.consecutiveWins - 3, 5);
    multiplier *= 1 + winBonusSteps * config.winSizingIncrease;
  }

  let size = basePct * multiplier;

  // Clamp to configured bounds
  size = Math.max(config.minPositionPct, Math.min(config.maxPositionPct, size));

  const parts: string[] = [];
  if (state.consecutiveLosses > 2) {
    parts.push(`reduced ${state.consecutiveLosses} consecutive losses`);
  }
  if (state.consecutiveWins > 3) {
    parts.push(`boosted ${state.consecutiveWins} consecutive wins`);
  }
  if (size === config.minPositionPct) {
    parts.push('clamped to minimum');
  }
  if (size === config.maxPositionPct) {
    parts.push('clamped to maximum');
  }

  return {
    size,
    multiplier,
    reason: parts.length > 0 ? parts.join(', ') : 'base size',
  };
}

// ---------------------------------------------------------------------------
// State Updates
// ---------------------------------------------------------------------------

/**
 * Records the outcome of a trade and returns an **immutable** updated state.
 */
export function recordTrade(
  state: RiskEngineState,
  profit: number,
): RiskEngineState {
  const newCurrentCapital = state.currentCapital + profit;
  const newPeakCapital = newCurrentCapital > state.peakCapital ? newCurrentCapital : state.peakCapital;

  let consecutiveWins = state.consecutiveWins;
  let consecutiveLosses = state.consecutiveLosses;

  if (profit < 0) {
    consecutiveLosses = state.consecutiveLosses + 1;
    consecutiveWins = 0;
  } else if (profit > 0) {
    consecutiveWins = state.consecutiveWins + 1;
    consecutiveLosses = 0;
  }
  // profit === 0 → streaks unchanged

  return {
    ...state,
    tradesExecuted: state.tradesExecuted + 1,
    dailyPnL: state.dailyPnL + profit,
    monthlyPnL: state.monthlyPnL + profit,
    totalPnL: state.totalPnL + profit,
    currentCapital: newCurrentCapital,
    peakCapital: newPeakCapital,
    consecutiveWins,
    consecutiveLosses,
  };
}

// ---------------------------------------------------------------------------
// Auto-Reset
// ---------------------------------------------------------------------------

/**
 * Checks whether daily (24 h) or monthly (30 d) P&L counters should be
 * automatically reset based on elapsed wall-clock time.
 */
export function checkAutoReset(state: RiskEngineState): RiskEngineState {
  const now = Date.now();
  let updated = false;
  let newState = { ...state };

  // Daily reset — 24 hours since lastDailyReset
  if (now - state.lastDailyReset >= 24 * 60 * MS_PER_MINUTE) {
    newState = {
      ...newState,
      dailyPnL: 0,
      lastDailyReset: now,
      isPaused: false,
      pauseUntil: 0,
    };
    updated = true;
  }

  // Monthly reset — 30 days since monthStartTime
  if (now - state.monthStartTime >= 30 * 24 * 60 * MS_PER_MINUTE) {
    newState = {
      ...newState,
      monthlyPnL: 0,
      monthStartTime: now,
    };
    updated = true;
  }

  return updated ? newState : state;
}
