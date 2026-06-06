/**
 * Signal Generation Engine for Mantle AI Trading Bot
 * AI-powered signal generation with comprehensive analysis and rating system
 * 
 * v4.0.0 - Added: Ichimoku Cloud indicator, Stochastic Oscillator (%K/%D),
 * overbought/oversold signals, integrated into technical analysis scoring
 * v3.0.0 - Added: Bollinger Bands, VWAP, ADX, Volume Profile, Multi-timeframe
 * signal confirmation, Signal quality scoring (0-100)
 * v2.0.0 - Fixed: MACD calculation, sentiment label ordering, RSI Wilder smoothing,
 * proper signal status enum usage, input validation, and memory efficiency
 */

import ZAI from 'z-ai-web-dev-sdk';
import {
  Signal,
  SignalGenerationInput,
  SignalGenerationOutput,
  SignalAnalysis,
  SignalDetails,
  TechnicalAnalysis,
  FundamentalAnalysis,
  SentimentAnalysis,
  RiskAssessment,
  TradeAction,
  RiskLevel,
  SentimentLabel,
  SignalStatus,
  TimeFrame,
  MarketDataPoint,
  NewsArticle,
  StrategyType,
  StrategyWeights,
  ActiveScanResult,
  NewsSignal,
} from '../core/types';
// QA-FIX #3: Import newsAggregator and vectorStore singletons used in performSentimentAnalysis
import { newsAggregator } from '../news/news-aggregator';
import { vectorStore } from '../../vector/vector-store';

// Technical analysis helpers
function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  if (data.length < period) return result;
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

function calculateEMA(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // Use SMA as the first EMA value for proper seeding
  if (data.length < period) {
    result[0] = data[0];
    for (let i = 1; i < data.length; i++) {
      result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
    }
    return result;
  }

  // Seed with SMA of first `period` values
  const seed = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = seed;

  for (let i = period; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
  }

  // Fill in the early values with the seed for consistency
  for (let i = 0; i < period - 1; i++) {
    result[i] = seed;
  }

  return result;
}

/**
 * Calculate RSI using Wilder's smoothing method (standard approach)
 * Fixed: Previously used simple average which gave inaccurate results
 */
function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50; // Neutral for insufficient data
  
  let gains = 0;
  let losses = 0;
  
  // First average: simple average of first `period` changes
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // Wilder's smoothing for remaining data
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const currentGain = diff > 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;
    
    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
  }
  
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate MACD with proper signal line
 * Fixed: Previously generated a fake signal line from constant values
 */
function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  if (closes.length < 26) {
    return { macd: 0, signal: 0, histogram: 0 };
  }

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  
  // Calculate MACD line values
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] !== undefined && ema26[i] !== undefined) {
      macdLine.push(ema12[i] - ema26[i]);
    }
  }
  
  if (macdLine.length < 9) {
    const lastMacd = macdLine[macdLine.length - 1] || 0;
    return { macd: lastMacd, signal: lastMacd, histogram: 0 };
  }
  
  // Calculate signal line as 9-period EMA of MACD line
  const signalEma = calculateEMA(macdLine, 9);
  
  const macd = macdLine[macdLine.length - 1];
  const signal = signalEma[signalEma.length - 1];
  const histogram = macd - signal;
  
  return { macd, signal, histogram };
}

/**
 * Calculate Bollinger Bands
 * Returns upper band, middle band (SMA), lower band, and bandwidth
 * @param closes - Array of closing prices
 * @param period - Period for SMA (default 20)
 * @param stdDevMultiplier - Standard deviation multiplier (default 2)
 * @returns Bollinger Bands data
 */
export function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): { upper: number; middle: number; lower: number; bandwidth: number; percentB: number; squeeze: boolean } {
  if (closes.length < period) {
    return { upper: 0, middle: 0, lower: 0, bandwidth: 0, percentB: 0, squeeze: false };
  }

  const recentCloses = closes.slice(-period);
  const middle = recentCloses.reduce((a, b) => a + b, 0) / period;

  // Calculate standard deviation
  const variance = recentCloses.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + stdDevMultiplier * stdDev;
  const lower = middle - stdDevMultiplier * stdDev;
  const bandwidth = middle > 0 ? (upper - lower) / middle : 0;

  // %B indicator: where price is relative to the bands (0-1 = within bands)
  const lastClose = closes[closes.length - 1];
  const percentB = (upper - lower) > 0 ? (lastClose - lower) / (upper - lower) : 0.5;

  // Squeeze detection: bandwidth is below its own lower band
  // Calculate bandwidth over last 100 periods for squeeze context
  const bandwidths: number[] = [];
  for (let i = period; i <= closes.length; i++) {
    const slice = closes.slice(i - period, i);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const v = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const sd = Math.sqrt(v);
    const bw = sma > 0 ? ((sma + stdDevMultiplier * sd) - (sma - stdDevMultiplier * sd)) / sma : 0;
    bandwidths.push(bw);
  }

  // QA-FIX #1: Use a sorted copy for squeeze detection to avoid mutating the bandwidths array.
  // The original code used .sort() which mutates in-place, causing surprising side effects.
  const sortedBandwidths = [...bandwidths].sort((a, b) => a - b);
  const squeeze = bandwidths.length >= 10 &&
    bandwidth <= sortedBandwidths[Math.floor(sortedBandwidths.length * 0.2)];

  return { upper, middle, lower, bandwidth, percentB, squeeze };
}

/**
 * Calculate VWAP (Volume Weighted Average Price)
 * VWAP = cumulative(price * volume) / cumulative(volume)
 * Typical price = (high + low + close) / 3
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of closing prices
 * @param volumes - Array of volume data
 * @returns VWAP value and deviation bands
 */
export function calculateVWAP(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[]
): { vwap: number; upperBand: number; lowerBand: number; deviation: number } {
  if (closes.length === 0 || highs.length !== lows.length || highs.length !== closes.length || highs.length !== volumes.length) {
    return { vwap: 0, upperBand: 0, lowerBand: 0, deviation: 0 };
  }

  let cumulativeTPV = 0; // cumulative (typical price * volume)
  let cumulativeVolume = 0;
  let cumulativeTPV2 = 0; // for variance calculation

  for (let i = 0; i < closes.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    const tpv = typicalPrice * volumes[i];
    cumulativeTPV += tpv;
    cumulativeVolume += volumes[i];
    cumulativeTPV2 += typicalPrice * typicalPrice * volumes[i];
  }

  if (cumulativeVolume === 0) {
    return { vwap: closes[closes.length - 1] || 0, upperBand: 0, lowerBand: 0, deviation: 0 };
  }

  const vwap = cumulativeTPV / cumulativeVolume;

  // Calculate standard deviation for bands
  const variance = (cumulativeTPV2 / cumulativeVolume) - (vwap * vwap);
  const deviation = Math.sqrt(Math.max(0, variance));

  return {
    vwap,
    upperBand: vwap + 2 * deviation,
    lowerBand: vwap - 2 * deviation,
    deviation
  };
}

/**
 * Calculate ADX (Average Directional Index) for trend strength
 * ADX > 25 indicates a strong trend, < 20 indicates no clear trend
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of closing prices
 * @param period - Period for calculation (default 14)
 * @returns ADX value, +DI, -DI, and trend strength assessment
 */
export function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): { adx: number; plusDI: number; minusDI: number; trendStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE' } {
  if (highs.length < period * 2) {
    return { adx: 0, plusDI: 0, minusDI: 0, trendStrength: 'NONE' };
  }

  // Calculate True Range and Directional Movement
  const trueRanges: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < highs.length; i++) {
    // True Range
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);

    // Directional Movement
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];

    if (upMove > downMove && upMove > 0) {
      plusDM.push(upMove);
      minusDM.push(0);
    } else if (downMove > upMove && downMove > 0) {
      plusDM.push(0);
      minusDM.push(downMove);
    } else {
      plusDM.push(0);
      minusDM.push(0);
    }
  }

  // Wilder's smoothing for the initial values
  let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  // Calculate +DI and -DI arrays
  const dxValues: number[] = [];

  for (let i = period; i < trueRanges.length; i++) {
    smoothedTR = smoothedTR - (smoothedTR / period) + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];

    const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;

    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? Math.abs(plusDI - minusDI) / diSum * 100 : 0;
    dxValues.push(dx);
  }

  // Calculate ADX as smoothed average of DX
  if (dxValues.length < period) {
    const lastDX = dxValues[dxValues.length - 1] || 0;
    const lastPlusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const lastMinusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
    const ts: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE' = lastDX > 50 ? 'STRONG' : lastDX > 25 ? 'MODERATE' : lastDX > 20 ? 'WEAK' : 'NONE';
    return { adx: lastDX, plusDI: lastPlusDI, minusDI: lastMinusDI, trendStrength: ts };
  }

  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }

  const lastPlusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
  const lastMinusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;

  const trendStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE' =
    adx > 50 ? 'STRONG' : adx > 25 ? 'MODERATE' : adx > 20 ? 'WEAK' : 'NONE';

  return { adx, plusDI: lastPlusDI, minusDI: lastMinusDI, trendStrength };
}

/**
 * Calculate Volume Profile
 * Identifies price levels with the highest trading volume (Point of Control)
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of closing prices
 * @param volumes - Array of volume data
 * @param buckets - Number of price buckets (default 10)
 * @returns Volume profile data with POC and value areas
 */
export function calculateVolumeProfile(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  buckets: number = 10
): {
  poc: number; // Point of Control (price with most volume)
  valueAreaHigh: number; // 70% value area high
  valueAreaLow: number; // 70% value area low
  profile: Array<{ priceLevel: number; volume: number; percent: number }>;
} {
  if (closes.length === 0) {
    return { poc: 0, valueAreaHigh: 0, valueAreaLow: 0, profile: [] };
  }

  const priceHigh = Math.max(...highs);
  const priceLow = Math.min(...lows);
  const priceRange = priceHigh - priceLow;

  if (priceRange === 0) {
    return { poc: priceHigh, valueAreaHigh: priceHigh, valueAreaLow: priceLow, profile: [] };
  }

  const bucketSize = priceRange / buckets;
  const volumeByBucket: number[] = new Array(buckets).fill(0);

  // Distribute volume across buckets
  for (let i = 0; i < closes.length; i++) {
    const bucketIndex = Math.min(
      Math.floor((closes[i] - priceLow) / bucketSize),
      buckets - 1
    );
    volumeByBucket[bucketIndex] += volumes[i];
  }

  const totalVolume = volumeByBucket.reduce((a, b) => a + b, 0);

  // Find POC (bucket with highest volume)
  let pocBucket = 0;
  let maxVolume = 0;
  for (let i = 0; i < buckets; i++) {
    if (volumeByBucket[i] > maxVolume) {
      maxVolume = volumeByBucket[i];
      pocBucket = i;
    }
  }

  const poc = priceLow + (pocBucket + 0.5) * bucketSize;

  // Calculate value area (70% of volume around POC)
  let valueAreaVolume = maxVolume;
  let lowBucket = pocBucket;
  let highBucket = pocBucket;

  while (valueAreaVolume / totalVolume < 0.7 && (lowBucket > 0 || highBucket < buckets - 1)) {
    const lowerVolume = lowBucket > 0 ? volumeByBucket[lowBucket - 1] : 0;
    const upperVolume = highBucket < buckets - 1 ? volumeByBucket[highBucket + 1] : 0;

    if (lowerVolume >= upperVolume && lowBucket > 0) {
      lowBucket--;
      valueAreaVolume += volumeByBucket[lowBucket];
    } else if (highBucket < buckets - 1) {
      highBucket++;
      valueAreaVolume += volumeByBucket[highBucket];
    } else {
      lowBucket--;
      valueAreaVolume += volumeByBucket[lowBucket];
    }
  }

  const profile = volumeByBucket.map((vol, i) => ({
    priceLevel: priceLow + (i + 0.5) * bucketSize,
    volume: vol,
    percent: totalVolume > 0 ? vol / totalVolume : 0
  }));

  return {
    poc,
    valueAreaHigh: priceLow + (highBucket + 1) * bucketSize,
    valueAreaLow: priceLow + lowBucket * bucketSize,
    profile
  };
}

