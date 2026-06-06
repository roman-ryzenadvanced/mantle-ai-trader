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
  NewsArticle
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
    const secondRange = Math.max(secondOpen, secondClose) - Math.min(secondOpen, secondClose);
    
    if (firstClose < firstOpen && // First bearish
        (secondRange === 0 || secondBody < secondRange * 0.3) && // Small body (fixed: guard against zero)
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
    const secondRange = Math.max(secondOpen, secondClose) - Math.min(secondOpen, secondClose);

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
  const midPoint = (arr: number[], period: number): number => {
    if (arr.length < period) return arr[arr.length - 1] || 0;
    const slice = arr.slice(-period);
    const high = Math.max(...slice);
    const low = Math.min(...slice);
    return (high + low) / 2;
  };

  // Tenkan-sen (Conversion Line)
  const tenkanSen = midPoint(highs, tenkanPeriod);

  // Kijun-sen (Base Line)
  const kijunSen = midPoint(highs, kijunPeriod);

  // For Senkou spans, we need historical data projected forward.
  // Since we can only compute from available data, we use the most recent values.
  // In a real charting application, these would be shifted forward by `displacement` periods.
  // Here we compute the current values as if they will be plotted ahead.
  
  // Senkou Span A: (Tenkan + Kijun) / 2
  // For historical context, we compute using data from `displacement` periods ago
  const historicalTenkan = highs.length > displacement + tenkanPeriod
    ? midPoint(highs.slice(0, -displacement), tenkanPeriod)
    : tenkanSen;
  const historicalKijun = highs.length > displacement + kijunPeriod
    ? midPoint(highs.slice(0, -displacement), kijunPeriod)
    : kijunSen;
  const senkouSpanA = (historicalTenkan + historicalKijun) / 2;

  // Senkou Span B: (52-period high + 52-period low) / 2
  const senkouSpanB = highs.length > displacement + senkouPeriod
    ? midPoint(highs.slice(0, -displacement), senkouPeriod)
    : midPoint(highs, senkouPeriod);

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
      sentimentAnalysis
    );
    
    // Determine action
    const action = this.determineAction(
      technicalAnalysis,
      fundamentalAnalysis,
      sentimentAnalysis,
      overallScore
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
    
    return {
      signal,
      analysis,
      riskAssessment
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

    // Bollinger Bands extended scoring
    if (bollingerBands.percentB > 1) {
      // Price above upper band - overbought
      score -= 0.1;
    } else if (bollingerBands.percentB < 0) {
      // Price below lower band - oversold
      score += 0.1;
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
    sentiment: SentimentAnalysis
  ): number {
    const weights = {
      technical: 0.4,
      fundamental: 0.3,
      sentiment: 0.3
    };

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
    overallScore: number
  ): TradeAction {
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
        (technical.indicators.rsi || 50) < 70 &&
        sentiment.overallSentiment > 0) {
      return TradeAction.BUY;
    }

    // Moderate sell
    if (overallScore <= 0.4 &&
        (technical.indicators.rsi || 50) > 30 &&
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

    // Max recommended position based on risk level
    const maxPositionMultiplier = riskLevel === RiskLevel.CONSERVATIVE ? 0.01 : 
                                   riskLevel === RiskLevel.MODERATE ? 0.03 : 0.05;

    return {
      riskScore,
      riskLevel,
      maxRecommendedPosition: lastPrice * 10 * maxPositionMultiplier / lastPrice, // Risk-adjusted
      suggestedStopLoss,
      suggestedTakeProfit,
      riskFactors,
      marketVolatility: volatility,
      liquidityRisk: 0.2 // Assume good liquidity for major pairs
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
    const keywords = ['inflation', 'interest rate', 'fed', 'regulation', 'adoption', 'institutional'];
    
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

// Keep backward compatibility
export const signalEngine = new SignalEngine();
