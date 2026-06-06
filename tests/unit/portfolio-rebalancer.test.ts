/**
 * Unit Tests for Portfolio Rebalancer
 * Tests the v4.0.0 Portfolio Rebalancer for drift detection and suggestions
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { PortfolioRebalancer, TargetAllocation, RebalanceMode } from '../../src/lib/trading/portfolio/rebalancer';

describe('Portfolio Rebalancer', () => {
  let rebalancer: PortfolioRebalancer;

  beforeEach(() => {
    rebalancer = new PortfolioRebalancer({
      driftThreshold: 0.05,
      mode: 'MANUAL',
      useRiskAdjustedAllocations: false, // Disable for simpler tests
    });
  });

  describe('creating target allocations', () => {
    test('should set a target allocation', () => {
      rebalancer.setTargetAllocation({ key: 'BTC', targetPercent: 0.5 });
      const allocations = rebalancer.getTargetAllocations();
      expect(allocations.length).toBe(1);
      expect(allocations[0].key).toBe('BTC');
      expect(allocations[0].targetPercent).toBe(0.5);
    });

    test('should set multiple target allocations', () => {
      rebalancer.setTargetAllocations([
        { key: 'BTC', targetPercent: 0.4 },
        { key: 'ETH', targetPercent: 0.3 },
        { key: 'SOL', targetPercent: 0.3 },
      ]);
      const allocations = rebalancer.getTargetAllocations();
      expect(allocations.length).toBe(3);
    });

    test('should reject target percent > 1', () => {
      expect(() => {
        rebalancer.setTargetAllocation({ key: 'BTC', targetPercent: 1.5 });
      }).toThrow();
    });

    test('should reject target percent < 0', () => {
      expect(() => {
        rebalancer.setTargetAllocation({ key: 'BTC', targetPercent: -0.1 });
      }).toThrow();
    });

    test('should allow target percent = 0', () => {
      expect(() => {
        rebalancer.setTargetAllocation({ key: 'BTC', targetPercent: 0 });
      }).not.toThrow();
    });

    test('should allow target percent = 1 (100%)', () => {
      expect(() => {
        rebalancer.setTargetAllocation({ key: 'BTC', targetPercent: 1 });
      }).not.toThrow();
    });

    test('should reject total allocation exceeding 100%', () => {
      expect(() => {
        rebalancer.setTargetAllocations([
          { key: 'BTC', targetPercent: 0.6 },
          { key: 'ETH', targetPercent: 0.5 },
        ]);
      }).toThrow();
    });

    test('should allow total allocation up to 100%', () => {
      expect(() => {
        rebalancer.setTargetAllocations([
          { key: 'BTC', targetPercent: 0.5 },
          { key: 'ETH', targetPercent: 0.5 },
        ]);
      }).not.toThrow();
    });

    test('should allow setting min and max percent', () => {
      rebalancer.setTargetAllocation({
        key: 'BTC',
        targetPercent: 0.4,
        minPercent: 0.1,
        maxPercent: 0.6,
      });
      const allocations = rebalancer.getTargetAllocations();
      expect(allocations[0].minPercent).toBe(0.1);
      expect(allocations[0].maxPercent).toBe(0.6);
    });

    test('should reject negative minPercent', () => {
      expect(() => {
        rebalancer.setTargetAllocation({ key: 'BTC', targetPercent: 0.5, minPercent: -0.1 });
      }).toThrow();
    });

    test('should reject maxPercent > 1', () => {
      expect(() => {
        rebalancer.setTargetAllocation({ key: 'BTC', targetPercent: 0.5, maxPercent: 1.5 });
      }).toThrow();
    });

    test('should remove a target allocation', () => {
      rebalancer.setTargetAllocation({ key: 'BTC', targetPercent: 0.5 });
      expect(rebalancer.getTargetAllocations().length).toBe(1);
      const removed = rebalancer.removeTargetAllocation('BTC');
      expect(removed).toBe(true);
      expect(rebalancer.getTargetAllocations().length).toBe(0);
    });

    test('should return false when removing non-existent allocation', () => {
      const removed = rebalancer.removeTargetAllocation('NOTEXIST');
      expect(removed).toBe(false);
    });

    test('should update existing target allocation', () => {
      rebalancer.setTargetAllocation({ key: 'BTC', targetPercent: 0.5 });
      rebalancer.setTargetAllocation({ key: 'BTC', targetPercent: 0.6 });
      const allocations = rebalancer.getTargetAllocations();
      expect(allocations.length).toBe(1);
      expect(allocations[0].targetPercent).toBe(0.6);
    });
  });

  describe('drift detection (5% threshold)', () => {
    beforeEach(() => {
      rebalancer.setTargetAllocations([
        { key: 'BTC', targetPercent: 0.5 },
        { key: 'ETH', targetPercent: 0.5 },
      ]);
    });

    test('should detect drift when allocation exceeds threshold', () => {
      // BTC is 60% (10% drift from 50% target), ETH is 40%
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 6000 },
        { symbol: 'ETH', marketValue: 4000 },
      ]);

      const btcAlloc = analysis.allocations.find(a => a.symbol === 'BTC');
      expect(btcAlloc).toBeDefined();
      expect(btcAlloc!.drift).toBeCloseTo(0.1, 2); // 60% - 50% = 10%
      expect(btcAlloc!.needsRebalance).toBe(true); // 10% > 5% threshold
    });

    test('should not flag drift within threshold', () => {
      // BTC is 52% (2% drift), ETH is 48%
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 5200 },
        { symbol: 'ETH', marketValue: 4800 },
      ]);

      const btcAlloc = analysis.allocations.find(a => a.symbol === 'BTC');
      expect(btcAlloc!.needsRebalance).toBe(false); // 2% < 5% threshold
    });

    test('should calculate drift score', () => {
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 7000 },
        { symbol: 'ETH', marketValue: 3000 },
      ]);

      expect(analysis.portfolioDriftScore).toBeGreaterThan(0);
    });

    test('should calculate drift score as sum of squared abs drifts', () => {
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 6000 },
        { symbol: 'ETH', marketValue: 4000 },
      ]);

      // BTC drift = 0.1, ETH drift = -0.1
      // score = 0.1^2 + 0.1^2 = 0.02
      expect(analysis.portfolioDriftScore).toBeCloseTo(0.02, 3);
    });

    test('should report exact drift percentage', () => {
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 6500 },
        { symbol: 'ETH', marketValue: 3500 },
      ]);

      const btcAlloc = analysis.allocations.find(a => a.symbol === 'BTC');
      expect(btcAlloc!.currentPercent).toBeCloseTo(0.65, 2);
      expect(btcAlloc!.targetPercent).toBe(0.5);
      expect(btcAlloc!.drift).toBeCloseTo(0.15, 2);
      expect(btcAlloc!.absDrift).toBeCloseTo(0.15, 2);
    });
  });

  describe('rebalancing suggestions (BUY/SELL/HOLD)', () => {
    beforeEach(() => {
      rebalancer.setTargetAllocations([
        { key: 'BTC', targetPercent: 0.5 },
        { key: 'ETH', targetPercent: 0.3 },
        { key: 'SOL', targetPercent: 0.2 },
      ]);
    });

    test('should suggest SELL for over-allocated positions', () => {
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 7000 },
        { symbol: 'ETH', marketValue: 2000 },
        { symbol: 'SOL', marketValue: 1000 },
      ]);

      const btcSuggestion = analysis.suggestions.find(s => s.symbol === 'BTC');
      expect(btcSuggestion).toBeDefined();
      expect(btcSuggestion!.action).toBe('SELL');
      expect(btcSuggestion!.suggestedAmount).toBeGreaterThan(0);
    });

    test('should suggest BUY for under-allocated positions', () => {
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 3000 },
        { symbol: 'ETH', marketValue: 5000 },
        { symbol: 'SOL', marketValue: 2000 },
      ]);

      const btcSuggestion = analysis.suggestions.find(s => s.symbol === 'BTC');
      expect(btcSuggestion!.action).toBe('BUY');
    });

    test('should suggest HOLD for positions within threshold', () => {
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 5100 },
        { symbol: 'ETH', marketValue: 3000 },
        { symbol: 'SOL', marketValue: 1900 },
      ]);

      const btcSuggestion = analysis.suggestions.find(s => s.symbol === 'BTC');
      expect(btcSuggestion!.action).toBe('HOLD');
    });

    test('should sort suggestions by priority (highest drift first)', () => {
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 8000 },
        { symbol: 'ETH', marketValue: 1000 },
        { symbol: 'SOL', marketValue: 1000 },
      ]);

      // BTC has 30% drift, should be first
      expect(analysis.suggestions[0].symbol).toBe('BTC');
    });

    test('should calculate suggestedAmount correctly for SELL', () => {
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 7000 },
        { symbol: 'ETH', marketValue: 2000 },
        { symbol: 'SOL', marketValue: 1000 },
      ]);

      // Total = 10000, BTC drift = 0.7 - 0.5 = 0.2, suggestedAmount = 0.2 * 10000 = 2000
      const btcSuggestion = analysis.suggestions.find(s => s.symbol === 'BTC');
      expect(btcSuggestion!.suggestedAmount).toBeCloseTo(2000, 0);
    });

    test('should calculate suggestedAmount correctly for BUY', () => {
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 3000 },
        { symbol: 'ETH', marketValue: 5000 },
        { symbol: 'SOL', marketValue: 2000 },
      ]);

      // Total = 10000, BTC drift = 0.3 - 0.5 = -0.2, suggestedAmount = 0.2 * 10000 = 2000
      const btcSuggestion = analysis.suggestions.find(s => s.symbol === 'BTC');
      expect(btcSuggestion!.suggestedAmount).toBeCloseTo(2000, 0);
    });

    test('should include reason in suggestions', () => {
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 7000 },
        { symbol: 'ETH', marketValue: 2000 },
        { symbol: 'SOL', marketValue: 1000 },
      ]);

      const btcSuggestion = analysis.suggestions.find(s => s.symbol === 'BTC');
      expect(btcSuggestion!.reason).toContain('Over-allocated');
    });

    test('HOLD suggestion should include threshold reason', () => {
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 5100 },
        { symbol: 'ETH', marketValue: 3000 },
        { symbol: 'SOL', marketValue: 1900 },
      ]);

      const holdSuggestion = analysis.suggestions.find(s => s.action === 'HOLD');
      expect(holdSuggestion!.reason).toContain('threshold');
    });
  });

  describe('risk-adjusted allocation', () => {
    test('should apply risk adjustment when enabled', () => {
      const riskRebalancer = new PortfolioRebalancer({
        driftThreshold: 0.05,
        mode: 'MANUAL',
        useRiskAdjustedAllocations: true,
      });
      riskRebalancer.setTargetAllocations([
        { key: 'BTC', targetPercent: 0.5 },
        { key: 'ETH', targetPercent: 0.5 },
      ]);

      const analysis = riskRebalancer.analyze([
        { symbol: 'BTC', marketValue: 5000, volatility: 0.8 },
        { symbol: 'ETH', marketValue: 5000, volatility: 0.4 },
      ]);

      // With risk adjustment, lower volatility should get higher effective target
      expect(analysis.allocations.length).toBe(2);
    });

    test('risk-adjusted should give lower-volatility assets higher effective target', () => {
      // Use a higher maxPositionSize so the risk adjustment is not capped
      const riskRebalancer = new PortfolioRebalancer({
        driftThreshold: 0.05,
        mode: 'MANUAL',
        useRiskAdjustedAllocations: true,
        maxPositionSize: 0.8, // Allow higher allocation so adjustment is visible
      });
      riskRebalancer.setTargetAllocations([
        { key: 'BTC', targetPercent: 0.5, maxPercent: 0.8 },
        { key: 'ETH', targetPercent: 0.5, maxPercent: 0.8 },
      ]);

      const analysis = riskRebalancer.analyze([
        { symbol: 'BTC', marketValue: 5000, volatility: 0.8 },
        { symbol: 'ETH', marketValue: 5000, volatility: 0.4 },
      ]);

      // ETH has lower volatility, so it should have a higher effective target after adjustment
      const ethAlloc = analysis.allocations.find(a => a.symbol === 'ETH');
      const btcAlloc = analysis.allocations.find(a => a.symbol === 'BTC');
      // The adjusted target for ETH should be greater than BTC's
      expect(ethAlloc!.targetPercent).toBeGreaterThan(btcAlloc!.targetPercent);
    });

    test('should not crash when volatility is not provided', () => {
      const riskRebalancer = new PortfolioRebalancer({
        driftThreshold: 0.05,
        mode: 'MANUAL',
        useRiskAdjustedAllocations: true,
      });
      riskRebalancer.setTargetAllocations([
        { key: 'BTC', targetPercent: 0.5 },
        { key: 'ETH', targetPercent: 0.5 },
      ]);

      // No volatility provided - should not crash
      const analysis = riskRebalancer.analyze([
        { symbol: 'BTC', marketValue: 5000 },
        { symbol: 'ETH', marketValue: 5000 },
      ]);

      expect(analysis.allocations.length).toBe(2);
    });
  });

  describe('zero-positions portfolio', () => {
    test('should return no suggestions for zero-value portfolio', () => {
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 0 },
        { symbol: 'ETH', marketValue: 0 },
      ]);

      expect(analysis.totalPortfolioValue).toBe(0);
      expect(analysis.suggestions.length).toBe(0);
      expect(analysis.isWithinThreshold).toBe(true);
    });

    test('should return empty analysis for empty positions array', () => {
      const analysis = rebalancer.analyze([]);
      expect(analysis.totalPortfolioValue).toBe(0);
      expect(analysis.allocations.length).toBe(0);
      expect(analysis.isWithinThreshold).toBe(true);
    });
  });

  describe('perfectly balanced portfolio', () => {
    test('should return no rebalancing needed for perfectly balanced portfolio', () => {
      rebalancer.setTargetAllocations([
        { key: 'BTC', targetPercent: 0.5 },
        { key: 'ETH', targetPercent: 0.5 },
      ]);

      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 5000 },
        { symbol: 'ETH', marketValue: 5000 },
      ]);

      expect(analysis.isWithinThreshold).toBe(true);
      const nonHoldSuggestions = analysis.suggestions.filter(s => s.action !== 'HOLD');
      expect(nonHoldSuggestions.length).toBe(0);
    });

    test('should have zero drift score for perfectly balanced portfolio', () => {
      rebalancer.setTargetAllocations([
        { key: 'BTC', targetPercent: 0.5 },
        { key: 'ETH', targetPercent: 0.5 },
      ]);

      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 5000 },
        { symbol: 'ETH', marketValue: 5000 },
      ]);

      expect(analysis.portfolioDriftScore).toBe(0);
    });
  });

  describe('manual vs auto-rebalancing modes', () => {
    test('should report MANUAL mode', () => {
      const manualRebalancer = new PortfolioRebalancer({ mode: 'MANUAL' });
      const config = manualRebalancer.getConfig();
      expect(config.mode).toBe('MANUAL');
    });

    test('should report AUTO mode', () => {
      const autoRebalancer = new PortfolioRebalancer({ mode: 'AUTO' });
      const config = autoRebalancer.getConfig();
      expect(config.mode).toBe('AUTO');
    });

    test('should include mode in analysis result', () => {
      rebalancer.setTargetAllocation({ key: 'BTC', targetPercent: 1.0 });
      const analysis = rebalancer.analyze([{ symbol: 'BTC', marketValue: 10000 }]);
      expect(analysis.mode).toBe('MANUAL');
    });

    test('should update mode via updateConfig', () => {
      rebalancer.updateConfig({ mode: 'AUTO' });
      const config = rebalancer.getConfig();
      expect(config.mode).toBe('AUTO');
    });
  });

  describe('static helper methods', () => {
    test('generateEqualWeight should create equal allocations', () => {
      const allocations = PortfolioRebalancer.generateEqualWeight(['BTC', 'ETH', 'SOL']);
      expect(allocations.length).toBe(3);
      allocations.forEach(a => {
        expect(a.targetPercent).toBeCloseTo(1 / 3, 5);
      });
    });

    test('generateEqualWeight with empty array should return empty', () => {
      const allocations = PortfolioRebalancer.generateEqualWeight([]);
      expect(allocations.length).toBe(0);
    });

    test('generateEqualWeight with single symbol should give 100%', () => {
      const allocations = PortfolioRebalancer.generateEqualWeight(['BTC']);
      expect(allocations.length).toBe(1);
      expect(allocations[0].targetPercent).toBe(1);
    });

    test('generateRiskWeighted should allocate more to lower volatility', () => {
      const allocations = PortfolioRebalancer.generateRiskWeighted([
        { symbol: 'BTC', annualizedVol: 0.8 },
        { symbol: 'ETH', annualizedVol: 0.4 },
      ]);
      expect(allocations.length).toBe(2);
      // ETH (lower vol) should get higher allocation
      const ethAlloc = allocations.find(a => a.key === 'ETH');
      const btcAlloc = allocations.find(a => a.key === 'BTC');
      expect(ethAlloc!.targetPercent).toBeGreaterThan(btcAlloc!.targetPercent);
    });

    test('generateRiskWeighted with empty array should return empty', () => {
      const allocations = PortfolioRebalancer.generateRiskWeighted([]);
      expect(allocations.length).toBe(0);
    });

    test('generateRiskWeighted should set min and max percent', () => {
      const allocations = PortfolioRebalancer.generateRiskWeighted([
        { symbol: 'BTC', annualizedVol: 0.5 },
      ]);
      expect(allocations[0].minPercent).toBe(0.02);
      expect(allocations[0].maxPercent).toBe(0.40);
    });

    test('generateRiskWeighted should handle equal volatilities', () => {
      const allocations = PortfolioRebalancer.generateRiskWeighted([
        { symbol: 'BTC', annualizedVol: 0.5 },
        { symbol: 'ETH', annualizedVol: 0.5 },
      ]);
      // Equal vol should result in equal allocation
      expect(allocations[0].targetPercent).toBeCloseTo(allocations[1].targetPercent, 3);
    });
  });

  describe('analysis with no target allocations', () => {
    test('should treat missing targets as 0% allocation', () => {
      // No targets set, all positions are 100% over-allocated
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 10000 },
      ]);

      const btcAlloc = analysis.allocations.find(a => a.symbol === 'BTC');
      expect(btcAlloc!.targetPercent).toBe(0);
      expect(btcAlloc!.drift).toBeCloseTo(1.0, 2); // 100% - 0% = 100%
      expect(btcAlloc!.needsRebalance).toBe(true);
    });
  });

  describe('getConfig', () => {
    test('should return a read-only copy of config', () => {
      const config1 = rebalancer.getConfig();
      config1.driftThreshold = 0.5; // Mutate
      const config2 = rebalancer.getConfig();
      expect(config2.driftThreshold).toBe(0.05); // Original unchanged
    });

    test('should include all config fields', () => {
      const config = rebalancer.getConfig();
      expect(config).toHaveProperty('driftThreshold');
      expect(config).toHaveProperty('mode');
      expect(config).toHaveProperty('useRiskAdjustedAllocations');
      expect(config).toHaveProperty('riskFreeRate');
      expect(config).toHaveProperty('maxPositionSize');
      expect(config).toHaveProperty('minPositionSize');
    });
  });

  describe('deterministic behavior', () => {
    test('should produce consistent results with same input', () => {
      rebalancer.setTargetAllocations([
        { key: 'BTC', targetPercent: 0.5 },
        { key: 'ETH', targetPercent: 0.5 },
      ]);

      const positions = [
        { symbol: 'BTC', marketValue: 6000 },
        { symbol: 'ETH', marketValue: 4000 },
      ];

      const analysis1 = rebalancer.analyze(positions);
      const analysis2 = rebalancer.analyze(positions);

      expect(analysis1.portfolioDriftScore).toBe(analysis2.portfolioDriftScore);
      expect(analysis1.isWithinThreshold).toBe(analysis2.isWithinThreshold);
      expect(analysis1.suggestions.length).toBe(analysis2.suggestions.length);
    });

    test('should produce consistent allocation percentages', () => {
      rebalancer.setTargetAllocations([
        { key: 'BTC', targetPercent: 0.5 },
        { key: 'ETH', targetPercent: 0.3 },
        { key: 'SOL', targetPercent: 0.2 },
      ]);

      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 6000 },
        { symbol: 'ETH', marketValue: 3000 },
        { symbol: 'SOL', marketValue: 1000 },
      ]);

      // BTC: 6000/10000 = 60%, ETH: 30%, SOL: 10%
      const btcAlloc = analysis.allocations.find(a => a.symbol === 'BTC');
      const ethAlloc = analysis.allocations.find(a => a.symbol === 'ETH');
      const solAlloc = analysis.allocations.find(a => a.symbol === 'SOL');

      expect(btcAlloc!.currentPercent).toBeCloseTo(0.6, 5);
      expect(ethAlloc!.currentPercent).toBeCloseTo(0.3, 5);
      expect(solAlloc!.currentPercent).toBeCloseTo(0.1, 5);
    });
  });

  describe('custom drift threshold', () => {
    test('should use custom drift threshold from constructor', () => {
      const tightRebalancer = new PortfolioRebalancer({ driftThreshold: 0.02 });
      tightRebalancer.setTargetAllocations([
        { key: 'BTC', targetPercent: 0.5 },
        { key: 'ETH', targetPercent: 0.5 },
      ]);

      // 4% drift should be flagged with 2% threshold
      const analysis = tightRebalancer.analyze([
        { symbol: 'BTC', marketValue: 5400 },
        { symbol: 'ETH', marketValue: 4600 },
      ]);

      const btcAlloc = analysis.allocations.find(a => a.symbol === 'BTC');
      expect(btcAlloc!.needsRebalance).toBe(true);
    });

    test('should update drift threshold via updateConfig', () => {
      rebalancer.updateConfig({ driftThreshold: 0.10 });
      rebalancer.setTargetAllocations([
        { key: 'BTC', targetPercent: 0.5 },
        { key: 'ETH', targetPercent: 0.5 },
      ]);

      // 8% drift should not be flagged with 10% threshold
      const analysis = rebalancer.analyze([
        { symbol: 'BTC', marketValue: 5800 },
        { symbol: 'ETH', marketValue: 4200 },
      ]);

      const btcAlloc = analysis.allocations.find(a => a.symbol === 'BTC');
      expect(btcAlloc!.needsRebalance).toBe(false);
    });
  });
});