function findSupportResistance(
  highs: number[],
  lows: number[],
  closes: number[]
): { support: number[]; resistance: number[] } {
  const support: number[] = [];
  const resistance: number[] = [];
  
  if (highs.length < 5) return { support, resistance };
  
  for (let i = 2; i < highs.length - 2; i++) {
    // Support: local low
    if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
        lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
      support.push(lows[i]);
    }
    
    // Resistance: local high
    if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
        highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
      resistance.push(highs[i]);
    }
  }
  
  // Sort and deduplicate
  support.sort((a, b) => b - a);
  resistance.sort((a, b) => a - b);
  
  return {
    support: [...new Set(support)].slice(0, 5),
    resistance: [...new Set(resistance)].slice(0, 5)
  };
}

function detectPatterns(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[]
): string[] {
  const patterns: string[] = [];
  const len = closes.length;
  
  if (len < 5) return patterns;
  
  const lastOpen = opens[len - 1];
  const lastClose = closes[len - 1];
  const lastHigh = highs[len - 1];
  const lastLow = lows[len - 1];
  const bodySize = Math.abs(lastClose - lastOpen);
  const range = lastHigh - lastLow;
  
  // Guard against zero range
  if (range === 0) return patterns;
  
  // Doji - very small body relative to range
  if (bodySize < range * 0.1) {
    patterns.push('DOJI');
  }
  
  // Hammer - small body at top, long lower shadow
  if (bodySize < range * 0.3 && 
      (Math.min(lastOpen, lastClose) - lastLow) > range * 0.6) {
    patterns.push('HAMMER');
  }

  // Inverted Hammer - small body at bottom, long upper shadow
  if (bodySize < range * 0.3 &&
      (lastHigh - Math.max(lastOpen, lastClose)) > range * 0.6) {
    patterns.push('INVERTED_HAMMER');
  }
  
  // Bullish Engulfing
  if (len >= 2) {
    const prevClose = closes[len - 2];
    const prevOpen = opens[len - 2];
    
    if (prevClose < prevOpen && // Previous bearish
        lastClose > lastOpen && // Current bullish
        lastOpen <= prevClose && // Opens at or below prev close (fixed: was <)
        lastClose >= prevOpen) { // Closes at or above prev open (fixed: was >)
      patterns.push('BULLISH_ENGULFING');
    }
  }
  
  // Bearish Engulfing
  if (len >= 2) {
    const prevClose = closes[len - 2];
    const prevOpen = opens[len - 2];
    
    if (prevClose > prevOpen && // Previous bullish
        lastClose < lastOpen && // Current bearish
        lastOpen >= prevClose && // Opens at or above prev close (fixed: was >)
        lastClose <= prevOpen) { // Closes at or below prev open (fixed: was <)
      patterns.push('BEARISH_ENGULFING');
    }
  }
  
  // Morning Star
  if (len >= 3) {
    const firstClose = closes[len - 3];
    const firstOpen = opens[len - 3];
    const secondClose = closes[len - 2];
    const secondOpen = opens[len - 2];
    const secondBody = Math.abs(secondClose - secondOpen);
    // Fixed: Use high-low range (full candle), not just body range
    const secondRange = highs[len - 2] - lows[len - 2];
    
    if (firstClose < firstOpen && // First bearish
        (secondRange === 0 || secondBody < secondRange * 0.3) && // Small body relative to full range
        lastClose > lastOpen && lastClose > (firstOpen + firstClose) / 2) { // Bullish third
      patterns.push('MORNING_STAR');
    }
  }

  // Evening Star
  if (len >= 3) {
    const firstClose = closes[len - 3];
    const firstOpen = opens[len - 3];
    const secondClose = closes[len - 2];
    const secondOpen = opens[len - 2];
    const secondBody = Math.abs(secondClose - secondOpen);
    // Fixed: Use high-low range (full candle), not just body range
    const secondRange = highs[len - 2] - lows[len - 2];

    if (firstClose > firstOpen && // First bullish
        (secondRange === 0 || secondBody < secondRange * 0.3) && // Small body
        lastClose < lastOpen && lastClose < (firstOpen + firstClose) / 2) { // Bearish third
      patterns.push('EVENING_STAR');
    }
  }
  
  return patterns;
}

/**
 * Calculate Ichimoku Cloud indicator
 * Provides trend direction, support/resistance, and momentum signals
 * 
 * Components:
 * - Tenkan-sen (Conversion Line): (9-period high + 9-period low) / 2
 * - Kijun-sen (Base Line): (26-period high + 26-period low) / 2
 * - Senkou Span A: (Tenkan + Kijun) / 2, plotted 26 periods ahead
 * - Senkou Span B: (52-period high + 52-period low) / 2, plotted 26 periods ahead
 * - Chikou Span: Close plotted 26 periods back
 * 
 * @param highs - Array of high prices (minimum 52 periods for full calculation)
 * @param lows - Array of low prices
 * @param closes - Array of closing prices
 * @param tenkanPeriod - Tenkan-sen period (default 9)
 * @param kijunPeriod - Kijun-sen period (default 26)
 * @param senkouPeriod - Senkou Span B period (default 52)
 * @param displacement - Forward displacement for Senkou spans (default 26)
 * @returns Ichimoku Cloud data with trend signal
 */
export function calculateIchimoku(
  highs: number[],
  lows: number[],
  closes: number[],
  tenkanPeriod: number = 9,
  kijunPeriod: number = 26,
  senkouPeriod: number = 52,
  displacement: number = 26
): {
  tenkanSen: number;
  kijunSen: number;
  senkouSpanA: number;
  senkouSpanB: number;
  chikouSpan: number;
  cloudTop: number;
  cloudBottom: number;
  trendSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  priceVsCloud: 'ABOVE' | 'BELOW' | 'INSIDE';
} {
  // Helper: calculate the midpoint of the highest high and lowest low over N periods
  // Fixed: Ichimoku requires (highest_high + lowest_low) / 2 using BOTH arrays
  const midPointHL = (highArr: number[], lowArr: number[], period: number): number => {
    if (highArr.length < period || lowArr.length < period) {
      return highArr.length > 0 ? (highArr[highArr.length - 1] + lowArr[lowArr.length - 1]) / 2 : 0;
    }
    const highSlice = highArr.slice(-period);
    const lowSlice = lowArr.slice(-period);
    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);
    return (highestHigh + lowestLow) / 2;
  };

  // Tenkan-sen (Conversion Line)
  const tenkanSen = midPointHL(highs, lows, tenkanPeriod);

  // Kijun-sen (Base Line)
  const kijunSen = midPointHL(highs, lows, kijunPeriod);

  // For Senkou spans, we need historical data projected forward.
  // Since we can only compute from available data, we use the most recent values.
  // In a real charting application, these would be shifted forward by `displacement` periods.
  // Here we compute the current values as if they will be plotted ahead.
  
  // Senkou Span A: (Tenkan + Kijun) / 2
  // For historical context, we compute using data from `displacement` periods ago
  const historicalTenkan = highs.length > displacement + tenkanPeriod
    ? midPointHL(highs.slice(0, -displacement), lows.slice(0, -displacement), tenkanPeriod)
    : tenkanSen;
  const historicalKijun = highs.length > displacement + kijunPeriod
    ? midPointHL(highs.slice(0, -displacement), lows.slice(0, -displacement), kijunPeriod)
    : kijunSen;
  const senkouSpanA = (historicalTenkan + historicalKijun) / 2;

  // Senkou Span B: (52-period high + 52-period low) / 2
  const senkouSpanB = highs.length > displacement + senkouPeriod
    ? midPointHL(highs.slice(0, -displacement), lows.slice(0, -displacement), senkouPeriod)
    : midPointHL(highs, lows, senkouPeriod);

  // Chikou Span: Current close plotted 26 periods back
  const chikouSpan = closes.length > displacement
    ? closes[closes.length - 1]
    : closes[closes.length - 1] || 0;

  // Cloud boundaries
  const cloudTop = Math.max(senkouSpanA, senkouSpanB);
  const cloudBottom = Math.min(senkouSpanA, senkouSpanB);

  // Determine price position relative to cloud
  const lastClose = closes[closes.length - 1] || 0;
  let priceVsCloud: 'ABOVE' | 'BELOW' | 'INSIDE' = 'INSIDE';
  if (lastClose > cloudTop) priceVsCloud = 'ABOVE';
  else if (lastClose < cloudBottom) priceVsCloud = 'BELOW';

  // Determine trend signal
  let trendSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  
  // Bullish: price above cloud and Tenkan > Kijun
  if (priceVsCloud === 'ABOVE' && tenkanSen > kijunSen) {
    trendSignal = 'BULLISH';
  }
  // Bearish: price below cloud and Tenkan < Kijun
  else if (priceVsCloud === 'BELOW' && tenkanSen < kijunSen) {
    trendSignal = 'BEARISH';
  }
  // Cloud twist: Senkou Span A crosses Senkou Span B (future trend change)
  else if (senkouSpanA > senkouSpanB && priceVsCloud !== 'BELOW') {
    trendSignal = 'BULLISH';
  } else if (senkouSpanB > senkouSpanA && priceVsCloud !== 'ABOVE') {
    trendSignal = 'BEARISH';
  }

  return {
    tenkanSen,
    kijunSen,
    senkouSpanA,
    senkouSpanB,
    chikouSpan,
    cloudTop,
    cloudBottom,
    trendSignal,
    priceVsCloud
  };
}

/**
 * Calculate Stochastic Oscillator (%K and %D)
 * Measures the position of the close relative to the high-low range over N periods
 * 
 * %K = (Current Close - Lowest Low) / (Highest High - Lowest Low) * 100
 * %D = 3-period SMA of %K
 * 
 * Overbought: %K > 80 (potential sell signal)
 * Oversold: %K < 20 (potential buy signal)
 * 
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of closing prices
 * @param kPeriod - Lookback period for %K (default 14)
 * @param dPeriod - Smoothing period for %D (default 3)
 * @returns Stochastic Oscillator values and signals
 */
