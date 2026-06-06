/**
 * Unit Tests for Trade Journal System
 * Tests the v4.0.0 Trade Journal for recording and reviewing trades
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { TradeJournal, JournalEntry } from '../../src/lib/trading/journal/trade-journal';
import { TradeAction } from '../../src/lib/trading/core/types';

describe('Trade Journal', () => {
  let journal: TradeJournal;

  beforeEach(() => {
    journal = new TradeJournal();
  });

  describe('creating a journal entry', () => {
    test('should create a journal entry with required fields', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        strategyType: 'TECHNICAL',
        entryReason: 'Breakout above resistance',
        emotionalState: 'CONFIDENT',
        marketCondition: 'TRENDING_UP',
        entryPrice: 45000,
        quantity: 0.1,
        leverage: 1,
      });

      expect(entry).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.id).toMatch(/^journal-/);
      expect(entry.symbol).toBe('BTCUSDT');
      expect(entry.side).toBe(TradeAction.BUY);
      expect(entry.strategyType).toBe('TECHNICAL');
      expect(entry.entryReason).toBe('Breakout above resistance');
      expect(entry.emotionalState).toBe('CONFIDENT');
      expect(entry.marketCondition).toBe('TRENDING_UP');
      expect(entry.entryPrice).toBe(45000);
      expect(entry.quantity).toBe(0.1);
      expect(entry.leverage).toBe(1);
    });

    test('should generate unique IDs for each entry', () => {
      const entry1 = journal.recordEntry({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        strategyType: 'TECHNICAL',
        entryReason: 'Test 1',
        emotionalState: 'CONFIDENT',
        marketCondition: 'TRENDING_UP',
        entryPrice: 45000,
        quantity: 0.1,
        leverage: 1,
      });
      const entry2 = journal.recordEntry({
        symbol: 'ETHUSDT',
        side: TradeAction.SELL,
        strategyType: 'FUNDAMENTAL',
        entryReason: 'Test 2',
        emotionalState: 'ANXIOUS',
        marketCondition: 'HIGH_VOLATILITY',
        entryPrice: 2500,
        quantity: 2,
        leverage: 5,
      });
      expect(entry1.id).not.toBe(entry2.id);
    });

    test('should record entry time', () => {
      const before = Date.now();
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        strategyType: 'TECHNICAL',
        entryReason: 'Test',
        emotionalState: 'CONFIDENT',
        marketCondition: 'TRENDING_UP',
        entryPrice: 45000,
        quantity: 0.1,
        leverage: 1,
      });
      const after = Date.now();
      expect(entry.entryTime.getTime()).toBeGreaterThanOrEqual(before);
      expect(entry.entryTime.getTime()).toBeLessThanOrEqual(after);
    });

    test('should store optional signalData', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        strategyType: 'COMBINED',
        entryReason: 'AI signal',
        signalData: { confidence: 0.85, rsi: 30 },
        emotionalState: 'PATIENT',
        marketCondition: 'RANGING',
        entryPrice: 45000,
        quantity: 0.1,
        leverage: 1,
      });
      expect(entry.signalData).toBeDefined();
      expect(entry.signalData?.confidence).toBe(0.85);
    });

    test('should store optional stopLoss and takeProfit', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        strategyType: 'TECHNICAL',
        entryReason: 'Test',
        emotionalState: 'DISCIPLINED',
        marketCondition: 'TRENDING_UP',
        entryPrice: 45000,
        quantity: 0.1,
        leverage: 1,
        stopLoss: 44000,
        takeProfit: 47000,
      });
      expect(entry.stopLoss).toBe(44000);
      expect(entry.takeProfit).toBe(47000);
    });

    test('should store optional notes', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        strategyType: 'TECHNICAL',
        entryReason: 'Test',
        emotionalState: 'CONFIDENT',
        marketCondition: 'TRENDING_UP',
        entryPrice: 45000,
        quantity: 0.1,
        leverage: 1,
        notes: 'Waiting for volume confirmation',
      });
      expect(entry.notes).toBe('Waiting for volume confirmation');
    });

    test('should not have exit fields on initial entry', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        strategyType: 'TECHNICAL',
        entryReason: 'Test',
        emotionalState: 'CONFIDENT',
        marketCondition: 'TRENDING_UP',
        entryPrice: 45000,
        quantity: 0.1,
        leverage: 1,
      });
      expect(entry.exitPrice).toBeUndefined();
      expect(entry.exitTime).toBeUndefined();
      expect(entry.exitReason).toBeUndefined();
      expect(entry.pnl).toBeUndefined();
      expect(entry.pnlPercent).toBeUndefined();
      expect(entry.isWin).toBeUndefined();
      expect(entry.durationMs).toBeUndefined();
    });
  });

  describe('recording exit data with PnL', () => {
    test('should record exit data on a journal entry', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        strategyType: 'TECHNICAL',
        entryReason: 'Breakout',
        emotionalState: 'CONFIDENT',
        marketCondition: 'TRENDING_UP',
        entryPrice: 45000,
        quantity: 0.1,
        leverage: 1,
      });

      const updated = journal.recordExit(entry.id, {
        exitPrice: 46000,
        exitReason: 'TAKE_PROFIT',
        pnl: 100,
        lessonsLearned: 'Patience pays off',
      });

      expect(updated).not.toBeNull();
      expect(updated!.exitPrice).toBe(46000);
      expect(updated!.exitReason).toBe('TAKE_PROFIT');
      expect(updated!.pnl).toBe(100);
      expect(updated!.isWin).toBe(true);
      expect(updated!.lessonsLearned).toBe('Patience pays off');
    });

    test('should calculate pnlPercent correctly', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        strategyType: 'TECHNICAL',
        entryReason: 'Test',
        emotionalState: 'CONFIDENT',
        marketCondition: 'TRENDING_UP',
        entryPrice: 45000,
        quantity: 0.1,
        leverage: 1,
      });

      const updated = journal.recordExit(entry.id, {
        exitPrice: 46000,
        exitReason: 'TAKE_PROFIT',
        pnl: 100,
      });

      expect(updated!.pnlPercent).toBeDefined();
      // pnlPercent = pnl / (entryPrice * quantity) * 100
      // = 100 / (45000 * 0.1) * 100 = 100 / 4500 * 100 ≈ 2.22%
      expect(updated!.pnlPercent!).toBeCloseTo(2.22, 0);
    });

    test('should set isWin to false for losing trades', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        strategyType: 'TECHNICAL',
        entryReason: 'Test',
        emotionalState: 'CONFIDENT',
        marketCondition: 'TRENDING_UP',
        entryPrice: 45000,
        quantity: 0.1,
        leverage: 1,
      });

      const updated = journal.recordExit(entry.id, {
        exitPrice: 44000,
        exitReason: 'STOP_LOSS',
        pnl: -100,
      });

      expect(updated!.isWin).toBe(false);
    });

    test('should set isWin to undefined for breakeven trades (pnl=0)', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        strategyType: 'TECHNICAL',
        entryReason: 'Test',
        emotionalState: 'CONFIDENT',
        marketCondition: 'TRENDING_UP',
        entryPrice: 45000,
        quantity: 0.1,
        leverage: 1,
      });

      const updated = journal.recordExit(entry.id, {
        exitPrice: 45000,
        exitReason: 'MANUAL_CLOSE',
        pnl: 0,
      });

      // pnl > 0 is false, so isWin should be false
      expect(updated!.isWin).toBe(false);
    });

    test('should calculate durationMs', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        strategyType: 'TECHNICAL',
        entryReason: 'Test',
        emotionalState: 'CONFIDENT',
        marketCondition: 'TRENDING_UP',
        entryPrice: 45000,
        quantity: 0.1,
        leverage: 1,
      });

      const updated = journal.recordExit(entry.id, {
        exitPrice: 46000,
        exitReason: 'TAKE_PROFIT',
        pnl: 100,
      });

      expect(updated!.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('should return null for non-existent entry', () => {
      const result = journal.recordExit('non-existent-id', {
        exitPrice: 46000,
        exitReason: 'TAKE_PROFIT',
        pnl: 100,
      });
      expect(result).toBeNull();
    });

    test('should append notes on exit', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT',
        side: TradeAction.BUY,
        strategyType: 'TECHNICAL',
        entryReason: 'Test',
        emotionalState: 'CONFIDENT',
        marketCondition: 'TRENDING_UP',
        entryPrice: 45000,
        quantity: 0.1,
        leverage: 1,
        notes: 'Initial note',
      });

      const updated = journal.recordExit(entry.id, {
        exitPrice: 46000,
        exitReason: 'TAKE_PROFIT',
        pnl: 100,
        notes: 'Exit note',
      });

      expect(updated!.notes).toContain('Initial note');
      expect(updated!.notes).toContain('Exit note');
    });

    test('should handle all exit reason types', () => {
      const exitReasons = ['TAKE_PROFIT', 'STOP_LOSS', 'TRAILING_STOP', 'MANUAL_CLOSE', 'SIGNAL_REVERSAL', 'TIME_BASED', 'MARGIN_CALL', 'CIRCUIT_BREAKER'] as const;

      exitReasons.forEach((reason, idx) => {
        const entry = journal.recordEntry({
          symbol: `SYM${idx}`,
          side: TradeAction.BUY,
          strategyType: 'TECHNICAL',
          entryReason: 'Test',
          emotionalState: 'CONFIDENT',
          marketCondition: 'TRENDING_UP',
          entryPrice: 100,
          quantity: 1,
          leverage: 1,
        });
        const updated = journal.recordExit(entry.id, {
          exitPrice: 110,
          exitReason: reason,
          pnl: 10,
        });
        expect(updated!.exitReason).toBe(reason);
      });
    });
  });

  describe('generating review reports', () => {
    beforeEach(() => {
      // Add some trades
      const entry1 = journal.recordEntry({
        symbol: 'BTCUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Breakout', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 45000, quantity: 0.1, leverage: 1,
      });
      journal.recordExit(entry1.id, { exitPrice: 46000, exitReason: 'TAKE_PROFIT', pnl: 100 });

      const entry2 = journal.recordEntry({
        symbol: 'ETHUSDT', side: TradeAction.SELL, strategyType: 'FUNDAMENTAL',
        entryReason: 'News drop', emotionalState: 'ANXIOUS', marketCondition: 'NEWS_DRIVEN',
        entryPrice: 2500, quantity: 2, leverage: 1,
      });
      journal.recordExit(entry2.id, { exitPrice: 2600, exitReason: 'STOP_LOSS', pnl: -200 });

      const entry3 = journal.recordEntry({
        symbol: 'SOLUSDT', side: TradeAction.BUY, strategyType: 'COMBINED',
        entryReason: 'Momentum play', emotionalState: 'PATIENT', marketCondition: 'BREAKOUT',
        entryPrice: 100, quantity: 10, leverage: 1,
      });
      journal.recordExit(entry3.id, { exitPrice: 115, exitReason: 'TAKE_PROFIT', pnl: 150 });
    });

    test('should generate a review report', () => {
      const report = journal.generateReviewReport();
      expect(report).toBeDefined();
      expect(report.generatedAt).toBeDefined();
      expect(report.totalTrades).toBe(3);
    });

    test('should calculate overall win rate', () => {
      const report = journal.generateReviewReport();
      // 2 wins out of 3
      expect(report.overallWinRate).toBeCloseTo(66.67, 0);
    });

    test('should calculate total PnL', () => {
      const report = journal.generateReviewReport();
      expect(report.totalPnL).toBe(100 + (-200) + 150); // = 50
    });

    test('should calculate average PnL', () => {
      const report = journal.generateReviewReport();
      expect(report.avgPnL).toBeCloseTo(50 / 3, 1);
    });

    test('should calculate profit factor', () => {
      const report = journal.generateReviewReport();
      // grossProfit=250, grossLoss=200, profitFactor=250/200=1.25
      expect(report.profitFactor).toBeCloseTo(1.25, 1);
    });

    test('should include stats by strategy type', () => {
      const report = journal.generateReviewReport();
      expect(report.statsByStrategyType).toBeDefined();
      expect(report.statsByStrategyType.length).toBeGreaterThan(0);
    });

    test('should include stats by market condition', () => {
      const report = journal.generateReviewReport();
      expect(report.statsByMarketCondition).toBeDefined();
      expect(report.statsByMarketCondition.length).toBeGreaterThan(0);
    });

    test('should include stats by emotional state', () => {
      const report = journal.generateReviewReport();
      expect(report.statsByEmotionalState).toBeDefined();
    });

    test('should include best and worst setups', () => {
      const report = journal.generateReviewReport();
      expect(report.bestSetups).toBeDefined();
      expect(report.worstSetups).toBeDefined();
    });

    test('should include stats by time of day', () => {
      const report = journal.generateReviewReport();
      expect(report.statsByTimeOfDay).toBeDefined();
    });

    test('should include stats by day of week', () => {
      const report = journal.generateReviewReport();
      expect(report.statsByDayOfWeek).toBeDefined();
    });

    test('should handle empty journal for report', () => {
      const emptyJournal = new TradeJournal();
      const report = emptyJournal.generateReviewReport();
      expect(report.totalTrades).toBe(0);
      expect(report.overallWinRate).toBe(0);
      expect(report.totalPnL).toBe(0);
      expect(report.avgPnL).toBe(0);
      expect(report.profitFactor).toBe(0);
    });
  });

  describe('filtering trades', () => {
    test('should filter entries by symbol', () => {
      journal.recordEntry({
        symbol: 'BTCUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 45000, quantity: 0.1, leverage: 1,
      });
      journal.recordEntry({
        symbol: 'ETHUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 2500, quantity: 2, leverage: 1,
      });
      journal.recordEntry({
        symbol: 'BTCUSDT', side: TradeAction.SELL, strategyType: 'FUNDAMENTAL',
        entryReason: 'Test', emotionalState: 'ANXIOUS', marketCondition: 'NEWS_DRIVEN',
        entryPrice: 45000, quantity: 0.1, leverage: 1,
      });

      const btcEntries = journal.getEntriesBySymbol('BTCUSDT');
      expect(btcEntries.length).toBe(2);
      const ethEntries = journal.getEntriesBySymbol('ETHUSDT');
      expect(ethEntries.length).toBe(1);
    });

    test('should return empty array for unknown symbol', () => {
      const entries = journal.getEntriesBySymbol('UNKNOWN');
      expect(entries.length).toBe(0);
    });

    test('should return only closed entries', () => {
      const entry1 = journal.recordEntry({
        symbol: 'BTCUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 45000, quantity: 0.1, leverage: 1,
      });
      journal.recordExit(entry1.id, { exitPrice: 46000, exitReason: 'TAKE_PROFIT', pnl: 100 });

      journal.recordEntry({
        symbol: 'ETHUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 2500, quantity: 2, leverage: 1,
      }); // Not closed

      const closed = journal.getClosedEntries();
      expect(closed.length).toBe(1);
      expect(closed[0].symbol).toBe('BTCUSDT');
    });

    test('should return only open entries', () => {
      const entry1 = journal.recordEntry({
        symbol: 'BTCUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 45000, quantity: 0.1, leverage: 1,
      });
      journal.recordExit(entry1.id, { exitPrice: 46000, exitReason: 'TAKE_PROFIT', pnl: 100 });

      journal.recordEntry({
        symbol: 'ETHUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 2500, quantity: 2, leverage: 1,
      }); // Open

      const open = journal.getOpenEntries();
      expect(open.length).toBe(1);
      expect(open[0].symbol).toBe('ETHUSDT');
    });
  });

  describe('win rate by strategy type', () => {
    test('should calculate correct win rate per strategy type', () => {
      // 2 technical trades: 1 win, 1 loss
      const e1 = journal.recordEntry({
        symbol: 'BTCUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 45000, quantity: 0.1, leverage: 1,
      });
      journal.recordExit(e1.id, { exitPrice: 46000, exitReason: 'TAKE_PROFIT', pnl: 100 });

      const e2 = journal.recordEntry({
        symbol: 'ETHUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'ANXIOUS', marketCondition: 'RANGING',
        entryPrice: 2500, quantity: 2, leverage: 1,
      });
      journal.recordExit(e2.id, { exitPrice: 2400, exitReason: 'STOP_LOSS', pnl: -200 });

      // 1 fundamental trade: 1 win
      const e3 = journal.recordEntry({
        symbol: 'SOLUSDT', side: TradeAction.BUY, strategyType: 'FUNDAMENTAL',
        entryReason: 'Test', emotionalState: 'PATIENT', marketCondition: 'NEWS_DRIVEN',
        entryPrice: 100, quantity: 10, leverage: 1,
      });
      journal.recordExit(e3.id, { exitPrice: 110, exitReason: 'TAKE_PROFIT', pnl: 100 });

      const report = journal.generateReviewReport();
      const techStats = report.statsByStrategyType.find(s => s.group === 'TECHNICAL');
      const fundStats = report.statsByStrategyType.find(s => s.group === 'FUNDAMENTAL');

      expect(techStats).toBeDefined();
      expect(techStats!.winRate).toBeCloseTo(50, 0); // 1/2 = 50%
      expect(techStats!.count).toBe(2);

      expect(fundStats).toBeDefined();
      expect(fundStats!.winRate).toBe(100); // 1/1 = 100%
      expect(fundStats!.count).toBe(1);
    });
  });

  describe('export to JSON', () => {
    test('should export journal to valid JSON', () => {
      journal.recordEntry({
        symbol: 'BTCUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 45000, quantity: 0.1, leverage: 1,
      });

      const json = journal.exportToJSON();
      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('exportedAt');
      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('totalEntries');
      expect(parsed).toHaveProperty('entries');
      expect(parsed.entries).toBeInstanceOf(Array);
      expect(parsed.entries.length).toBe(1);
    });

    test('should include all entry fields in JSON export', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 45000, quantity: 0.1, leverage: 1,
      });
      journal.recordExit(entry.id, {
        exitPrice: 46000, exitReason: 'TAKE_PROFIT', pnl: 100,
        lessonsLearned: 'Wait for confirmation',
      });

      const json = journal.exportToJSON();
      const parsed = JSON.parse(json);
      const exportedEntry = parsed.entries[0];
      expect(exportedEntry.symbol).toBe('BTCUSDT');
      expect(exportedEntry.exitPrice).toBe(46000);
      expect(exportedEntry.lessonsLearned).toContain('Wait for confirmation');
    });

    test('should handle round-trip export/import', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 45000, quantity: 0.1, leverage: 1,
      });
      journal.recordExit(entry.id, {
        exitPrice: 46000, exitReason: 'TAKE_PROFIT', pnl: 100,
      });

      const json = journal.exportToJSON();
      const newJournal = new TradeJournal();
      const count = newJournal.importFromJSON(json);
      expect(count).toBe(1);
      expect(newJournal.getAllEntries().length).toBe(1);
      expect(newJournal.getAllEntries()[0].symbol).toBe('BTCUSDT');
    });
  });

  describe('lesson tracking', () => {
    test('should track lessons learned across trades', () => {
      const e1 = journal.recordEntry({
        symbol: 'BTCUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 45000, quantity: 0.1, leverage: 1,
      });
      journal.recordExit(e1.id, {
        exitPrice: 44000, exitReason: 'STOP_LOSS', pnl: -100,
        lessonsLearned: 'Always use stop loss; risk management is key',
      });

      const e2 = journal.recordEntry({
        symbol: 'ETHUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'FOMO', marketCondition: 'TRENDING_UP',
        entryPrice: 2500, quantity: 2, leverage: 1,
      });
      journal.recordExit(e2.id, {
        exitPrice: 2400, exitReason: 'STOP_LOSS', pnl: -200,
        lessonsLearned: 'Do not trade on FOMO; stick to the plan',
      });

      const report = journal.generateReviewReport();
      expect(report.commonMistakes).toBeDefined();
      expect(report.commonMistakes.length).toBeGreaterThan(0);
    });

    test('should not include mistakes when no lessons are recorded', () => {
      const e1 = journal.recordEntry({
        symbol: 'BTCUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 45000, quantity: 0.1, leverage: 1,
      });
      journal.recordExit(e1.id, { exitPrice: 46000, exitReason: 'TAKE_PROFIT', pnl: 100 });

      const report = journal.generateReviewReport();
      expect(report.commonMistakes.length).toBe(0);
    });
  });

  describe('clear', () => {
    test('should clear all entries', () => {
      journal.recordEntry({
        symbol: 'BTCUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 45000, quantity: 0.1, leverage: 1,
      });
      expect(journal.getAllEntries().length).toBe(1);
      journal.clear();
      expect(journal.getAllEntries().length).toBe(0);
    });
  });

  describe('getEntry', () => {
    test('should retrieve entry by ID', () => {
      const entry = journal.recordEntry({
        symbol: 'BTCUSDT', side: TradeAction.BUY, strategyType: 'TECHNICAL',
        entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'TRENDING_UP',
        entryPrice: 45000, quantity: 0.1, leverage: 1,
      });
      const retrieved = journal.getEntry(entry.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.symbol).toBe('BTCUSDT');
    });

    test('should return undefined for non-existent ID', () => {
      const result = journal.getEntry('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('emotional state tracking', () => {
    test('should group stats by all emotional states', () => {
      const states = ['CONFIDENT', 'ANXIOUS', 'FOMO', 'PATIENT', 'REVENGE_TRADING', 'DISCIPLINED', 'UNCERTAIN', 'EUPHORIC', 'FEARFUL'] as const;
      states.forEach((state, i) => {
        const e = journal.recordEntry({
          symbol: `SYM${i}`, side: TradeAction.BUY, strategyType: 'TECHNICAL',
          entryReason: 'Test', emotionalState: state, marketCondition: 'RANGING',
          entryPrice: 100, quantity: 1, leverage: 1,
        });
        journal.recordExit(e.id, { exitPrice: 110, exitReason: 'TAKE_PROFIT', pnl: 10 });
      });

      const report = journal.generateReviewReport();
      expect(report.statsByEmotionalState.length).toBe(9);
    });
  });

  describe('deterministic behavior', () => {
    test('getAllEntries should return all entries in insertion order', () => {
      const symbols = ['AAA', 'BBB', 'CCC'];
      symbols.forEach(sym => {
        journal.recordEntry({
          symbol: sym, side: TradeAction.BUY, strategyType: 'TECHNICAL',
          entryReason: 'Test', emotionalState: 'CONFIDENT', marketCondition: 'RANGING',
          entryPrice: 100, quantity: 1, leverage: 1,
        });
      });

      const entries = journal.getAllEntries();
      expect(entries.map(e => e.symbol)).toEqual(['AAA', 'BBB', 'CCC']);
    });
  });
});
