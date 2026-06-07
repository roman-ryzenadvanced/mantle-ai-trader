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

    // Validate strategies
    const invalidStrategies = strategies.filter(s => !validStrategies.includes(s as StrategyType));
    if (invalidStrategies.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid strategies: ${invalidStrategies.join(', ')}` },
        { status: 400 }
      );
    }

    // Fetch news (shared across all pairs)
    const news = await newsAggregator.fetchAllNews({ limit: 20 });

    // Run technical scan (all strategy+symbol combos)
    const techResults = await signalEngine.scanPairs(
      symbols,
      strategies.map(s => s as StrategyType),
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
        strategiesUsed: strategies.length,
        totalCombos: symbols.length * strategies.length,
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
