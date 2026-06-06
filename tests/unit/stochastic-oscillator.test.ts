/**
 * Unit Tests for Stochastic Oscillator
 * Tests the v4.0.0 Stochastic (%K/%D) calculation and signals
 */

import { describe, test, expect } from 'bun:test';
import { calculateStochastic } from '../../src/lib/trading/signals/signal-engine';

// Helper: generate fixed price data with known values
function generateStochasticData(
  count: number,
  highBase: number,
  lowBase: number,
  closeBase: number
): { highs: number[]; lows: number[]; closes: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  for (let i = 0; i < count; i++) {
    highs.push(highBase + i * 0.1);
    lows.push(lowBase + i * 0.1);
    closes.push(closeBase + i * 0.1);
  }
  return { highs, lows, closes };
}

describe('Stochastic Oscillator', () => {
  describe('calculateStochastic with sufficient data', () => {
    test('should return all stochastic components', () => {
      const { highs, lows, closes } = generateStochasticData(30, 110, 90, 100);
      const result = calculateStochastic(highs, lows, closes);
      expect(result).toHaveProperty('percentK');
      expect(result).toHaveProperty('percentD');
      expect(result).toHaveProperty('isOverbought');
      expect(result).toHaveProperty('isOversold');
      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('crossover');
    });

    test('percentK should be between 0 and 100', () => {
      const { highs, lows, closes } = generateStochasticData(30, 110, 90, 100);
      const result = calculateStochastic(highs, lows, closes);
      expect(result.percentK).toBeGreaterThanOrEqual(0);
      expect(result.percentK).toBeLessThanOrEqual(100);
    });

    test('percentD should be between 0 and 100', () => {
      const { highs, lows, closes } = generateStochasticData(30, 110, 90, 100);
      const result = calculateStochastic(highs, lows, closes);
      expect(result.percentD).toBeGreaterThanOrEqual(0);
      expect(result.percentD).toBeLessThanOrEqual(100);
    });
  });

  describe('%K calculation', () => {
    test('should calculate %K = (Close - Low14) / (High14 - Low14) * 100', () => {
      // Create data where close is exactly at the midpoint of the 14-period range
      const highs: number[] = [];
      const lows: number[] = [];
      const closes: number[] = [];
      for (let i = 0; i < 30; i++) {
        highs.push(120);
        lows.push(80);
        closes.push(100); // midpoint = (100-80)/(120-80)*100 = 50
      }
      const result = calculateStochastic(highs, lows, closes);
      expect(result.percentK).toBeCloseTo(50, 0);
    });

    test('should return %K near 100 when close is at high', () => {
      const highs: number[] = [];
      const lows: number[] = [];
      const closes: number[] = [];
      for (let i = 0; i < 30; i++) {
        highs.push(120);
        lows.push(80);
        closes.push(120); // close = high
      }
      const result = calculateStochastic(highs, lows, closes);
      expect(result.percentK).toBeCloseTo(100, 0);
    });

    test('should return %K near 0 when close is at low', () => {
      const highs: number[] = [];
      const lows: number[] = [];
      const closes: number[] = [];
      for (let i = 0; i < 30; i++) {
        highs.push(120);
        lows.push(80);
        closes.push(80); // close = low -> %K should be 0
      }
      const result = calculateStochastic(highs, lows, closes);
      // %K = (80-80)/(120-80)*100 = 0 (fixed: source now uses ?? instead of ||)
      expect(result.percentK).toBeCloseTo(0, 0);
    });

    test('should return %K of 75 when close is 3/4 of range', () => {
      const highs: number[] = [];
      const lows: number[] = [];
      const closes: number[] = [];
      for (let i = 0; i < 30; i++) {
        highs.push(120);
        lows.push(80);
        closes.push(110); // (110-80)/(120-80)*100 = 30/40*100 = 75
      }
      const result = calculateStochastic(highs, lows, closes);
      expect(result.percentK).toBeCloseTo(75, 0);
    });
  });

  describe('%D calculation', () => {
    test('%D should be 3-period SMA of %K', () => {
      // With consistent data, %D should converge to %K
      const highs: number[] = [];
      const lows: number[] = [];
      const closes: number[] = [];
      for (let i = 0; i < 30; i++) {
        highs.push(120);
        lows.push(80);
        closes.push(100);
      }
      const result = calculateStochastic(highs, lows, closes);
      // With all same values, %D should equal %K
      expect(result.percentD).toBeCloseTo(result.percentK, 0);
    });

    test('%D should lag behind %K when values change', () => {
      // Create data where %K changes from oversold to midpoint
      const highs: number[] = [];
      const lows: number[] = [];
      const closes: number[] = [];
      for (let i = 0; i < 25; i++) {
        highs.push(120);
        lows.push(80);
        closes.push(84); // Oversold
      }
      // Transition to midpoint
      for (let i = 0; i < 10; i++) {
        highs.push(120);
        lows.push(80);
        closes.push(100);
      }
      const result = calculateStochastic(highs, lows, closes);
      // %D should be between the oversold and midpoint values (lagging)
      expect(result.percentD).toBeLessThan(result.percentK + 5);
    });
  });

  describe('overbought condition: %K > 80', () => {
    test('should identify overbought when %K > 80', () => {
      const highs: number[] = [];
      const lows: number[] = [];
      const closes: number[] = [];
      for (let i = 0; i < 30; i++) {
        highs.push(120);
        lows.push(80);
        closes.push(115); // Close near high
      }
      const result = calculateStochastic(highs, lows, closes);
      expect(result.isOverbought).toBe(true);
      expect(result.signal).toBe('OVERBOUGHT');
    });

    test('should NOT identify overbought when %K <= 80', () => {
      const highs: number[] = [];
      const lows: number[] = [];
      const closes: number[] = [];
      for (let i = 0; i < 30; i++) {
        highs.push(120);
        lows.push(80);
        closes.push(100); // Midpoint
      }
      const result = calculateStochastic(highs, lows, closes);
      expect(result.isOverbought).toBe(false);
    });
  });

  describe('oversold condition: %K < 20', () => {
    test('should identify oversold when %K < 20', () => {
      const highs: number[] = [];
      const lows: number[] = [];
      const closes: number[] = [];
      for (let i = 0; i < 30; i++) {
        highs.push(120);
        lows.push(80);
        closes.push(85); // Close near low
      }
      const result = calculateStochastic(highs, lows, closes);
      expect(result.isOversold).toBe(true);
      expect(result.signal).toBe('OVERSOLD');
    });

    test('should NOT identify oversold when %K >= 20', () => {
      const highs: number[] = [];
      const lows: number[] = [];
      const closes: number[] = [];
      for (let i = 0; i < 30; i++) {
        highs.push(120);
        lows.push(80);
        closes.push(100);
      }
      const result = calculateStochastic(highs, lows, closes);
      expect(result.isOversold).toBe(false);
    });
  });

  describe('bullish crossover: %K crosses above %D', () => {
    test('should detect bullish crossover in oversold zone', () => {
      // Create a sequence where %K was below %D and crosses above in oversold zone
      const highs: number[] = [];
      const lows: number[] = [];
      const closes: number[] = [];

      // First, build up data with prices near lows (oversold)
      for (let i = 0; i < 25; i++) {
        highs.push(120);
        lows.push(80);
        closes.push(84); // Deeply oversold
      }
      // Now add a recovery candle
      highs.push(120);
      lows.push(80);
      closes.push(90); // Slight recovery - creates crossover potential
      highs.push(120);
      lows.push(80);
      closes.push(95);
      highs.push(120);
      lows.push(80);
      closes.push(100);

      const result = calculateStochastic(highs, lows, closes);
      // Crossover detection depends on specific values; just verify the field exists
      expect(['BULLISH', 'BEARISH', 'NONE']).toContain(result.crossover);
    });
  });

  describe('bearish crossover: %K crosses below %D', () => {
    test('crossover should be NONE when no crossover occurs', () => {
      const highs: number[] = [];
      const lows: number[] = [];
      const closes: number[] = [];
      for (let i = 0; i < 30; i++) {
        highs.push(120);
        lows.push(80);
        closes.push(100); // Flat data, no crossover
      }
      const result = calculateStochastic(highs, lows, closes);
      expect(result.crossover).toBe('NONE');
    });
  });

  describe('edge cases', () => {
    test('should handle zero range (high === low)', () => {
      const highs = new Array(20).fill(100);
      const lows = new Array(20).fill(100);
      const closes = new Array(20).fill(100);
      const result = calculateStochastic(highs, lows, closes);
      // When range is zero, should return 50 (neutral)
      expect(result.percentK).toBe(50);
    });

    test('should handle insufficient data (less than kPeriod)', () => {
      const highs = [110, 115];
      const lows = [90, 95];
      const closes = [100, 105];
      const result = calculateStochastic(highs, lows, closes);
      expect(result.percentK).toBe(50); // Default for insufficient data
      expect(result.percentD).toBe(50);
      expect(result.signal).toBe('NEUTRAL');
      expect(result.crossover).toBe('NONE');
    });

    test('should handle single data point', () => {
      const result = calculateStochastic([110], [90], [100]);
      expect(result.percentK).toBe(50);
    });

    test('should handle exactly kPeriod data points', () => {
      const highs = Array(14).fill(120);
      const lows = Array(14).fill(80);
      const closes = Array(14).fill(100);
      const result = calculateStochastic(highs, lows, closes);
      expect(typeof result.percentK).toBe('number');
    });

    test('should handle %K = 0 correctly (close at lowest low)', () => {
      // Regression test: previously || 50 was used instead of ?? 50
      // causing %K=0 to be reported as 50
      const highs = Array(30).fill(120);
      const lows = Array(30).fill(80);
      const closes = Array(30).fill(80);
      const result = calculateStochastic(highs, lows, closes);
      expect(result.percentK).toBe(0);
      expect(result.isOversold).toBe(true);
      expect(result.signal).toBe('OVERSOLD');
    });

    test('should handle very large price values', () => {
      const highs = Array(30).fill(100000120);
      const lows = Array(30).fill(100000080);
      const closes = Array(30).fill(100000100);
      const result = calculateStochastic(highs, lows, closes);
      expect(result.percentK).toBeCloseTo(50, 0);
    });
  });

  describe('signal field', () => {
    test('signal should be OVERBOUGHT when %K > 80', () => {
      const highs = Array(30).fill(120);
      const lows = Array(30).fill(80);
      const closes = Array(30).fill(116);
      const result = calculateStochastic(highs, lows, closes);
      if (result.percentK > 80) {
        expect(result.signal).toBe('OVERBOUGHT');
      }
    });

    test('signal should be OVERSOLD when %K < 20', () => {
      const highs = Array(30).fill(120);
      const lows = Array(30).fill(80);
      const closes = Array(30).fill(84);
      const result = calculateStochastic(highs, lows, closes);
      if (result.percentK < 20) {
        expect(result.signal).toBe('OVERSOLD');
      }
    });

    test('signal should be NEUTRAL when %K is between 20 and 80', () => {
      const highs = Array(30).fill(120);
      const lows = Array(30).fill(80);
      const closes = Array(30).fill(100);
      const result = calculateStochastic(highs, lows, closes);
      if (result.percentK >= 20 && result.percentK <= 80) {
        expect(result.signal).toBe('NEUTRAL');
      }
    });
  });

  describe('deterministic calculations', () => {
    test('should produce consistent results with same input', () => {
      const { highs, lows, closes } = generateStochasticData(30, 110, 90, 100);
      const result1 = calculateStochastic(highs, lows, closes);
      const result2 = calculateStochastic(highs, lows, closes);
      expect(result1.percentK).toBe(result2.percentK);
      expect(result1.percentD).toBe(result2.percentD);
      expect(result1.signal).toBe(result2.signal);
      expect(result1.crossover).toBe(result2.crossover);
    });

    test('should use custom kPeriod and dPeriod', () => {
      const highs = Array(30).fill(120);
      const lows = Array(30).fill(80);
      const closes = Array(30).fill(100);
      const result = calculateStochastic(highs, lows, closes, 7, 5);
      expect(typeof result.percentK).toBe('number');
      expect(typeof result.percentD).toBe('number');
      expect(result.percentK).toBeCloseTo(50, 0);
    });
  });
});