export function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number = 14,
  dPeriod: number = 3
): {
  percentK: number;
  percentD: number;
  isOverbought: boolean;
  isOversold: boolean;
  signal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  crossover: 'BULLISH' | 'BEARISH' | 'NONE';
} {
  if (closes.length < kPeriod || highs.length < kPeriod || lows.length < kPeriod) {
    return {
      percentK: 50,
      percentD: 50,
      isOverbought: false,
      isOversold: false,
      signal: 'NEUTRAL',
      crossover: 'NONE'
    };
  }

  // Calculate %K values for the last (kPeriod + dPeriod) periods to get %D
  const kValues: number[] = [];
  const lookbackCount = Math.min(closes.length, kPeriod + dPeriod + 10);

  for (let i = lookbackCount; i <= closes.length; i++) {
    const highSlice = highs.slice(i - kPeriod, i);
    const lowSlice = lows.slice(i - kPeriod, i);
    const currentClose = closes[i - 1];

    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);
    const range = highestHigh - lowestLow;

    if (range === 0) {
      kValues.push(50); // Neutral if no range
    } else {
      kValues.push(((currentClose - lowestLow) / range) * 100);
    }
  }

  // Current %K is the last value
  // Use ?? instead of || to handle the case where %K is exactly 0 (falsy with ||)
  const percentK = kValues[kValues.length - 1] ?? 50;

  // %D is the SMA of the last dPeriod %K values
  let percentD = percentK;
  if (kValues.length >= dPeriod) {
    const dSlice = kValues.slice(-dPeriod);
    percentD = dSlice.reduce((a, b) => a + b, 0) / dPeriod;
  }

  // Determine signals
  const isOverbought = percentK > 80;
  const isOversold = percentK < 20;
  let signal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' = 'NEUTRAL';
  if (isOverbought) signal = 'OVERBOUGHT';
  else if (isOversold) signal = 'OVERSOLD';

  // Detect %K/%D crossover for trading signals
  let crossover: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';
  if (kValues.length >= 2) {
    const prevK = kValues[kValues.length - 2];
    // Calculate previous %D for crossover comparison
    let prevD = prevK;
    if (kValues.length >= dPeriod + 1) {
      const prevDSlice = kValues.slice(-(dPeriod + 1), -1);
      prevD = prevDSlice.reduce((a, b) => a + b, 0) / dPeriod;
    }
    // Bullish crossover: %K crosses above %D in oversold zone
    if (prevK <= prevD && percentK > percentD && isOversold) {
      crossover = 'BULLISH';
    }
    // Bearish crossover: %K crosses below %D in overbought zone
    else if (prevK >= prevD && percentK < percentD && isOverbought) {
      crossover = 'BEARISH';
    }
  }

  return {
    percentK,
    percentD,
    isOverbought,
    isOversold,
    signal,
    crossover
  };
}

export class SignalEngine {
  private zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;
  private aiInitialized = false;

  constructor() {
    this.initAI();
  }

  private async initAI(): Promise<void> {
    if (this.aiInitialized) return;
    try {
      this.zai = await ZAI.create();
      this.aiInitialized = true;
    } catch (error) {
      console.warn('SignalEngine: AI initialization failed, using fallback reasoning:', error);
      this.aiInitialized = true; // Don't keep retrying
    }
  }

  /**
   * Ensure AI is initialized before using it
   */
  private async ensureAI(): Promise<void> {
    if (!this.aiInitialized) {
      await this.initAI();
    }
  }

  /**
   * Generate trading signal with comprehensive analysis
   */
  async generateSignal(input: SignalGenerationInput): Promise<SignalGenerationOutput> {
    // Validate input
    if (!input.symbol || input.symbol.trim() === '') {
      throw new Error('Symbol is required for signal generation');
    }
    if (!input.marketData || input.marketData.length === 0) {
      throw new Error('Market data is required for signal generation');
    }

    await this.ensureAI();
    
    // Perform technical analysis
    const technicalAnalysis = this.performTechnicalAnalysis(input.marketData);
    
    // Perform fundamental analysis
    const fundamentalAnalysis = await this.performFundamentalAnalysis(
      input.symbol,
      input.newsArticles
    );
    
    // Perform sentiment analysis
    const sentimentAnalysis = await this.performSentimentAnalysis(
      input.symbol,
      input.newsArticles
    );
    
    // Calculate overall score
    const overallScore = this.calculateOverallScore(
      technicalAnalysis,
      fundamentalAnalysis,
      sentimentAnalysis,
      input.strategyName
    );
    
    // Determine action
    const action = this.determineAction(
      technicalAnalysis,
      fundamentalAnalysis,
      sentimentAnalysis,
      overallScore,
      input.strategyName
    );
    
    // Generate reasoning using AI
    const reasoning = await this.generateReasoning(
      input.symbol,
      action,
      technicalAnalysis,
      fundamentalAnalysis,
      sentimentAnalysis
    );
    
    // Calculate confidence
    const confidence = this.calculateConfidence(
      technicalAnalysis,
      fundamentalAnalysis,
      sentimentAnalysis,
      overallScore
    );
    
    // Assess risk
    const riskAssessment = this.assessRisk(
      input.symbol,
      action,
      technicalAnalysis,
      input.marketData
    );
    
    // Calculate targets
    const currentPrice = input.marketData[input.marketData.length - 1]?.close || 0;
    const { priceTarget, stopLoss, takeProfit } = this.calculateTargets(
      action,
      currentPrice,
      technicalAnalysis,
      riskAssessment
    );
    
    // Calculate signal quality score
    const qualityScore = this.calculateSignalQualityScore(
      technicalAnalysis,
      sentimentAnalysis,
      action
    );

    // Build signal with proper enum usage
    const signal: Omit<Signal, 'id' | 'createdAt' | 'updatedAt'> = {
      symbol: input.symbol,
      action,
      confidence,
      rating: qualityScore, // Now uses quality score instead of fixed 0
      priceTarget,
      stopLoss,
      takeProfit,
      reasoning,
      newsSources: input.newsArticles.slice(0, 5).map(a => a.sourceUrl).filter((url): url is string => Boolean(url)),
      sentimentScore: sentimentAnalysis.overallSentiment,
      technicalScore: technicalAnalysis.score,
      fundamentalScore: fundamentalAnalysis.score,
      status: SignalStatus.PENDING, // Fixed: Was using string literal
      demo: false
    };
    
    // Build analysis
    const analysis: SignalAnalysis = {
      technicalAnalysis,
      fundamentalAnalysis,
      sentimentAnalysis,
      overallScore,
      keyFactors: this.extractKeyFactors(
        technicalAnalysis,
        fundamentalAnalysis,
        sentimentAnalysis
      ),
      warnings: this.generateWarnings(
        technicalAnalysis,
        fundamentalAnalysis,
        sentimentAnalysis,
        riskAssessment
      )
    };

    // Build professional signal details
    const signalDetails = this.buildSignalDetails(
      input.symbol,
      action,
      currentPrice,
      technicalAnalysis,
      fundamentalAnalysis,
      sentimentAnalysis,
      riskAssessment,
      input.timeframe,
      input.newsArticles
    );
    
    return {
      signal,
      analysis,
      riskAssessment,
      signalDetails
    };
  }

  // ==================== STRATEGY CONFIGURATION ====================

  private static readonly STRATEGY_WEIGHTS: Record<string, StrategyWeights> = {
    [StrategyType.DEFAULT]: {
      technical: 0.50, fundamental: 0.25, sentiment: 0.25,
      label: 'Balanced', description: 'Equal weight across all factors'
    },
    [StrategyType.MOMENTUM]: {
      technical: 0.65, fundamental: 0.10, sentiment: 0.25,
      label: 'Momentum', description: 'Follows RSI trend + MACD momentum + volume surge'
    },
    [StrategyType.BREAKOUT]: {
      technical: 0.70, fundamental: 0.15, sentiment: 0.15,
      label: 'Breakout', description: 'Bollinger squeeze + ADX strength + resistance proximity'
    },
    [StrategyType.MEAN_REVERSION]: {
      technical: 0.55, fundamental: 0.10, sentiment: 0.35,
      label: 'Mean Reversion', description: 'RSI extreme + Bollinger band bounce + S/R proximity'
    },
    [StrategyType.VWAP_TWAP]: {
      technical: 0.60, fundamental: 0.20, sentiment: 0.20,
      label: 'VWAP/TWAP', description: 'Price vs VWAP spread + volume profile analysis'
    },
  };

  private getStrategyWeights(strategy?: StrategyType): StrategyWeights {
    if (strategy && SignalEngine.STRATEGY_WEIGHTS[strategy]) {
      return SignalEngine.STRATEGY_WEIGHTS[strategy];
    }
    return SignalEngine.STRATEGY_WEIGHTS[StrategyType.DEFAULT];
  }

  /**
   * Generate signal with a specific strategy
   * Reuses technical analysis, applies strategy-specific scoring
   */
  async generateSignalWithStrategy(
    input: SignalGenerationInput,
    strategy: StrategyType = StrategyType.DEFAULT
  ): Promise<ActiveScanResult> {
    const baseOutput = await this.generateSignal({ ...input, strategyName: strategy });
    return {
      ...baseOutput,
      strategyName: strategy,
      signalType: 'TECHNICAL' as const,
      scannedAt: new Date().toISOString(),
    };
  }

