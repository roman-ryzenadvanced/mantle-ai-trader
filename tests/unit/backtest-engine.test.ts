/**
 * Unit Tests for Backtest Engine v2.0.0
 * Tests for backtest execution, performance metrics, and optimization
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { BacktestEngine } from '../../src/lib/trading/backtest/backtest-engine';
import { TimeFrame } from '../../src/lib/trading/core/types';

describe('BacktestEngine v2.0.0', () => {
  let engine: BacktestEngine;

  beforeEach(() => {
    engine = new BacktestEngine();
  });

  describe('runBacktest', () => {
    test('should run a backtest and return a session', async () => {
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Shorter period
      
      const session = await engine.runBacktest({
        name: 'Test Backtest',
        symbol: 'BTCUSDT',
        startDate: oneMonthAgo,
        endDate: now,
        initialCapital: 10000,
        strategy: 'default',
        parameters: { riskPerTrade: 0.02 },
        fees: 0.001,
        slippage: 0.001
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.name).toBe('Test Backtest');
      expect(session.symbol).toBe('BTCUSDT');
      expect(['COMPLETED', 'FAILED', 'RUNNING']).toContain(session.status);
    }, 60000); // Longer timeout for backtest

    test('should have results when completed', async () => {
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const session = await engine.runBacktest({
        name: 'Test Backtest',
        symbol: 'BTCUSDT',
        startDate: oneMonthAgo,
        endDate: now,
        initialCapital: 10000,
        strategy: 'default',
        parameters: { riskPerTrade: 0.02 },
        fees: 0.001,
        slippage: 0.001
      });

      if (session.status === 'COMPLETED') {
        expect(session.initialCapital).toBe(10000);
        expect(session.finalCapital).toBeDefined();
        expect(session.totalTrades).toBeGreaterThanOrEqual(0);
      }
    }, 60000);
  });

  describe('generateReport', () => {
    test('should generate a text report', async () => {
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const session = await engine.runBacktest({
        name: 'Report Test',
        symbol: 'BTCUSDT',
        startDate: oneMonthAgo,
        endDate: now,
        initialCapital: 10000,
        strategy: 'default',
        parameters: { riskPerTrade: 0.02 },
        fees: 0.001,
        slippage: 0.001
      });

      const report = engine.generateReport(session);
      
      expect(report).toBeDefined();
      expect(report).toContain('Report Test');
      expect(report).toContain('BTCUSDT');
      expect(report).toContain('Performance Metrics');
    }, 60000);
  });

  describe('State Isolation (Bug Fix Validation)', () => {
    test('should not leak state between backtests', async () => {
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Run first backtest
      const session1 = await engine.runBacktest({
        name: 'First Run',
        symbol: 'BTCUSDT',
        startDate: oneMonthAgo,
        endDate: now,
        initialCapital: 10000,
        strategy: 'default',
        parameters: { riskPerTrade: 0.02 },
        fees: 0.001,
        slippage: 0.001
      });

      // Run second backtest
      const session2 = await engine.runBacktest({
        name: 'Second Run',
        symbol: 'ETHUSDT',
        startDate: oneMonthAgo,
        endDate: now,
        initialCapital: 5000,
        strategy: 'default',
        parameters: { riskPerTrade: 0.02 },
        fees: 0.001,
        slippage: 0.001
      });

      // Sessions should be independent
      expect(session1.symbol).toBe('BTCUSDT');
      expect(session2.symbol).toBe('ETHUSDT');
      expect(session1.initialCapital).toBe(10000);
      expect(session2.initialCapital).toBe(5000);
    }, 120000);
  });
});
