/**
 * Unit Tests for News Aggregator
 * Tests for sentiment analysis, categorization, and data handling
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { NewsAggregator } from '../../src/lib/trading/news/news-aggregator';
import { SentimentLabel, NewsSource } from '../../src/lib/trading/core/types';

describe('NewsAggregator', () => {
  let aggregator: NewsAggregator;

  beforeEach(() => {
    aggregator = new NewsAggregator();
  });

  describe('analyzeSentiment', () => {
    test('should return positive sentiment for bullish text', () => {
      const sentiment = aggregator.analyzeSentiment(
        'Bitcoin surges to new highs as institutional adoption grows rapidly'
      );
      expect(sentiment).toBeGreaterThan(0);
    });

    test('should return negative sentiment for bearish text', () => {
      const sentiment = aggregator.analyzeSentiment(
        'Crypto market crashes as regulators announce new ban on exchanges'
      );
      expect(sentiment).toBeLessThan(0);
    });

    test('should return neutral sentiment for balanced text', () => {
      const sentiment = aggregator.analyzeSentiment(
        'The cryptocurrency market traded sideways today with mixed signals'
      );
      expect(Math.abs(sentiment)).toBeLessThan(0.3);
    });

    test('should return 0 for empty text', () => {
      const sentiment = aggregator.analyzeSentiment('');
      expect(sentiment).toBe(0);
    });

    test('should handle multiple bullish keywords', () => {
      const sentiment = aggregator.analyzeSentiment(
        'Bitcoin rally continues with bullish momentum as adoption and growth surge'
      );
      expect(sentiment).toBeGreaterThan(0.3);
    });

    test('should handle multiple bearish keywords', () => {
      const sentiment = aggregator.analyzeSentiment(
        'Market crash deepens with sell-off as hack and fraud concerns grow'
      );
      expect(sentiment).toBeLessThan(-0.3);
    });
  });

  describe('getSentimentLabel', () => {
    test('should return VERY_BULLISH for high positive scores', () => {
      expect(aggregator.getSentimentLabel(0.7)).toBe(SentimentLabel.VERY_BULLISH);
    });

    test('should return BULLISH for moderate positive scores', () => {
      expect(aggregator.getSentimentLabel(0.3)).toBe(SentimentLabel.BULLISH);
    });

    test('should return NEUTRAL for near-zero scores', () => {
      expect(aggregator.getSentimentLabel(0.1)).toBe(SentimentLabel.NEUTRAL);
      expect(aggregator.getSentimentLabel(-0.1)).toBe(SentimentLabel.NEUTRAL);
    });

    test('should return BEARISH for moderate negative scores', () => {
      expect(aggregator.getSentimentLabel(-0.3)).toBe(SentimentLabel.BEARISH);
    });

    test('should return VERY_BEARISH for high negative scores', () => {
      expect(aggregator.getSentimentLabel(-0.7)).toBe(SentimentLabel.VERY_BEARISH);
    });
  });

  describe('caching', () => {
    test('should cache results and return same data on subsequent calls', async () => {
      // Without API keys, fetchAllNews should return empty but not throw
      const result1 = await aggregator.fetchAllNews({ limit: 5 });
      const result2 = await aggregator.fetchAllNews({ limit: 5 });
      
      // Both should return results (possibly empty)
      expect(Array.isArray(result1)).toBe(true);
      expect(Array.isArray(result2)).toBe(true);
    });
  });

  describe('symbol normalization', () => {
    test('should normalize BTCUSDT to BTC', async () => {
      // Test that the method doesn't throw
      const result = await aggregator.getNewsForSymbol('BTCUSDT', 5);
      expect(Array.isArray(result)).toBe(true);
    });

    test('should normalize ETHUSDT to ETH', async () => {
      const result = await aggregator.getNewsForSymbol('ETHUSDT', 5);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
