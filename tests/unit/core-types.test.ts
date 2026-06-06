/**
 * Unit Tests for Core Types
 * Validates enum values, type consistency, and data integrity
 */

import { describe, test, expect } from 'bun:test';
import {
  TradeAction,
  OrderType,
  OrderStatus,
  SignalStatus,
  SignalResult,
  RiskLevel,
  PositionSide,
  TimeFrame,
  NewsSource,
  SentimentLabel
} from '../../src/lib/trading/core/types';

describe('Core Types', () => {
  describe('TradeAction enum', () => {
    test('should have all expected values', () => {
      expect(TradeAction.BUY).toBe('BUY');
      expect(TradeAction.SELL).toBe('SELL');
      expect(TradeAction.HOLD).toBe('HOLD');
      expect(TradeAction.CLOSE).toBe('CLOSE');
    });
  });

  describe('OrderType enum', () => {
    test('should have all expected values', () => {
      expect(OrderType.MARKET).toBe('MARKET');
      expect(OrderType.LIMIT).toBe('LIMIT');
      expect(OrderType.STOP_MARKET).toBe('STOP_MARKET');
      expect(OrderType.STOP_LIMIT).toBe('STOP_LIMIT');
    });
  });

  describe('OrderStatus enum', () => {
    test('should have all expected values', () => {
      expect(OrderStatus.PENDING).toBe('PENDING');
      expect(OrderStatus.OPEN).toBe('OPEN');
      expect(OrderStatus.FILLED).toBe('FILLED');
      expect(OrderStatus.PARTIALLY_FILLED).toBe('PARTIALLY_FILLED');
      expect(OrderStatus.CANCELLED).toBe('CANCELLED');
      expect(OrderStatus.FAILED).toBe('FAILED');
      expect(OrderStatus.EXPIRED).toBe('EXPIRED');
    });
  });

  describe('SignalStatus enum', () => {
    test('should have all expected values', () => {
      expect(SignalStatus.PENDING).toBe('PENDING');
      expect(SignalStatus.ACTIVE).toBe('ACTIVE');
      expect(SignalStatus.EXECUTED).toBe('EXECUTED');
      expect(SignalStatus.CANCELLED).toBe('CANCELLED');
      expect(SignalStatus.EXPIRED).toBe('EXPIRED');
    });
  });

  describe('RiskLevel enum', () => {
    test('should have all expected values', () => {
      expect(RiskLevel.CONSERVATIVE).toBe('CONSERVATIVE');
      expect(RiskLevel.MODERATE).toBe('MODERATE');
      expect(RiskLevel.AGGRESSIVE).toBe('AGGRESSIVE');
    });
  });

  describe('SentimentLabel enum', () => {
    test('should have all expected values', () => {
      expect(SentimentLabel.VERY_BEARISH).toBe('VERY_BEARISH');
      expect(SentimentLabel.BEARISH).toBe('BEARISH');
      expect(SentimentLabel.NEUTRAL).toBe('NEUTRAL');
      expect(SentimentLabel.BULLISH).toBe('BULLISH');
      expect(SentimentLabel.VERY_BULLISH).toBe('VERY_BULLISH');
    });
  });

  describe('TimeFrame enum', () => {
    test('should have all expected values', () => {
      expect(TimeFrame.ONE_MINUTE).toBe('1m');
      expect(TimeFrame.FIVE_MINUTES).toBe('5m');
      expect(TimeFrame.FIFTEEN_MINUTES).toBe('15m');
      expect(TimeFrame.ONE_HOUR).toBe('1h');
      expect(TimeFrame.FOUR_HOURS).toBe('4h');
      expect(TimeFrame.ONE_DAY).toBe('1d');
      expect(TimeFrame.ONE_WEEK).toBe('1w');
    });
  });

  describe('NewsSource enum', () => {
    test('should have all expected values', () => {
      expect(NewsSource.CRYPTOPANIC).toBe('CryptoPanic');
      expect(NewsSource.COINGECKO).toBe('CoinGecko');
      expect(NewsSource.CRYPTOCOMPARE).toBe('CryptoCompare');
    });
  });
});
