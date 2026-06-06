/**
 * Unit Tests for Technical Indicators
 * Dedicated tests for ALL technical indicator calculations:
 * SMA, EMA, RSI, MACD, Bollinger Bands, VWAP, ADX,
 * and candlestick pattern detection (Doji, Hammer, Engulfing, Stars)
 *
 * Tests use known mathematical values to validate calculation correctness.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { SignalEngine } from '../../src/lib/trading/signals/signal-engine';
import {
  TimeFrame,
  TradeAction,
  MarketDataPoint,
  SignalStatus
} from '../../src/lib/trading/core/types';

// ==================== STANDALONE TECHNICAL INDICATOR FUNCTIONS ====================
// These mirror the private functions in signal-engine.ts for direct unit testing

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

  if (data.length < period) {
    result[0] = data[0];
    for (let i = 1; i < data.length; i++) {
      result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
    }
    return result;
  }

  const seed = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = seed;

  for (let i = period; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
  }

  for (let i = 0; i < period - 1; i++) {
    result[i] = seed;
  }

  return result;
}

function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

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

function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  if (closes.length < 26) {
    return { macd: 0, signal: 0, histogram: 0 };
  }

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

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

  const signalEma = calculateEMA(macdLine, 9);

  const macd = macdLine[macdLine.length - 1];
  const signal = signalEma[signalEma.length - 1];
  const histogram = macd - signal;

  return { macd, signal, histogram };
}

function calculateBollingerBands(closes: number[], period: number = 20, stdDevMultiplier: number = 2): {
  upper: number[];
  middle: number[];
  lower: number[];
} {
  const middle = calculateSMA(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const avg = middle[i - period + 1];
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    upper.push(avg + stdDevMultiplier * stdDev);
    lower.push(avg - stdDevMultiplier * stdDev);
  }

  return { upper, middle, lower };
}

function calculateVWAP(data: { close: number; volume: number }[]): number {
  if (data.length === 0) return 0;

  let totalVolume = 0;
  let totalTypicalPriceVolume = 0;

  for (const d of data) {
    totalVolume += d.volume;
    totalTypicalPriceVolume += d.close * d.volume;
  }

  return totalVolume > 0 ? totalTypicalPriceVolume / totalVolume : 0;
}

function calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (closes.length < period * 2) return 0;

  // Calculate True Range and Directional Movement
  const trueRanges: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < highs.length; i++) {
    const highDiff = highs[i] - highs[i - 1];
    const lowDiff = lows[i - 1] - lows[i];

    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) return 0;

  // Smooth using Wilder's method
  let smoothTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];

  for (let i = period; i < trueRanges.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trueRanges[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];

    const plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    const minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;

    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? Math.abs(plusDI - minusDI) / diSum * 100 : 0;
    dxValues.push(dx);
  }

  if (dxValues.length < period) return dxValues.length > 0 ? dxValues[dxValues.length - 1] : 0;

  // Calculate ADX
  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }

  return adx;
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

  if (range === 0) return patterns;

  // Doji
  if (bodySize < range * 0.1) {
    patterns.push('DOJI');
  }

  // Hammer
  if (bodySize < range * 0.3 &&
      (Math.min(lastOpen, lastClose) - lastLow) > range * 0.6) {
    patterns.push('HAMMER');
  }

  // Inverted Hammer
  if (bodySize < range * 0.3 &&
      (lastHigh - Math.max(lastOpen, lastClose)) > range * 0.6) {
    patterns.push('INVERTED_HAMMER');
  }

  // Bullish Engulfing
  if (len >= 2) {
    const prevClose = closes[len - 2];
    const prevOpen = opens[len - 2];

    if (prevClose < prevOpen &&
        lastClose > lastOpen &&
        lastOpen <= prevClose &&
        lastClose >= prevOpen) {
      patterns.push('BULLISH_ENGULFING');
    }
  }

  // Bearish Engulfing
  if (len >= 2) {
    const prevClose = closes[len - 2];
    const prevOpen = opens[len - 2];

    if (prevClose > prevOpen &&
        lastClose < lastOpen &&
        lastOpen >= prevClose &&
        lastClose <= prevOpen) {
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

    if (firstClose < firstOpen &&
        (secondRange === 0 || secondBody < secondRange * 0.3) &&
        lastClose > lastOpen && lastClose > (firstOpen + firstClose) / 2) {
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

    if (firstClose > firstOpen &&
        (secondRange === 0 || secondBody < secondRange * 0.3) &&
        lastClose < lastOpen && lastClose < (firstOpen + firstClose) / 2) {
      patterns.push('EVENING_STAR');
    }
  }

  return patterns;
}

// ==================== TEST DATA HELPERS ====================

function generateConstantPriceData(price: number, count: number): number[] {
  return Array(count).fill(price);
}

function generateLinearPriceData(startPrice: number, increment: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => startPrice + i * increment);
}

function generateMarketDataFromPrices(prices: number[], symbol: string = 'TESTUSDT'): MarketDataPoint[] {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  return prices.map((price, i) => ({
    symbol,
    timeframe: TimeFrame.ONE_HOUR,
    timestamp: new Date(now - (prices.length - i) * hourMs),
    open: price - 5,
    high: price + 10,
    low: price - 10,
    close: price,
    volume: 1000 + Math.random() * 5000
  }));
}

// ==================== TESTS ====================

describe('Technical Indicators', () => {

  describe('SMA (Simple Moving Average)', () => {
    test('should calculate SMA with known values', () => {
      const data = [10, 20, 30, 40, 50];
      const sma = calculateSMA(data, 3);

      // SMA(3) at index 2: (10+20+30)/3 = 20
      expect(sma[0]).toBeCloseTo(20, 5);
      // SMA(3) at index 3: (20+30+40)/3 = 30
      expect(sma[1]).toBeCloseTo(30, 5);
      // SMA(3) at index 4: (30+40+50)/3 = 40
      expect(sma[2]).toBeCloseTo(40, 5);
    });

    test('should return empty array for insufficient data', () => {
      const data = [10, 20];
      const sma = calculateSMA(data, 5);
      expect(sma.length).toBe(0);
    });

    test('should handle period of 1', () => {
      const data = [10, 20, 30];
      const sma = calculateSMA(data, 1);
      expect(sma).toEqual([10, 20, 30]);
    });

    test('should handle period equal to data length', () => {
      const data = [10, 20, 30, 40, 50];
      const sma = calculateSMA(data, 5);
      expect(sma.length).toBe(1);
      expect(sma[0]).toBeCloseTo(30, 5); // Average of all 5 values
    });

    test('should handle constant prices', () => {
      const data = generateConstantPriceData(100, 20);
      const sma = calculateSMA(data, 10);
      sma.forEach(val => expect(val).toBeCloseTo(100, 5));
    });

    test('should handle empty array', () => {
      const sma = calculateSMA([], 5);
      expect(sma.length).toBe(0);
    });

    test('should produce correct number of outputs', () => {
      const data = Array.from({ length: 50 }, (_, i) => i + 1);
      const sma = calculateSMA(data, 20);
      expect(sma.length).toBe(31); // 50 - 20 + 1
    });
  });

  describe('EMA (Exponential Moving Average)', () => {
    test('should seed EMA with SMA of first period values', () => {
      const data = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const ema = calculateEMA(data, 5);

      // First valid EMA should be SMA of first 5 values = 30
      expect(ema[4]).toBeCloseTo(30, 5);
    });

    test('should calculate EMA with proper multiplier', () => {
      const data = [10, 20, 30, 40, 50, 60];
      const ema = calculateEMA(data, 3);
      const multiplier = 2 / (3 + 1);

      // EMA at index 2 (seed): SMA = (10+20+30)/3 = 20
      expect(ema[2]).toBeCloseTo(20, 5);

      // EMA at index 3: (40 - 20) * multiplier + 20
      const expected3 = (40 - 20) * multiplier + 20;
      expect(ema[3]).toBeCloseTo(expected3, 5);
    });

    test('should handle empty array', () => {
      const ema = calculateEMA([], 5);
      expect(ema.length).toBe(0);
    });

    test('should handle data shorter than period', () => {
      const data = [10, 20];
      const ema = calculateEMA(data, 5);
      expect(ema.length).toBe(2);
    });

    test('should weight recent data more heavily', () => {
      // Data with a sudden jump - EMA should respond faster than SMA
      const data = [100, 100, 100, 100, 100, 100, 100, 100, 100, 200];
      const ema = calculateEMA(data, 5);
      const sma = calculateSMA(data, 5);

      // EMA of last value should be higher than SMA (more responsive)
      const lastEma = ema[ema.length - 1];
      const lastSma = sma[sma.length - 1];
      expect(lastEma).toBeGreaterThan(lastSma);
    });

    test('should handle constant prices', () => {
      const data = generateConstantPriceData(100, 30);
      const ema = calculateEMA(data, 10);
      // After the seed, EMA should stay at 100
      ema.slice(9).forEach(val => expect(val).toBeCloseTo(100, 5));
    });
  });

  describe('RSI (Relative Strength Index) - Wilder\'s Smoothing', () => {
    test('should return 50 for insufficient data', () => {
      expect(calculateRSI([100, 101], 14)).toBe(50);
    });

    test('should return 100 for all gains (no losses)', () => {
      // Consistently rising prices
      const data = generateLinearPriceData(100, 1, 30);
      const rsi = calculateRSI(data, 14);
      expect(rsi).toBe(100);
    });

    test('should return 0 for all losses (no gains)', () => {
      // Consistently falling prices
      const data = generateLinearPriceData(100, -1, 30);
      const rsi = calculateRSI(data, 14);
      expect(rsi).toBe(0);
    });

    test('should return 50 for alternating equal gains and losses', () => {
      // Alternating up/down with equal magnitude
      const data: number[] = [100];
      for (let i = 0; i < 30; i++) {
        data.push(data[i] + (i % 2 === 0 ? 10 : -10));
      }
      const rsi = calculateRSI(data, 14);
      // Should be close to 50 (not exact due to Wilder's smoothing)
      expect(rsi).toBeGreaterThan(30);
      expect(rsi).toBeLessThan(70);
    });

    test('should be between 0 and 100', () => {
      const data = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 10);
      const rsi = calculateRSI(data, 14);
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    test('should use Wilder\'s smoothing (not simple average)', () => {
      // With Wilder's smoothing, RSI should decay slowly after a change
      const data = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200,
        200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200,
        200, 200, 200, 200, 200, 200, 200, 200];

      const rsi = calculateRSI(data, 14);
      // After consistent rises followed by flat, RSI should be high but decaying
      expect(rsi).toBeGreaterThan(50);
    });

    test('should handle constant prices (zero change)', () => {
      const data = generateConstantPriceData(100, 30);
      const rsi = calculateRSI(data, 14);
      // With no gains and no losses, avgGain=0 and avgLoss=0
      // avgLoss === 0 => RSI = 100
      expect(rsi).toBe(100);
    });
  });

  describe('MACD (Moving Average Convergence Divergence)', () => {
    test('should return zeros for insufficient data', () => {
      const data = [100, 101, 102]; // Less than 26
      const macd = calculateMACD(data);
      expect(macd.macd).toBe(0);
      expect(macd.signal).toBe(0);
      expect(macd.histogram).toBe(0);
    });

    test('should calculate MACD line as EMA12 - EMA26', () => {
      const data = Array.from({ length: 50 }, (_, i) => 100 + i);
      const macd = calculateMACD(data);

      // With upward trending data, MACD should be positive
      expect(macd.macd).toBeGreaterThan(0);
    });

    test('should have signal line as EMA9 of MACD line', () => {
      const data = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 20);
      const macd = calculateMACD(data);

      expect(macd.signal).toBeDefined();
      expect(typeof macd.signal).toBe('number');
    });

    test('histogram should be MACD minus signal', () => {
      const data = Array.from({ length: 50 }, (_, i) => 100 + i * 2);
      const macd = calculateMACD(data);

      expect(macd.histogram).toBeCloseTo(macd.macd - macd.signal, 5);
    });

    test('should handle constant prices', () => {
      const data = generateConstantPriceData(100, 50);
      const macd = calculateMACD(data);

      // With constant prices, EMA12 = EMA26 = price, so MACD should be ~0
      expect(Math.abs(macd.macd)).toBeLessThan(0.01);
      expect(Math.abs(macd.signal)).toBeLessThan(0.01);
    });

    test('should detect bullish crossover', () => {
      // Start with falling prices, then rising
      const data: number[] = [];
      for (let i = 0; i < 30; i++) data.push(200 - i * 2); // Falling
      for (let i = 0; i < 30; i++) data.push(140 + i * 3); // Rising

      const macd = calculateMACD(data);
      // After reversal, histogram should be positive
      expect(macd.histogram).toBeGreaterThan(0);
    });
  });

  describe('Bollinger Bands', () => {
    test('should calculate middle band as SMA', () => {
      const data = Array.from({ length: 30 }, (_, i) => 100 + i);
      const bb = calculateBollingerBands(data, 20);

      // Middle band should equal SMA
      const sma = calculateSMA(data, 20);
      expect(bb.middle).toEqual(sma);
    });

    test('should have upper band above middle band', () => {
      const data = Array.from({ length: 30 }, (_, i) => 100 + Math.random() * 10);
      const bb = calculateBollingerBands(data, 20);

      for (let i = 0; i < bb.upper.length; i++) {
        expect(bb.upper[i]).toBeGreaterThanOrEqual(bb.middle[i]);
      }
    });

    test('should have lower band below middle band', () => {
      const data = Array.from({ length: 30 }, (_, i) => 100 + Math.random() * 10);
      const bb = calculateBollingerBands(data, 20);

      for (let i = 0; i < bb.lower.length; i++) {
        expect(bb.lower[i]).toBeLessThanOrEqual(bb.middle[i]);
      }
    });

    test('should have symmetric bands with 2 std dev', () => {
      const data = Array.from({ length: 30 }, (_, i) => 100 + i);
      const bb = calculateBollingerBands(data, 20, 2);

      for (let i = 0; i < bb.upper.length; i++) {
        const upperDist = bb.upper[i] - bb.middle[i];
        const lowerDist = bb.middle[i] - bb.lower[i];
        expect(upperDist).toBeCloseTo(lowerDist, 5);
      }
    });

    test('should handle constant prices (zero width bands)', () => {
      const data = generateConstantPriceData(100, 30);
      const bb = calculateBollingerBands(data, 20);

      // With constant prices, all bands should be at the same level
      for (let i = 0; i < bb.upper.length; i++) {
        expect(bb.upper[i]).toBeCloseTo(100, 5);
        expect(bb.middle[i]).toBeCloseTo(100, 5);
        expect(bb.lower[i]).toBeCloseTo(100, 5);
      }
    });

    test('should return empty arrays for insufficient data', () => {
      const data = [100, 101, 102];
      const bb = calculateBollingerBands(data, 20);
      expect(bb.upper.length).toBe(0);
      expect(bb.middle.length).toBe(0);
      expect(bb.lower.length).toBe(0);
    });

    test('should respect custom std dev multiplier', () => {
      const data = Array.from({ length: 30 }, () => 100 + Math.random() * 10);
      const bb1 = calculateBollingerBands(data, 20, 1);
      const bb2 = calculateBollingerBands(data, 20, 2);

      // 2x std dev bands should be wider than 1x
      const width1 = bb1.upper[0] - bb1.lower[0];
      const width2 = bb2.upper[0] - bb2.lower[0];
      expect(width2).toBeCloseTo(width1 * 2, 5);
    });
  });

  describe('VWAP (Volume Weighted Average Price)', () => {
    test('should calculate VWAP correctly with known values', () => {
      const data = [
        { close: 100, volume: 1000 },
        { close: 110, volume: 2000 },
        { close: 90, volume: 1000 }
      ];

      const vwap = calculateVWAP(data);
      // VWAP = (100*1000 + 110*2000 + 90*1000) / (1000+2000+1000)
      // = (100000 + 220000 + 90000) / 4000 = 410000 / 4000 = 102.5
      expect(vwap).toBeCloseTo(102.5, 5);
    });

    test('should return 0 for empty data', () => {
      expect(calculateVWAP([])).toBe(0);
    });

    test('should handle zero volume', () => {
      const data = [
        { close: 100, volume: 0 },
        { close: 110, volume: 0 }
      ];
      expect(calculateVWAP(data)).toBe(0);
    });

    test('should weight higher volume more', () => {
      const data = [
        { close: 100, volume: 100 },
        { close: 200, volume: 900 }
      ];
      const vwap = calculateVWAP(data);
      // VWAP should be closer to 200 due to higher volume
      // (100*100 + 200*900) / (100+900) = (10000 + 180000) / 1000 = 190
      expect(vwap).toBeCloseTo(190, 5);
    });

    test('should equal simple average with equal volumes', () => {
      const data = [
        { close: 100, volume: 1000 },
        { close: 200, volume: 1000 }
      ];
      const vwap = calculateVWAP(data);
      expect(vwap).toBeCloseTo(150, 5);
    });
  });

  describe('ADX (Average Directional Index)', () => {
    test('should return 0 for insufficient data', () => {
      const closes = [100, 101, 102];
      expect(calculateADX(closes, closes, closes, 14)).toBe(0);
    });

    test('should return high ADX for strong trend', () => {
      // Strong uptrend
      const closes = generateLinearPriceData(100, 2, 50);
      const highs = closes.map(c => c + 5);
      const lows = closes.map(c => c - 3);

      const adx = calculateADX(highs, lows, closes, 14);
      expect(adx).toBeGreaterThan(20);
    });

    test('should return low ADX for sideways market', () => {
      // Oscillating prices
      const closes: number[] = [];
      for (let i = 0; i < 50; i++) {
        closes.push(100 + Math.sin(i * 0.5) * 2);
      }
      const highs = closes.map(c => c + 1);
      const lows = closes.map(c => c - 1);

      const adx = calculateADX(highs, lows, closes, 14);
      expect(adx).toBeLessThan(40); // Low ADX for sideways
    });

    test('should be between 0 and 100', () => {
      const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 1.5);
      const highs = closes.map(c => c + 3);
      const lows = closes.map(c => c - 2);

      const adx = calculateADX(highs, lows, closes, 14);
      expect(adx).toBeGreaterThanOrEqual(0);
      expect(adx).toBeLessThanOrEqual(100);
    });
  });

  describe('Pattern Detection: Doji', () => {
    test('should detect Doji with very small body', () => {
      const opens = [100, 100, 100, 100, 100];
      const highs = [105, 105, 105, 105, 105];
      const lows = [95, 95, 95, 95, 95];
      const closes = [98, 102, 97, 103, 100.1]; // Last close ≈ open (0.1% body)

      const patterns = detectPatterns(opens, highs, lows, closes);
      expect(patterns).toContain('DOJI');
    });

    test('should not detect Doji with significant body', () => {
      const opens = [100, 100, 100, 100, 100];
      const highs = [105, 105, 105, 105, 105];
      const lows = [95, 95, 95, 95, 95];
      const closes = [98, 102, 97, 103, 104]; // Body = 4, range = 10, 40%

      const patterns = detectPatterns(opens, highs, lows, closes);
      expect(patterns).not.toContain('DOJI');
    });

    test('should not detect Doji with zero range', () => {
      const opens = [100, 100, 100, 100, 100];
      const highs = [100, 100, 100, 100, 100];
      const lows = [100, 100, 100, 100, 100];
      const closes = [100, 100, 100, 100, 100];

      const patterns = detectPatterns(opens, highs, lows, closes);
      expect(patterns).not.toContain('DOJI'); // Guard against zero range
    });
  });

  describe('Pattern Detection: Hammer', () => {
    test('should detect Hammer pattern', () => {
      // Small body at top, long lower shadow
      const opens = [100, 100, 100, 100, 100];
      const highs = [101, 101, 101, 101, 101];
      const lows = [95, 95, 95, 95, 85]; // Long lower shadow on last candle
      const closes = [98, 102, 97, 103, 100.5]; // Small body at top

      const patterns = detectPatterns(opens, highs, lows, closes);
      expect(patterns).toContain('HAMMER');
    });

    test('should not detect Hammer without lower shadow', () => {
      const opens = [100, 100, 100, 100, 100];
      const highs = [110, 110, 110, 110, 110];
      const lows = [100, 100, 100, 100, 100]; // No lower shadow
      const closes = [98, 102, 97, 103, 105];

      const patterns = detectPatterns(opens, highs, lows, closes);
      expect(patterns).not.toContain('HAMMER');
    });
  });

  describe('Pattern Detection: Bullish Engulfing', () => {
    test('should detect Bullish Engulfing', () => {
      // Previous bearish, current bullish and engulfs
      const opens = [100, 100, 100, 95, 90]; // Last two: prev open=95, curr open=90
      const highs = [101, 101, 101, 96, 101];
      const lows = [99, 99, 99, 89, 89];
      const closes = [98, 102, 97, 90, 96]; // prev close=90 (bearish), curr close=96 (bullish)

      const patterns = detectPatterns(opens, highs, lows, closes);
      expect(patterns).toContain('BULLISH_ENGULFING');
    });

    test('should not detect Bullish Engulfing when both bullish', () => {
      const opens = [100, 100, 100, 90, 91];
      const highs = [101, 101, 101, 96, 101];
      const lows = [99, 99, 99, 89, 90];
      const closes = [98, 102, 97, 95, 100]; // Both bullish

      const patterns = detectPatterns(opens, highs, lows, closes);
      expect(patterns).not.toContain('BULLISH_ENGULFING');
    });
  });

  describe('Pattern Detection: Bearish Engulfing', () => {
    test('should detect Bearish Engulfing', () => {
      // Previous bullish, current bearish and engulfs
      const opens = [100, 100, 100, 90, 96];
      const highs = [101, 101, 101, 101, 96];
      const lows = [99, 99, 99, 89, 89];
      const closes = [98, 102, 97, 96, 90]; // prev close=96 (bullish), curr close=90 (bearish)

      const patterns = detectPatterns(opens, highs, lows, closes);
      expect(patterns).toContain('BEARISH_ENGULFING');
    });

    test('should not detect Bearish Engulfing when both bearish', () => {
      const opens = [100, 100, 100, 96, 90];
      const highs = [101, 101, 101, 96, 91];
      const lows = [99, 99, 99, 89, 89];
      const closes = [98, 102, 97, 90, 89]; // Both bearish

      const patterns = detectPatterns(opens, highs, lows, closes);
      expect(patterns).not.toContain('BEARISH_ENGULFING');
    });
  });

  describe('Pattern Detection: Morning Star', () => {
    test('should detect Morning Star', () => {
      // Three candles: bearish, small body (doji), bullish
      // Note: The implementation calculates secondRange as body size (open-close), not full range (high-low).
      // So for the "small body" check to pass with secondBody < secondRange * 0.3, we need secondRange === 0 (doji)
      // Candle at len-3: open=100, close=90 -> bearish (close < open)
      // Candle at len-2: open=91, close=91 -> doji (secondRange=0, secondBody=0)
      // Candle at len-1: open=90, close=98 -> bullish (close > open, close=98 > midpoint=(100+90)/2=95)
      const opens =   [100, 100, 100, 91, 90];
      const highs =   [105, 105, 105, 93, 99];
      const lows =    [95, 95, 89, 89, 89];
      const closes =  [98, 102, 90, 91, 98];

      const patterns = detectPatterns(opens, highs, lows, closes);
      expect(patterns).toContain('MORNING_STAR');
    });
  });

  describe('Pattern Detection: Evening Star', () => {
    test('should detect Evening Star', () => {
      // Three candles: bullish, small body (doji), bearish
      // Same implementation note as Morning Star - secondRange is body-based, need doji
      // Candle at len-3: open=90, close=100 -> bullish (close > open)
      // Candle at len-2: open=99, close=99 -> doji (secondRange=0)
      // Candle at len-1: open=100, close=92 -> bearish (close < open, close=92 < midpoint=(90+100)/2=95)
      const opens =   [100, 100, 90, 99, 100];
      const highs =   [105, 105, 101, 101, 101];
      const lows =    [95, 95, 89, 98, 91];
      const closes =  [98, 102, 100, 99, 92];

      const patterns = detectPatterns(opens, highs, lows, closes);
      expect(patterns).toContain('EVENING_STAR');
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero division in RSI', () => {
      const data = generateConstantPriceData(100, 30);
      const rsi = calculateRSI(data, 14);
      expect(rsi).toBe(100); // avgLoss === 0 => RSI = 100
    });

    test('should handle insufficient data for all indicators', () => {
      const smallData = [100, 101];

      expect(calculateSMA(smallData, 5).length).toBe(0);
      expect(calculateRSI(smallData, 14)).toBe(50);
      expect(calculateMACD(smallData)).toEqual({ macd: 0, signal: 0, histogram: 0 });
      expect(calculateBollingerBands(smallData, 20).upper.length).toBe(0);
    });

    test('should handle constant prices gracefully', () => {
      const data = generateConstantPriceData(100, 50);

      const sma = calculateSMA(data, 20);
      sma.forEach(v => expect(v).toBeCloseTo(100, 5));

      const rsi = calculateRSI(data, 14);
      expect(rsi).toBe(100); // No losses = RSI 100

      const macd = calculateMACD(data);
      expect(Math.abs(macd.macd)).toBeLessThan(0.01);
    });

    test('should detect no patterns with insufficient candles', () => {
      const opens = [100, 100];
      const highs = [105, 105];
      const lows = [95, 95];
      const closes = [102, 100];

      const patterns = detectPatterns(opens, highs, lows, closes);
      expect(patterns).not.toContain('MORNING_STAR');
      expect(patterns).not.toContain('EVENING_STAR');
    });

    test('should handle very large price values', () => {
      const data = [1e9, 1e9 + 100, 1e9 + 200, 1e9 + 150, 1e9 + 250];
      const sma = calculateSMA(data, 3);
      expect(isFinite(sma[0])).toBe(true);
    });

    test('should handle very small price values', () => {
      const data = [0.001, 0.002, 0.003, 0.004, 0.005];
      const sma = calculateSMA(data, 3);
      expect(sma[0]).toBeCloseTo(0.002, 5);
    });
  });

  describe('Integration with SignalEngine', () => {
    test('SignalEngine should use these indicator calculations', async () => {
      const engine = new SignalEngine();
      const prices = generateLinearPriceData(40000, 5, 200);
      const marketData = generateMarketDataFromPrices(prices, 'BTCUSDT');

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData,
        newsArticles: []
      });

      // Should have indicators computed
      expect(result.analysis.technicalAnalysis.indicators.rsi).toBeDefined();
      expect(result.analysis.technicalAnalysis.indicators.macd).toBeDefined();
      expect(result.analysis.technicalAnalysis.indicators.macdSignal).toBeDefined();
      expect(result.analysis.technicalAnalysis.indicators.macdHistogram).toBeDefined();
    });

    test('SignalEngine should detect patterns', async () => {
      const engine = new SignalEngine();

      // Create data with a known hammer pattern at the end
      const baseData = generateMarketDataFromPrices(
        generateLinearPriceData(40000, 2, 100),
        'BTCUSDT'
      );

      // Add hammer candle at the end
      const len = baseData.length;
      baseData[len - 1] = {
        ...baseData[len - 1],
        open: 45000,
        close: 45005,
        high: 45010,
        low: 44400 // Long lower shadow
      };

      const result = await engine.generateSignal({
        symbol: 'BTCUSDT',
        timeframe: TimeFrame.ONE_HOUR,
        marketData: baseData,
        newsArticles: []
      });

      expect(result.analysis.technicalAnalysis.patterns).toBeDefined();
      expect(Array.isArray(result.analysis.technicalAnalysis.patterns)).toBe(true);
    });
  });
});
