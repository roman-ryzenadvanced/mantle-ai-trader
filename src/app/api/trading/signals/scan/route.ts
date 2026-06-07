/**
 * Active Scan API Route
 * Scans multiple pairs with multiple strategies in parallel
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { signalEngine } from '@/lib/trading/signals/signal-engine';
import { newsAggregator } from '@/lib/trading/news/news-aggregator';
import { TimeFrame, StrategyType } from '@/lib/trading/core/types';

const validSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT'];
const validStrategies = Object.values(StrategyType);

// Map common indicator/strategy names to our StrategyType enum
const strategyAliases: Record<string, StrategyType> = {
  // Exact matches (case-insensitive handled below)
  rsi: StrategyType.MOMENTUM,
  macd: StrategyType.MOMENTUM,
  bollinger: StrategyType.BREAKOUT,
  bb: StrategyType.BREAKOUT,
  breakout: StrategyType.BREAKOUT,
  momentum: StrategyType.MOMENTUM,
  mean_reversion: StrategyType.MEAN_REVERSION,
  meanreversion: StrategyType.MEAN_REVERSION,
  vwap: StrategyType.VWAP_TWAP,
  twap: StrategyType.VWAP_TWAP,
  default: StrategyType.DEFAULT,
  balanced: StrategyType.DEFAULT,
};

const scanSchema = z.object({
  symbols: z.array(z.string()).min(1).max(9).default(
    ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']
  ),
  strategies: z.array(z.string()).min(1).max(5).default(
    [StrategyType.DEFAULT, StrategyType.MOMENTUM, StrategyType.BREAKOUT]
  ),
  timeframe: z.string().default(TimeFrame.ONE_HOUR),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = scanSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { symbols, strategies, timeframe } = validation.data;

    // Validate symbols
    const invalidSymbols = symbols.filter(s => !validSymbols.includes(s));
    if (invalidSymbols.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid symbols: ${invalidSymbols.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate strategies (resolve aliases to canonical StrategyType)
    const resolvedStrategies: StrategyType[] = strategies.map(s => {
      const upper = s.toUpperCase();
      if (validStrategies.includes(upper as StrategyType)) return upper as StrategyType;
      const aliased = strategyAliases[s.toLowerCase()];
      if (aliased) return aliased;
      return null;
    }).filter((s): s is StrategyType => s !== null);

    if (resolvedStrategies.length === 0) {
      const validNames = [...validStrategies, ...Object.keys(strategyAliases)].join(', ');
      return NextResponse.json(
        { success: false, error: `No valid strategies. Try: ${validNames}` },
        { status: 400 }
      );
    }
    const news = await newsAggregator.fetchAllNews({ limit: 20 });

    // Run technical scan (all strategy+symbol combos)
    const techResults = await signalEngine.scanPairs(
      symbols,
      resolvedStrategies,
      timeframe as TimeFrame,
      news
    );

    // Also generate news-based signals
    const newsResults = await signalEngine.generateNewsSignals(symbols, news);

    // Combine both: technical + news signals
    const allResults = [...techResults, ...newsResults];

    return NextResponse.json({
      success: true,
      data: allResults,
      meta: {
        symbolsScanned: symbols.length,
        strategiesUsed: resolvedStrategies.length,
        totalCombos: symbols.length * resolvedStrategies.length,
        technicalSignals: techResults.length,
        newsSignals: newsResults.length,
        actionableSignals: allResults.length,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('Error in active scan:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to complete scan' },
      { status: 500 }
    );
  }
}