  /**
   * Multi-pair scan: run all strategies across multiple symbols in parallel
   */
  async scanPairs(
    symbols: string[],
    strategies: StrategyType[],
    timeframe: TimeFrame,
    newsArticles: NewsArticle[]
  ): Promise<ActiveScanResult[]> {
    const allResults: ActiveScanResult[] = [];

    // Generate market data for all symbols first
    const marketDataMap = new Map<string, MarketDataPoint[]>();
    for (const symbol of symbols) {
      marketDataMap.set(symbol, this.generateDemoMarketData(symbol, 200));
    }

    // Run all strategy+symbol combos in parallel (batched to avoid overload)
    const combos: Array<{ symbol: string; strategy: StrategyType }> = [];
    for (const symbol of symbols) {
      for (const strategy of strategies) {
        combos.push({ symbol, strategy });
      }
    }

    // Process in batches of 5
    const BATCH_SIZE = 5;
    for (let i = 0; i < combos.length; i += BATCH_SIZE) {
      const batch = combos.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(({ symbol, strategy }) =>
          this.generateSignalWithStrategy(
            {
              symbol,
              timeframe,
              marketData: marketDataMap.get(symbol) || [],
              newsArticles,
            },
            strategy
          )
        )
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          allResults.push(result.value);
        }
      }
    }

    // Sort by confidence descending, only keep non-HOLD signals
    return allResults
      .filter(r => r.signal.action !== TradeAction.HOLD)
      .sort((a, b) => b.signal.confidence - a.signal.confidence);
  }

  /**
   * Generate news-based signals from breaking/high-impact articles
   */
  async generateNewsSignals(
    symbols: string[],
    newsArticles: NewsArticle[]
  ): Promise<NewsSignal[]> {
    const signals: NewsSignal[] = [];
    const recentCutoff = Date.now() - 6 * 60 * 60 * 1000; // last 6 hours
    const recentNews = newsArticles.filter(a => {
      const pubDate = a.publishedAt ? new Date(a.publishedAt).getTime() : a.fetchedAt.getTime();
      return pubDate >= recentCutoff && (a.importance || 0.5) >= 0.5;
    });

    if (recentNews.length === 0) return signals;

    // Compute aggregate sentiment per symbol from recent news
    const symbolSentiment = new Map<string, { total: number; count: number; highImpact: number; keywords: string[] }>();

    for (const symbol of symbols) {
      const tag = symbol.replace('USDT', '').replace('USD', '');
      let total = 0;
      let count = 0;
      let highImpact = 0;
      const keywords: string[] = [];

      for (const article of recentNews) {
        const titleLower = (article.title || '').toLowerCase();
        const contentLower = (article.content || '').toLowerCase();
        const text = `${titleLower} ${contentLower}`;
        if (text.includes(tag.toLowerCase())) {
          total += article.sentiment || 0;
          count++;
          if ((article.importance || 0) >= 0.7) highImpact++;
          if (article.tags) keywords.push(...article.tags.slice(0, 3));
        }
      }

      if (count > 0) {
        symbolSentiment.set(symbol, {
          total: total / count,
          count,
          highImpact,
          keywords: [...new Set(keywords)].slice(0, 5),
        });
      }
    }

    // Generate signals from sentiment shifts
    for (const [symbol, data] of symbolSentiment) {
      const avgSentiment = data.total;
      let action: TradeAction;
      let confidence: number;
      let reasoning: string;

      if (avgSentiment >= 0.4) {
        action = TradeAction.BUY;
        confidence = Math.min(0.9, 0.5 + avgSentiment * 0.4 + data.highImpact * 0.05);
        reasoning = `Strong bullish news sentiment (${(avgSentiment * 100).toFixed(0)}%) across ${data.count} recent article(s). ${data.highImpact} high-impact event(s). Keywords: ${data.keywords.join(', ') || 'none'}`;
      } else if (avgSentiment <= -0.4) {
        action = TradeAction.SELL;
        confidence = Math.min(0.9, 0.5 + Math.abs(avgSentiment) * 0.4 + data.highImpact * 0.05);
        reasoning = `Strong bearish news sentiment (${(avgSentiment * 100).toFixed(0)}%) across ${data.count} recent article(s). ${data.highImpact} high-impact event(s). Keywords: ${data.keywords.join(', ') || 'none'}`;
      } else if (avgSentiment >= 0.15) {
        action = TradeAction.BUY;
        confidence = 0.3 + avgSentiment * 0.3;
        reasoning = `Mildly bullish news sentiment (${(avgSentiment * 100).toFixed(0)}%) across ${data.count} article(s). Moderate conviction.`;
      } else if (avgSentiment <= -0.15) {
        action = TradeAction.SELL;
        confidence = 0.3 + Math.abs(avgSentiment) * 0.3;
        reasoning = `Mildly bearish news sentiment (${(avgSentiment * 100).toFixed(0)}%) across ${data.count} article(s). Moderate conviction.`;
      } else {
        continue; // Skip neutral sentiment
      }

      const sourceArticle = recentNews
        .filter(a => {
          const tag = symbol.replace('USDT', '').replace('USD', '');
          return (a.title || '').toLowerCase().includes(tag.toLowerCase());
        })
        .sort((a, b) => (b.importance || 0) - (a.importance || 0))[0]?.title || 'Multiple sources';

      signals.push({
        symbol,
        action,
        confidence: Math.round(confidence * 100) / 100,
        reasoning,
        sourceArticle,
        sentimentShift: avgSentiment,
        importance: Math.min(1, data.highImpact * 0.3 + data.count * 0.1),
        strategyName: 'NEWS' as string,
        signalType: 'NEWS',
        generatedAt: new Date().toISOString(),
        indicators: {
          newsSentiment: avgSentiment,
          articleCount: data.count,
          highImpactCount: data.highImpact,
          topicKeywords: data.keywords,
        },
      });
    }

    return signals.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Generate demo market data (shared between scan and single signal)
   */
  generateDemoMarketData(symbol: string, count: number): MarketDataPoint[] {
    const prices: Record<string, number> = {
      BTCUSDT: 45000, ETHUSDT: 2500, SOLUSDT: 100,
      BNBUSDT: 300, XRPUSDT: 0.5, ADAUSDT: 0.45,
      DOGEUSDT: 0.08, AVAXUSDT: 35, DOTUSDT: 7,
    };

    const data: MarketDataPoint[] = [];
    let price = prices[symbol] || 100;
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;

    for (let i = count; i >= 0; i--) {
      const change = (Math.random() - 0.5) * price * 0.02;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random() * Math.abs(change) * 0.5;
      const low = Math.min(open, close) - Math.random() * Math.abs(change) * 0.5;
      const volume = 1000 + Math.random() * 5000;

      data.push({
        symbol,
        timeframe: TimeFrame.ONE_HOUR,
        timestamp: new Date(now - i * hourMs),
        open, high, low, close, volume,
      });

      price = close;
    }

    return data;
  }

  /**
   * Build professional signal provider-style details
   * Computes entry zones, multi-level TPs, R:R, leverage, and narrative
   */
  private buildSignalDetails(
    symbol: string,
    action: TradeAction,
    currentPrice: number,
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis,
    risk: RiskAssessment,
    timeframe: TimeFrame,
    newsArticles: NewsArticle[]
  ): SignalDetails {
    const isBuy = action === TradeAction.BUY;
    const volatility = risk.marketVolatility;

    // ---- Volatility classification ----
    const volLabel: SignalDetails['volatility']['label'] =
      volatility > 0.06 ? 'EXTREME' :
      volatility > 0.04 ? 'HIGH' :
      volatility > 0.02 ? 'MODERATE' : 'LOW';

    // ---- Entry zone ----
    const entrySpread = currentPrice * Math.max(0.002, volatility * 0.3);
    const entryLow = isBuy ? currentPrice - entrySpread : currentPrice;
    const entryHigh = isBuy ? currentPrice : currentPrice + entrySpread;
    const entryMid = (entryLow + entryHigh) / 2;

    // ---- Stop loss ----
    const slPrice = risk.suggestedStopLoss;
    const slDistance = Math.abs(entryMid - slPrice);
    const slPercent = slPrice > 0 ? (slDistance / entryMid) * 100 : 0;
    const slReasoning = technical.supportLevels.length > 0 && isBuy
      ? `Placed below nearest support at $${technical.supportLevels[0].toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : isBuy
        ? `Volatility-based: ${(slPercent).toFixed(1)}% below entry`
        : technical.resistanceLevels.length > 0
          ? `Placed above nearest resistance at $${technical.resistanceLevels[0].toLocaleString(undefined, { maximumFractionDigits: 2 })}`
          : `Volatility-based: ${(slPercent).toFixed(1)}% above entry`;

    // ---- Multiple take-profit levels ----
    const riskMultiple = [
      { level: 1, mult: 1.5, posPercent: 30, desc: 'Conservative — quick partial' },
      { level: 2, mult: 2.5, posPercent: 40, desc: 'Moderate — main target' },
      { level: 3, mult: 4.0, posPercent: 30, desc: 'Aggressive — runner target' },
    ];

    const takeProfitLevels = riskMultiple.map(({ level, mult, posPercent, desc }) => {
      let tpPrice: number;
      if (isBuy) {
        // For BUY, try to cap TP3 at nearest resistance
        tpPrice = entryMid + slDistance * mult;
        if (level === 3 && technical.resistanceLevels.length > 0) {
          tpPrice = Math.min(tpPrice, technical.resistanceLevels[0]);
        }
        // Ensure TP is above entry
        tpPrice = Math.max(tpPrice, entryMid * 1.001);
      } else {
        tpPrice = entryMid - slDistance * mult;
        if (level === 3 && technical.supportLevels.length > 0) {
          tpPrice = Math.max(tpPrice, technical.supportLevels[0]);
        }
        tpPrice = Math.min(tpPrice, entryMid * 0.999);
      }
      const tpPercent = entryMid > 0 ? ((tpPrice - entryMid) / entryMid) * 100 : 0;
      return {
        level,
        price: tpPrice,
        percentFromEntry: tpPercent,
        positionPercent: posPercent,
        description: desc,
      };
    });

    // ---- R:R ratio (based on TP2 as main target) ----
    const tp2Distance = takeProfitLevels.length > 1
      ? Math.abs(takeProfitLevels[1].price - entryMid)
      : slDistance;
    const riskRewardRatio = slDistance > 0 ? tp2Distance / slDistance : 0;

    // ---- Leverage ----
    const leverageMin = volLabel === 'EXTREME' ? 2 : volLabel === 'HIGH' ? 3 : volLabel === 'MODERATE' ? 5 : 10;
    const leverageMax = volLabel === 'EXTREME' ? 5 : volLabel === 'HIGH' ? 10 : volLabel === 'MODERATE' ? 20 : 25;
    const leverageRec = Math.round((leverageMin + leverageMax) / 2);
    const leverageReasoning = volLabel === 'EXTREME'
      ? `${volLabel} volatility — keep leverage low to avoid liquidation`
      : volLabel === 'HIGH'
        ? `${volLabel} volatility — moderate leverage with tight stops`
        : `${volLabel} volatility — room for higher leverage with proper risk management`;

    // ---- Time horizon ----
    const timeHorizonMap: Record<string, SignalDetails['timeHorizon']> = {
      '1m': 'SCALP', '5m': 'SCALP', '15m': 'SCALP',
      '1h': 'SWING', '4h': 'SWING',
      '1d': 'POSITION', '1w': 'POSITION',
    };
    const timeHorizon = timeHorizonMap[timeframe] || 'SWING';
    const timeHorizonDescMap: Record<string, string> = {
      SCALP: 'Scalp trade — 15min to 4 hours. Quick in-and-out.',
      SWING: 'Swing trade — 6 to 48 hours. Hold through minor pullbacks.',
      POSITION: 'Position trade — Days to weeks. Ride the macro trend.',
    };

    // ---- Market context ----
    const trendDesc = technical.trend === 'BULLISH'
      ? `Bullish trend (${Math.round(technical.trendStrength * 100)}% strength)`
      : technical.trend === 'BEARISH'
        ? `Bearish trend (${Math.round(technical.trendStrength * 100)}% strength)`
        : 'Sideways/consolidating market';
    const sentimentDesc = sentiment.sentimentLabel !== SentimentLabel.NEUTRAL
      ? `${sentiment.sentimentLabel} sentiment (${(sentiment.overallSentiment * 100).toFixed(0)}%)`
      : 'Neutral market sentiment';
    const volDesc = `${volLabel} volatility (ATR: ${(volatility * 100).toFixed(1)}%)`;
    const ctxParts = [trendDesc, sentimentDesc, volDesc];
    if (technical.patterns.length > 0) {
      ctxParts.push(`Patterns: ${technical.patterns.join(', ')}`);
    }
    const marketContext = ctxParts.join('. ') + '.';

    // ---- Price action notes ----
    const priceActionNotes: string[] = [];
    if (technical.patterns.length > 0) {
      priceActionNotes.push(`Candlestick patterns: ${technical.patterns.join(', ')}`);
    }
    const rsi = technical.indicators.rsi || 50;
    if (rsi > 70) priceActionNotes.push('RSI overbought — potential reversal zone');
    else if (rsi < 30) priceActionNotes.push('RSI oversold — potential bounce zone');
    else if (rsi > 55) priceActionNotes.push('RSI bullish momentum building');
    else if (rsi < 45) priceActionNotes.push('RSI bearish pressure increasing');

    const macdHist = technical.indicators.macdHistogram || 0;
    if (Math.abs(macdHist) > 0) {
      priceActionNotes.push(`MACD histogram ${macdHist > 0 ? 'positive (bullish momentum)' : 'negative (bearish momentum)'}`);
    }

    const bbPercent = technical.indicators.bollingerPercentB || 0.5;
    if (bbPercent > 0.8) priceActionNotes.push('Price near upper Bollinger Band — overextended');
    else if (bbPercent < 0.2) priceActionNotes.push('Price near lower Bollinger Band — oversold region');

    const adx = technical.indicators.adx || 0;
    if (adx > 25) priceActionNotes.push(`Strong trend (ADX: ${adx.toFixed(1)})`);
    else if (adx < 20) priceActionNotes.push(`Weak/no trend (ADX: ${adx.toFixed(1)}) — range-bound`);

    const stochK = technical.indicators.stochasticK || 50;
    if (stochK > 80) priceActionNotes.push('Stochastic overbought — watch for sell signals');
    else if (stochK < 20) priceActionNotes.push('Stochastic oversold — watch for buy signals');

    const cloudPos = technical.indicators.ichimokuCloudTop && technical.indicators.ichimokuCloudBottom
      ? currentPrice > technical.indicators.ichimokuCloudTop
        ? 'Price above Ichimoku cloud — bullish zone'
        : currentPrice < technical.indicators.ichimokuCloudBottom
          ? 'Price below Ichimoku cloud — bearish zone'
          : 'Price inside Ichimoku cloud — indecision zone'
      : '';

    if (cloudPos) priceActionNotes.push(cloudPos);

    if (priceActionNotes.length === 0) {
      priceActionNotes.push('No strong price action signals detected');
    }

    // ---- Fundamental catalysts ----
    const catalysts: string[] = [];
    if (fundamental.marketEvents.length > 0) {
      fundamental.marketEvents.slice(0, 3).forEach(e => catalysts.push(e));
    }
    if (fundamental.economicFactors.length > 0) {
      catalysts.push(`Macro factors: ${fundamental.economicFactors.slice(0, 3).join(', ')}`);
    }
    if (newsArticles.some(a => a.importance && a.importance > 0.7)) {
      const highImpact = newsArticles.filter(a => a.importance && a.importance > 0.7);
      catalysts.push(`${highImpact.length} high-impact news event(s) detected`);
    }
    if (catalysts.length === 0) {
      catalysts.push('No significant fundamental catalysts at this time');
    }

    // ---- Key levels ----
    const nearestSupport = technical.supportLevels.length > 0 ? technical.supportLevels[0] : currentPrice * 0.97;
    const nearestResistance = technical.resistanceLevels.length > 0 ? technical.resistanceLevels[0] : currentPrice * 1.03;

    // ---- Indicator summary ----
    const indicatorSummary: SignalDetails['indicatorSummary'] = [];

    const rsiSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = rsi < 35 ? 'BULLISH' : rsi > 65 ? 'BEARISH' : 'NEUTRAL';
    indicatorSummary.push({
      name: 'RSI',
      value: rsi,
      signal: rsiSignal,
      note: rsi < 35 ? 'Oversold — bullish reversal potential' : rsi > 65 ? 'Overbought — bearish reversal potential' : 'Neutral zone',
    });

    const macdSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = macdHist > 0 ? 'BULLISH' : 'BEARISH';
    indicatorSummary.push({
      name: 'MACD',
      value: technical.indicators.macd || 0,
      signal: macdSignal,
      note: macdHist > 0 ? 'Bullish crossover momentum' : 'Bearish crossover momentum',
    });

    const adxSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = adx > 25 ? (technical.trend === 'BULLISH' ? 'BULLISH' : 'BEARISH') : 'NEUTRAL';
    indicatorSummary.push({
      name: 'ADX',
      value: adx,
      signal: adxSignal,
      note: adx > 25 ? `Strong trend (${technical.trend})` : 'Weak/no trend — avoid breakout trades',
    });

    const stochSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = stochK < 20 ? 'BULLISH' : stochK > 80 ? 'BEARISH' : 'NEUTRAL';
    indicatorSummary.push({
      name: 'Stochastic',
      value: stochK,
      signal: stochSignal,
      note: stochK < 20 ? 'Oversold zone' : stochK > 80 ? 'Overbought zone' : 'Neutral zone',
    });

    const bbSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = bbPercent < 0.2 ? 'BULLISH' : bbPercent > 0.8 ? 'BEARISH' : 'NEUTRAL';
    indicatorSummary.push({
      name: 'Bollinger %B',
      value: bbPercent,
      signal: bbSignal,
      note: bbPercent < 0.2 ? 'Price at lower band — oversold' : bbPercent > 0.8 ? 'Price at upper band — overbought' : 'Price within bands',
    });

    const vwap = technical.indicators.vwap || 0;
    if (vwap > 0 && currentPrice > 0) {
      const aboveVWAP = currentPrice > vwap;
      indicatorSummary.push({
        name: 'VWAP',
        value: vwap,
        signal: aboveVWAP ? 'BULLISH' : 'BEARISH',
        note: aboveVWAP ? `Price above VWAP ($${vwap.toFixed(2)}) — buyers in control` : `Price below VWAP ($${vwap.toFixed(2)}) — sellers in control`,
      });
    }

    // ---- News sentiment indicator ----
    const newsSentimentValue = sentiment.overallSentiment;
    const newsSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      newsSentimentValue > 0.2 ? 'BULLISH' : newsSentimentValue < -0.2 ? 'BEARISH' : 'NEUTRAL';
    indicatorSummary.push({
      name: 'News Sentiment',
      value: newsSentimentValue,
      signal: newsSignal,
      note: newsSentimentValue > 0.2
        ? `Positive news flow (${sentiment.sentimentLabel})`
        : newsSentimentValue < -0.2
          ? `Negative news flow (${sentiment.sentimentLabel})`
          : 'Neutral news sentiment',
    });

    // ---- Pattern analysis ----
    const bullishPatterns = ['HAMMER', 'MORNING_STAR', 'BULLISH_ENGULFING', 'INVERTED_HAMMER'];
    const bearishPatterns = ['BEARISH_ENGULFING', 'EVENING_STAR'];
    const hasBullishPattern = technical.patterns.some(p => bullishPatterns.includes(p));
    const hasBearishPattern = technical.patterns.some(p => bearishPatterns.includes(p));
    const patternReliability: SignalDetails['patternAnalysis']['reliability'] =
      technical.patterns.length > 1 ? 'HIGH' : technical.patterns.length === 1 ? 'MEDIUM' : 'LOW';
    const patternSummary = technical.patterns.length > 0
      ? `${technical.patterns.join(', ')} — ${hasBullishPattern ? 'bullish' : hasBearishPattern ? 'bearish' : 'mixed'} confirmation`
      : 'No significant candlestick patterns detected';

    return {
      currentPrice,
      entryZone: {
        low: entryLow,
        high: entryHigh,
        strategy: entrySpread < currentPrice * 0.003 ? 'MARKET' : 'LIMIT',
        description: isBuy
          ? `Enter on pullback to $${entryLow.toFixed(2)} or market at $${entryHigh.toFixed(2)}`
          : `Enter on bounce to $${entryHigh.toFixed(2)} or market at $${entryLow.toFixed(2)}`,
      },
      takeProfitLevels,
      stopLoss: {
        price: slPrice,
        percentFromEntry: slPercent,
        reasoning: slReasoning,
        type: 'HARD',
      },
      riskRewardRatio,
      leverage: {
        min: leverageMin,
        max: leverageMax,
        recommended: leverageRec,
        reasoning: leverageReasoning,
      },
      timeHorizon,
      timeHorizonDescription: timeHorizonDescMap[timeHorizon] || timeHorizonDescMap.SWING,
      volatility: {
        value: volatility,
        label: volLabel,
        atrPercent: volatility * 100,
      },
      marketContext,
      priceActionNotes,
      fundamentalCatalysts: catalysts,
      keyLevels: {
        supports: technical.supportLevels,
        resistances: technical.resistanceLevels,
        nearestSupport,
        nearestResistance,
      },
      indicatorSummary,
      patternAnalysis: {
        detected: technical.patterns,
        reliability: patternReliability,
        summary: patternSummary,
      },
    };
  }

  /**
   * Perform technical analysis on market data
   */
  private performTechnicalAnalysis(data: MarketDataPoint[]): TechnicalAnalysis {
    if (data.length < 50) {
      return {
        trend: 'SIDEWAYS',
        trendStrength: 0,
        supportLevels: [],
        resistanceLevels: [],
        indicators: { rsi: 50 },
        patterns: [],
        score: 0.5
      };
    }

    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const opens = data.map(d => d.open);
    const volumes = data.map(d => d.volume);

    // Calculate indicators
    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const rsi = calculateRSI(closes);
    const macd = calculateMACD(closes);
    const bollingerBands = calculateBollingerBands(closes);
    const vwapResult = calculateVWAP(highs, lows, closes, volumes);
    const adxResult = calculateADX(highs, lows, closes);
    const volumeProfile = calculateVolumeProfile(highs, lows, closes, volumes);
    const ichimokuResult = calculateIchimoku(highs, lows, closes);
    const stochasticResult = calculateStochastic(highs, lows, closes);

    // Determine trend
    const lastClose = closes[closes.length - 1];
    const lastSma20 = sma20[sma20.length - 1];
    const lastSma50 = sma50[sma50.length - 1];

    let trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' = 'SIDEWAYS';
    let trendStrength = 0;

    if (lastSma20 !== undefined && lastSma50 !== undefined) {
      if (lastClose > lastSma20 && lastSma20 > lastSma50) {
        trend = 'BULLISH';
        trendStrength = Math.min((lastClose - lastSma50) / lastSma50, 1);
      } else if (lastClose < lastSma20 && lastSma20 < lastSma50) {
        trend = 'BEARISH';
        trendStrength = Math.min((lastSma50 - lastClose) / lastSma50, 1);
      }
    }

    // Find support and resistance
    const { support, resistance } = findSupportResistance(highs, lows, closes);

    // Detect patterns
    const patterns = detectPatterns(opens, highs, lows, closes);

    // Calculate score
    let score = 0.5;

    // RSI contribution
    if (rsi > 70) score -= 0.15; // Overbought
    else if (rsi < 30) score += 0.15; // Oversold
    else if (rsi > 50) score += 0.1;

    // MACD contribution
    if (macd.histogram > 0) score += 0.1;
    else score -= 0.1;

    // Bollinger Bands contribution
    if (bollingerBands.percentB > 0.8) score -= 0.1; // Near upper band - potential reversal
    else if (bollingerBands.percentB < 0.2) score += 0.1; // Near lower band - potential bounce
    if (bollingerBands.squeeze) score -= 0.05; // Squeeze - low volatility

    // VWAP contribution
    if (lastClose > vwapResult.vwap && vwapResult.vwap > 0) score += 0.05; // Above VWAP is bullish
    else if (lastClose < vwapResult.vwap && vwapResult.vwap > 0) score -= 0.05; // Below VWAP is bearish

    // ADX contribution - strong trend confirmation
    if (adxResult.adx > 25) {
      // Strong trend - boost the direction
      if (trend === 'BULLISH') score += 0.1;
      else if (trend === 'BEARISH') score -= 0.1;
    } else if (adxResult.adx < 20) {
      // Weak/no trend - reduce confidence
      score *= 0.9;
    }

    // Trend contribution
    if (trend === 'BULLISH') score += 0.15 * trendStrength;
    else if (trend === 'BEARISH') score -= 0.15 * trendStrength;

    // Pattern contribution
    if (patterns.includes('HAMMER') || patterns.includes('MORNING_STAR') || patterns.includes('BULLISH_ENGULFING')) {
      score += 0.1;
    }
    if (patterns.includes('BEARISH_ENGULFING') || patterns.includes('EVENING_STAR')) {
      score -= 0.1;
    }

    // Volume analysis
    const recentVolumes = volumes.slice(-20);
    if (recentVolumes.length > 0) {
      const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
      const lastVolume = volumes[volumes.length - 1];
      if (lastVolume > avgVolume * 1.5) {
        // High volume confirms trend
        if (trend === 'BULLISH') score += 0.05;
        else if (trend === 'BEARISH') score -= 0.05;
      }
    }

    // Bollinger Bands extended scoring (only for extreme conditions beyond basic thresholds)
    if (bollingerBands.percentB > 1) {
      // Price above upper band - strongly overbought (only add if not already scored above)
      score -= 0.05; // Reduced from 0.1 to avoid double-counting with basic BB scoring
    } else if (bollingerBands.percentB < 0) {
      // Price below lower band - strongly oversold
      score += 0.05; // Reduced from 0.1 to avoid double-counting with basic BB scoring
    }

    // ADX directional bias (+DI vs -DI)
    if (adxResult.plusDI > adxResult.minusDI) {
      score += 0.03;
    } else if (adxResult.minusDI > adxResult.plusDI) {
      score -= 0.03;
    }

    // Volume Profile contribution
    if (volumeProfile.poc > 0) {
      const pocDistance = Math.abs(lastClose - volumeProfile.poc) / lastClose;
      if (pocDistance > 0.05) {
        // Far from POC - potential mean reversion
        if (lastClose > volumeProfile.poc) score -= 0.03;
        else score += 0.03;
      }
    }

    // Ichimoku Cloud contribution
    if (ichimokuResult.trendSignal === 'BULLISH') {
      score += 0.08; // Strong bullish signal from Ichimoku
    } else if (ichimokuResult.trendSignal === 'BEARISH') {
      score -= 0.08; // Strong bearish signal from Ichimoku
    }
    // Price above cloud = bullish, below = bearish
    if (ichimokuResult.priceVsCloud === 'ABOVE') score += 0.05;
    else if (ichimokuResult.priceVsCloud === 'BELOW') score -= 0.05;
    // Tenkan/Kijun crossover signal
    if (ichimokuResult.tenkanSen > ichimokuResult.kijunSen) score += 0.03;
    else if (ichimokuResult.tenkanSen < ichimokuResult.kijunSen) score -= 0.03;

    // Stochastic Oscillator contribution
    if (stochasticResult.isOversold) {
      score += 0.08; // Oversold = potential buy
    } else if (stochasticResult.isOverbought) {
      score -= 0.08; // Overbought = potential sell
    }
    // Stochastic crossover signals
    if (stochasticResult.crossover === 'BULLISH') {
      score += 0.06; // Bullish %K/%D crossover in oversold zone
    } else if (stochasticResult.crossover === 'BEARISH') {
      score -= 0.06; // Bearish %K/%D crossover in overbought zone
    }

    const indicators: Record<string, number> = { rsi };
    // QA-FIX #2 companion: Store the actual lastClose in indicators so calculateSignalQualityScore
    // can use the real price instead of sma20 as a VWAP comparison proxy.
    indicators.lastClose = lastClose;
    if (sma20.length > 0) indicators.sma20 = lastSma20;
    if (sma50.length > 0) indicators.sma50 = lastSma50;
    if (ema12.length > 0) indicators.ema12 = ema12[ema12.length - 1];
    if (ema26.length > 0) indicators.ema26 = ema26[ema26.length - 1];
    indicators.macd = macd.macd;
    indicators.macdSignal = macd.signal;
    indicators.macdHistogram = macd.histogram;
    indicators.bollingerUpper = bollingerBands.upper;
    indicators.bollingerMiddle = bollingerBands.middle;
    indicators.bollingerLower = bollingerBands.lower;
    indicators.bollingerBandwidth = bollingerBands.bandwidth;
    indicators.bollingerPercentB = bollingerBands.percentB;
    indicators.vwap = vwapResult.vwap;
    indicators.adx = adxResult.adx;
    indicators.plusDI = adxResult.plusDI;
    indicators.minusDI = adxResult.minusDI;
    indicators.volumeProfilePOC = volumeProfile.poc;
    // Ichimoku Cloud indicators
    indicators.ichimokuTenkan = ichimokuResult.tenkanSen;
    indicators.ichimokuKijun = ichimokuResult.kijunSen;
    indicators.ichimokuCloudTop = ichimokuResult.cloudTop;
    indicators.ichimokuCloudBottom = ichimokuResult.cloudBottom;
    // Stochastic indicators
    indicators.stochasticK = stochasticResult.percentK;
    indicators.stochasticD = stochasticResult.percentD;

    return {
      trend,
      trendStrength,
      supportLevels: support,
      resistanceLevels: resistance,
      indicators,
      patterns,
      score: Math.max(0, Math.min(1, score))
    };
  }

  /**
   * Calculate signal quality score (0-100)
   * Based on agreement between multiple indicators and confidence factors
   * @param technical - Technical analysis results
   * @param sentiment - Sentiment analysis results
   * @param action - Proposed trade action
   * @returns Quality score from 0 (worst) to 100 (best)
   */
  calculateSignalQualityScore(
    technical: TechnicalAnalysis,
    sentiment: SentimentAnalysis,
    action: TradeAction
  ): number {
    let quality = 50; // Start neutral

    // Factor 1: Trend-Action alignment (0-15 points)
    if (action === TradeAction.BUY && technical.trend === 'BULLISH') quality += 15;
    else if (action === TradeAction.SELL && technical.trend === 'BEARISH') quality += 15;
    else if (action === TradeAction.HOLD) quality += 5;
    else if ((action === TradeAction.BUY && technical.trend === 'BEARISH') ||
             (action === TradeAction.SELL && technical.trend === 'BULLISH')) quality -= 10;

    // Factor 2: RSI confirmation (0-10 points)
    const rsi = technical.indicators.rsi || 50;
    if (action === TradeAction.BUY && rsi < 40) quality += 10;
    else if (action === TradeAction.BUY && rsi > 70) quality -= 10;
    else if (action === TradeAction.SELL && rsi > 60) quality += 10;
    else if (action === TradeAction.SELL && rsi < 30) quality -= 10;

    // Factor 3: MACD confirmation (0-10 points)
    const macdHistogram = technical.indicators.macdHistogram || 0;
    if (action === TradeAction.BUY && macdHistogram > 0) quality += 10;
    else if (action === TradeAction.SELL && macdHistogram < 0) quality += 10;
    else if ((action === TradeAction.BUY && macdHistogram < 0) ||
             (action === TradeAction.SELL && macdHistogram > 0)) quality -= 5;

    // Factor 4: ADX trend strength (0-10 points)
    const adx = technical.indicators.adx || 0;
    if (adx > 25) quality += 10;
    else if (adx > 20) quality += 5;
    else quality -= 5;

    // Factor 5: Bollinger Band confirmation (0-10 points)
    const percentB = technical.indicators.bollingerPercentB || 0.5;
    if (action === TradeAction.BUY && percentB < 0.2) quality += 10;
    else if (action === TradeAction.SELL && percentB > 0.8) quality += 10;
    else if ((action === TradeAction.BUY && percentB > 0.8) ||
             (action === TradeAction.SELL && percentB < 0.2)) quality -= 5;

    // Factor 6: Sentiment alignment (0-10 points)
    if ((action === TradeAction.BUY && sentiment.overallSentiment > 0.2) ||
        (action === TradeAction.SELL && sentiment.overallSentiment < -0.2)) {
      quality += 10;
    } else if ((action === TradeAction.BUY && sentiment.overallSentiment < -0.2) ||
               (action === TradeAction.SELL && sentiment.overallSentiment > 0.2)) {
      quality -= 10;
    }

    // Factor 7: Pattern confirmation (0-10 points)
    const bullishPatterns = ['HAMMER', 'MORNING_STAR', 'BULLISH_ENGULFING', 'INVERTED_HAMMER'];
    const bearishPatterns = ['BEARISH_ENGULFING', 'EVENING_STAR'];
    if (action === TradeAction.BUY && technical.patterns.some(p => bullishPatterns.includes(p))) quality += 10;
    else if (action === TradeAction.SELL && technical.patterns.some(p => bearishPatterns.includes(p))) quality += 10;

    // QA-FIX #2: Use the actual last close price instead of sma20 as a proxy for VWAP comparison.
    // The original code incorrectly used sma20 as a stand-in for lastClose, which gave
    // inaccurate VWAP confirmation signals (sma20 is a lagging average, not the current price).
    const vwap = technical.indicators.vwap || 0;
    const lastCloseForVWAP = technical.indicators.lastClose || 0;
    if (vwap > 0 && lastCloseForVWAP > 0) {
      if ((action === TradeAction.BUY && lastCloseForVWAP > vwap) ||
          (action === TradeAction.SELL && lastCloseForVWAP < vwap)) quality += 5;
    }

    // Factor 9: Trend strength bonus (0-10 points)
    quality += Math.round(technical.trendStrength * 10);

    return Math.max(0, Math.min(100, Math.round(quality)));
  }

  /**
   * Confirm signal across multiple timeframes
   * Checks if higher timeframe trend aligns with signal direction
   * @param symbol - Trading symbol
   * @param primaryTimeframe - Primary timeframe for the signal
   * @param marketDataByTimeframe - Market data for each timeframe
   * @param action - Proposed trade action
   * @returns Multi-timeframe confirmation result
   */
  confirmMultiTimeframe(
    symbol: string,
    primaryTimeframe: TimeFrame,
    marketDataByTimeframe: Partial<Record<TimeFrame, MarketDataPoint[]>>,
    action: TradeAction
  ): {
    confirmed: boolean;
    confirmations: number;
    conflicts: number;
    timeframeResults: Array<{ timeframe: TimeFrame; trend: string; aligned: boolean }>;
  } {
    const timeframeResults: Array<{ timeframe: TimeFrame; trend: string; aligned: boolean }> = [];
    let confirmations = 0;
    let conflicts = 0;

    // Define timeframes to check (from higher to lower)
    const timeframesToCheck: TimeFrame[] = [
      TimeFrame.ONE_DAY,
      TimeFrame.FOUR_HOURS,
      TimeFrame.ONE_HOUR,
      TimeFrame.FIFTEEN_MINUTES
    ];

    for (const tf of timeframesToCheck) {
      const data = marketDataByTimeframe[tf];
      if (!data || data.length < 50) continue;

      // Perform quick trend analysis on this timeframe
      const closes = data.map(d => d.close);
      const sma20 = calculateSMA(closes, 20);
      const lastClose = closes[closes.length - 1];
      const lastSma = sma20[sma20.length - 1];

      let trend = 'SIDEWAYS';
      if (lastSma !== undefined) {
        if (lastClose > lastSma * 1.01) trend = 'BULLISH';
        else if (lastClose < lastSma * 0.99) trend = 'BEARISH';
      }

      const aligned = (action === TradeAction.BUY && trend === 'BULLISH') ||
                      (action === TradeAction.SELL && trend === 'BEARISH') ||
                      (action === TradeAction.HOLD) ||
                      trend === 'SIDEWAYS';

      // Higher timeframes have more weight
      const isHigherTF = timeframesToCheck.indexOf(tf) < timeframesToCheck.indexOf(primaryTimeframe);
      if (aligned) {
        confirmations += isHigherTF ? 2 : 1;
      } else {
        conflicts += isHigherTF ? 2 : 1;
      }

      timeframeResults.push({ timeframe: tf, trend, aligned });
    }

    return {
      confirmed: confirmations > conflicts,
      confirmations,
      conflicts,
      timeframeResults
    };
  }

  /**
   * Perform fundamental analysis
   */
  private async performFundamentalAnalysis(
    symbol: string,
    newsArticles: NewsArticle[]
  ): Promise<FundamentalAnalysis> {
    // Get news sentiment
    const newsImpact = this.calculateNewsImpact(newsArticles);
    
    // Extract market events
    const marketEvents = this.extractMarketEvents(newsArticles);
    
    // Economic factors
    const economicFactors = this.identifyEconomicFactors(newsArticles);

    // Calculate score based on news
    let score = 0.5;
    
    // Positive events boost score
    marketEvents.forEach(event => {
      const eventLower = event.toLowerCase();
      if (eventLower.includes('partnership') || 
          eventLower.includes('adoption') ||
          eventLower.includes('launch')) {
        score += 0.05;
      }
      if (eventLower.includes('hack') || 
          eventLower.includes('regulation') ||
          eventLower.includes('ban')) {
        score -= 0.05;
      }
    });

    return {
      newsImpact,
      marketEvents,
      economicFactors,
      score: Math.max(0, Math.min(1, score))
    };
  }

  /**
   * Perform sentiment analysis
   * Fixed: Sentiment label ordering was wrong - now checks extreme values first
   */
  private async performSentimentAnalysis(
    symbol: string,
    newsArticles: NewsArticle[]
  ): Promise<SentimentAnalysis> {
    // Get sentiment from news aggregator
    let newsSentiment = 0;
    try {
      const symbolSentiment = await newsAggregator.getSymbolSentiment(symbol);
      newsSentiment = symbolSentiment.overallSentiment;
    } catch {
      // If news aggregator fails, use articles directly
      if (newsArticles.length > 0) {
        newsSentiment = newsArticles.reduce((sum, a) => sum + (a.sentiment || 0), 0) / newsArticles.length;
      }
    }

    // Get contextual sentiment from vector store
    let contextSentiment = 0;
    try {
      const contextResult = await vectorStore.analyzeSentimentWithContext(
        `${symbol} trading analysis`
      );
      contextSentiment = contextResult.sentiment;
    } catch {
      // Vector store may not be available
    }

    // Combine sentiments with weights (news > context)
    const overallSentiment = newsSentiment * 0.7 + contextSentiment * 0.3;

    // Determine label - FIXED: Check extreme values first (was reversed before)
    let sentimentLabel = SentimentLabel.NEUTRAL;
    if (overallSentiment >= 0.6) sentimentLabel = SentimentLabel.VERY_BULLISH;
    else if (overallSentiment >= 0.2) sentimentLabel = SentimentLabel.BULLISH;
    else if (overallSentiment <= -0.6) sentimentLabel = SentimentLabel.VERY_BEARISH;
    else if (overallSentiment <= -0.2) sentimentLabel = SentimentLabel.BEARISH;

    // Extract key topics
    const keyTopics = this.extractKeyTopics(newsArticles);

    return {
      overallSentiment,
      sentimentLabel,
      newsSentiment,
      socialSentiment: contextSentiment,
      keyTopics,
      trendingKeywords: keyTopics
    };
  }

  /**
   * Calculate overall score
   */
  private calculateOverallScore(
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis,
    strategy?: StrategyType
  ): number {
    const weights = this.getStrategyWeights(strategy);

    return (
      technical.score * weights.technical +
      fundamental.score * weights.fundamental +
      ((sentiment.overallSentiment + 1) / 2) * weights.sentiment
    );
  }

  /**
   * Determine trading action
   */
  private determineAction(
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis,
    overallScore: number,
    strategy?: StrategyType
  ): TradeAction {
    const rsi = technical.indicators.rsi || 50;
    const macdHist = technical.indicators.macdHistogram || 0;
    const adx = technical.indicators.adx || 0;
    const bbPercentB = technical.indicators.bollingerPercentB || 0.5;
    const stochK = technical.indicators.stochasticK || 50;
    const vwap = technical.indicators.vwap || 0;
    const lastClose = technical.indicators.lastClose || 0;

    // Strategy-specific overrides
    if (strategy === StrategyType.MOMENTUM) {
      // Momentum: RSI direction + MACD histogram + trend strength
      const rsiMomentum = rsi > 50 && rsi < 70; // Bullish but not overbought
      const macdBullish = macdHist > 0 && macdHist > (technical.indicators.macdSignal || 0);
      const strongTrend = adx > 20;
      if (rsiMomentum && macdBullish && strongTrend && technical.trend === 'BULLISH') {
        return TradeAction.BUY;
      }
      if (rsi < 50 && rsi > 30 && macdHist < 0 && strongTrend && technical.trend === 'BEARISH') {
        return TradeAction.SELL;
      }
      // Fall through to default logic below
    }

    if (strategy === StrategyType.BREAKOUT) {
      // Breakout: Bollinger squeeze ending + high ADX + price at resistance
      const bbSqueeze = (technical.indicators.bollingerBandwidth || 0) < 0.03;
      const bbExpanding = !bbSqueeze && bbPercentB > 0.8;
      const strongTrend = adx > 25;
      if ((bbExpanding || (bbSqueeze && stochK > 70)) && strongTrend) {
        return technical.trend === 'BULLISH' ? TradeAction.BUY : TradeAction.SELL;
      }
      // Fall through to default logic below
    }

    if (strategy === StrategyType.MEAN_REVERSION) {
      // Mean reversion: RSI extreme + Bollinger band extremes
      if (rsi < 30 && bbPercentB < 0.2 && sentiment.overallSentiment > -0.3) {
        return TradeAction.BUY;
      }
      if (rsi > 70 && bbPercentB > 0.8 && sentiment.overallSentiment < 0.3) {
        return TradeAction.SELL;
      }
      if (stochK < 20 && stochK > (technical.indicators.stochasticD || 50)) {
        return TradeAction.BUY;
      }
      if (stochK > 80 && stochK < (technical.indicators.stochasticD || 50)) {
        return TradeAction.SELL;
      }
      // Fall through to default logic below
    }

    if (strategy === StrategyType.VWAP_TWAP) {
      // VWAP: Price significantly above/below VWAP with volume confirmation
      if (vwap > 0 && lastClose > 0) {
        const spread = (lastClose - vwap) / vwap;
        if (spread > 0.01 && rsi > 50) return TradeAction.BUY;  // 1% above VWAP
        if (spread < -0.01 && rsi < 50) return TradeAction.SELL; // 1% below VWAP
      }
      // Fall through to default logic below
    }

    // Default logic (shared across all strategies as fallback)
    // Strong buy conditions
    if (overallScore >= 0.7 && 
        technical.trend === 'BULLISH' &&
        (sentiment.sentimentLabel === SentimentLabel.BULLISH || sentiment.sentimentLabel === SentimentLabel.VERY_BULLISH)) {
      return TradeAction.BUY;
    }

    // Strong sell conditions
    if (overallScore <= 0.3 &&
        technical.trend === 'BEARISH' &&
        (sentiment.sentimentLabel === SentimentLabel.BEARISH || sentiment.sentimentLabel === SentimentLabel.VERY_BEARISH)) {
      return TradeAction.SELL;
    }

    // Moderate buy
    if (overallScore >= 0.6 &&
        rsi < 70 &&
        sentiment.overallSentiment > 0) {
      return TradeAction.BUY;
    }

    // Moderate sell
    if (overallScore <= 0.4 &&
        rsi > 30 &&
        sentiment.overallSentiment < 0) {
      return TradeAction.SELL;
    }

    return TradeAction.HOLD;
  }

  /**
   * Generate AI reasoning
   */
  private async generateReasoning(
    symbol: string,
    action: TradeAction,
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis
  ): Promise<string> {
    if (!this.zai) {
      return this.generateBasicReasoning(
        symbol, action, technical, fundamental, sentiment
      );
    }

    try {
      const prompt = `Analyze the following trading signal for ${symbol} and provide a brief, professional reasoning (2-3 sentences):

Action: ${action}
Technical Analysis: Trend is ${technical.trend} with ${Math.round(technical.trendStrength * 100)}% strength. RSI: ${(technical.indicators.rsi || 50).toFixed(1)}. Patterns detected: ${technical.patterns.join(', ') || 'None'}.
Fundamental Analysis: News impact score: ${(fundamental.newsImpact * 100).toFixed(0)}%. Key events: ${fundamental.marketEvents.slice(0, 3).join(', ') || 'None significant'}.
Sentiment: ${sentiment.sentimentLabel} (${(sentiment.overallSentiment * 100).toFixed(0)}%)

Provide a concise trading rationale:`;

      const completion = await this.zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a professional trading analyst. Provide concise, actionable insights.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.3
      });

      return completion.choices[0]?.message?.content || 
        this.generateBasicReasoning(symbol, action, technical, fundamental, sentiment);
    } catch (error) {
      return this.generateBasicReasoning(symbol, action, technical, fundamental, sentiment);
    }
  }

  /**
   * Generate basic reasoning without AI
   */
  private generateBasicReasoning(
    symbol: string,
    action: TradeAction,
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis
  ): string {
    const reasons: string[] = [];

    if (technical.trend === 'BULLISH' && action === TradeAction.BUY) {
      reasons.push(`Bullish trend detected with ${Math.round(technical.trendStrength * 100)}% strength`);
    }
    if (technical.trend === 'BEARISH' && action === TradeAction.SELL) {
      reasons.push(`Bearish trend detected with ${Math.round(technical.trendStrength * 100)}% strength`);
    }
    if (technical.indicators.rsi && technical.indicators.rsi < 30) {
      reasons.push('RSI indicates oversold conditions');
    }
    if (technical.indicators.rsi && technical.indicators.rsi > 70) {
      reasons.push('RSI indicates overbought conditions');
    }
    if (technical.patterns.includes('BULLISH_ENGULFING')) {
      reasons.push('Bullish engulfing pattern detected');
    }
    if (technical.patterns.includes('BEARISH_ENGULFING')) {
      reasons.push('Bearish engulfing pattern detected');
    }
    if (sentiment.sentimentLabel === SentimentLabel.BULLISH || sentiment.sentimentLabel === SentimentLabel.VERY_BULLISH) {
      reasons.push('Market sentiment is bullish');
    }
    if (sentiment.sentimentLabel === SentimentLabel.BEARISH || sentiment.sentimentLabel === SentimentLabel.VERY_BEARISH) {
      reasons.push('Market sentiment is bearish');
    }

    return reasons.length > 0 
      ? `${symbol}: ${action} signal. ${reasons.join('. ')}.`
      : `${symbol}: ${action} signal based on mixed indicators.`;
  }

  /**
   * Calculate confidence
   */
  private calculateConfidence(
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis,
    overallScore: number
  ): number {
    // Base confidence from overall score
    let confidence = Math.abs(overallScore - 0.5) * 2;

    // Boost confidence when all indicators align
    const technicalDirection = technical.score > 0.5 ? 1 : -1;
    const sentimentDirection = sentiment.overallSentiment > 0 ? 1 : -1;

    if (technicalDirection === sentimentDirection) {
      confidence *= 1.2;
    }

    // Reduce confidence during high volatility (wide support/resistance range)
    if (technical.supportLevels.length > 0 && technical.resistanceLevels.length > 0) {
      const range = technical.resistanceLevels[0] - technical.supportLevels[0];
      const midPrice = (technical.resistanceLevels[0] + technical.supportLevels[0]) / 2;
      if (midPrice > 0) {
        const rangePercent = range / midPrice;
        if (rangePercent > 0.1) {
          confidence *= 0.8;
        }
      }
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Assess risk
   */
  private assessRisk(
    symbol: string,
    action: TradeAction,
    technical: TechnicalAnalysis,
    marketData: MarketDataPoint[]
  ): RiskAssessment {
    const lastPrice = marketData[marketData.length - 1]?.close || 0;

    // Calculate volatility
    const returns = marketData.slice(-20).map((d, i, arr) => {
      if (i === 0) return 0;
      const prevClose = arr[i - 1].close;
      return prevClose !== 0 ? (d.close - prevClose) / prevClose : 0;
    });
    const volatility = Math.sqrt(
      returns.reduce((sum, r) => sum + r * r, 0) / Math.max(returns.length, 1)
    );

    // Determine risk level
    let riskLevel = RiskLevel.MODERATE;
    let riskScore = 0.5;

    if (volatility > 0.05) {
      riskLevel = RiskLevel.AGGRESSIVE;
      riskScore = 0.7;
    } else if (volatility < 0.02) {
      riskLevel = RiskLevel.CONSERVATIVE;
      riskScore = 0.3;
    }

    // Calculate suggested levels
    const suggestedStopLoss = action === TradeAction.BUY
      ? lastPrice * (1 - volatility * 2)
      : lastPrice * (1 + volatility * 2);

    const suggestedTakeProfit = action === TradeAction.BUY
      ? lastPrice * (1 + volatility * 3)
      : lastPrice * (1 - volatility * 3);

    // Risk factors
    const riskFactors: string[] = [];
    if ((technical.indicators.rsi || 50) > 70) {
      riskFactors.push('Overbought conditions');
    }
    if ((technical.indicators.rsi || 50) < 30) {
      riskFactors.push('Oversold conditions');
    }
    if (volatility > 0.04) {
      riskFactors.push('High market volatility');
    }
    if (technical.patterns.includes('DOJI')) {
      riskFactors.push('Indecision pattern detected');
    }

    // Max recommended position as fraction of capital (not canceling out)
    // Returns a multiplier: conservative=1%, moderate=3%, aggressive=5% of capital
    const maxPositionMultiplier = riskLevel === RiskLevel.CONSERVATIVE ? 0.01 : 
                                   riskLevel === RiskLevel.MODERATE ? 0.03 : 0.05;

    // Calculate dynamic liquidity risk based on volatility
    const liquidityRisk = Math.min(0.9, Math.max(0.1, volatility * 5));

    return {
      riskScore,
      riskLevel,
      maxRecommendedPosition: maxPositionMultiplier, // Fraction of capital to risk
      suggestedStopLoss,
      suggestedTakeProfit,
      riskFactors,
      marketVolatility: volatility,
      liquidityRisk
    };
  }

  /**
   * Calculate price targets
   */
  private calculateTargets(
    action: TradeAction,
    currentPrice: number,
    technical: TechnicalAnalysis,
    risk: RiskAssessment
  ): { priceTarget: number; stopLoss: number; takeProfit: number } {
    if (action === TradeAction.HOLD || currentPrice === 0) {
      return {
        priceTarget: currentPrice,
        stopLoss: currentPrice,
        takeProfit: currentPrice
      };
    }

    // Use support/resistance if available
    let priceTarget = risk.suggestedTakeProfit;
    let stopLoss = risk.suggestedStopLoss;

    if (action === TradeAction.BUY) {
      // Target nearest resistance
      if (technical.resistanceLevels.length > 0) {
        priceTarget = Math.min(
          technical.resistanceLevels[0],
          risk.suggestedTakeProfit
        );
      }
      // Stop at nearest support
      if (technical.supportLevels.length > 0) {
        stopLoss = Math.max(
          technical.supportLevels[0],
          risk.suggestedStopLoss
        );
      }
    } else {
      // Target nearest support
      if (technical.supportLevels.length > 0) {
        priceTarget = Math.max(
          technical.supportLevels[0],
          risk.suggestedTakeProfit
        );
      }
      // Stop at nearest resistance
      if (technical.resistanceLevels.length > 0) {
        stopLoss = Math.min(
          technical.resistanceLevels[0],
          risk.suggestedStopLoss
        );
      }
    }

    // Validate targets make sense
    if (action === TradeAction.BUY) {
      if (stopLoss >= currentPrice) stopLoss = risk.suggestedStopLoss;
      if (priceTarget <= currentPrice) priceTarget = risk.suggestedTakeProfit;
    } else {
      if (stopLoss <= currentPrice) stopLoss = risk.suggestedStopLoss;
      if (priceTarget >= currentPrice) priceTarget = risk.suggestedTakeProfit;
    }

    const takeProfit = priceTarget;

    return { priceTarget, stopLoss, takeProfit };
  }

  // Helper methods
  private calculateNewsImpact(articles: NewsArticle[]): number {
    if (articles.length === 0) return 0;
    
    const totalImportance = articles.reduce(
      (sum, a) => sum + (a.importance || 0.5),
      0
    );
    
    return Math.min(totalImportance / articles.length, 1);
  }

  private extractMarketEvents(articles: NewsArticle[]): string[] {
    return articles
      .filter(a => a.importance && a.importance > 0.6)
      .slice(0, 10)
      .map(a => a.title);
  }

  private identifyEconomicFactors(articles: NewsArticle[]): string[] {
    const factors: string[] = [];
    const keywords = [
      'inflation', 'interest rate', 'fed', 'regulation', 'adoption', 'institutional',
      'etf', 'halving', 'whale', 'treasury', 'gdp', 'cpi', 'employment',
      'stablecoin', 'cbdc', 'defi', 'yield', 'liquidity', 'tapering',
      'quantitative easing', 'default', 'sanctions', 'tariff', 'recession'
    ];
    
    articles.forEach(article => {
      const text = article.title.toLowerCase();
      keywords.forEach(kw => {
        if (text.includes(kw)) {
          factors.push(kw);
        }
      });
    });
    
    return [...new Set(factors)];
  }

  private extractKeyTopics(articles: NewsArticle[]): string[] {
    const topics: string[] = [];
    
    articles.forEach(article => {
      if (article.tags) {
        topics.push(...article.tags);
      }
    });
    
    // Return most frequent topics
    const frequency: Record<string, number> = {};
    topics.forEach(t => {
      frequency[t] = (frequency[t] || 0) + 1;
    });
    
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);
  }

  private extractKeyFactors(
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis
  ): string[] {
    const factors: string[] = [];

    if (technical.trend !== 'SIDEWAYS') {
      factors.push(`${technical.trend} trend (${Math.round(technical.trendStrength * 100)}% strength)`);
    }
    if (technical.patterns.length > 0) {
      factors.push(`Patterns: ${technical.patterns.join(', ')}`);
    }
    if (fundamental.marketEvents.length > 0) {
      factors.push(`Key events: ${fundamental.marketEvents.slice(0, 2).join(', ')}`);
    }
    if (sentiment.sentimentLabel !== SentimentLabel.NEUTRAL) {
      factors.push(`Sentiment: ${sentiment.sentimentLabel}`);
    }

    return factors;
  }

  private generateWarnings(
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis,
    risk: RiskAssessment
  ): string[] {
    const warnings: string[] = [];

    if ((technical.indicators.rsi || 50) > 70) {
      warnings.push('RSI indicates overbought conditions - potential reversal risk');
    }
    if ((technical.indicators.rsi || 50) < 30) {
      warnings.push('RSI indicates oversold conditions - may continue falling');
    }
    if (risk.marketVolatility > 0.05) {
      warnings.push('High market volatility - use smaller position sizes');
    }
    if (risk.riskFactors.includes('Indecision pattern detected')) {
      warnings.push('Market showing indecision - wait for clearer signals');
    }
    if (fundamental.marketEvents.some(e => 
      e.toLowerCase().includes('regulation') || 
      e.toLowerCase().includes('ban')
    )) {
      warnings.push('Regulatory news may cause volatility');
    }
    if (technical.trend === 'SIDEWAYS' && technical.patterns.length === 0) {
      warnings.push('No clear trend or patterns - low confidence signal');
    }

    return warnings;
  }
}

// Export singleton - lazy initialization
let _signalEngine: SignalEngine | null = null;
export function getSignalEngine(): SignalEngine {
  if (!_signalEngine) {
    _signalEngine = new SignalEngine();
  }
  return _signalEngine;
}

// Keep backward compatibility - use the lazy singleton
export const signalEngine = getSignalEngine();
