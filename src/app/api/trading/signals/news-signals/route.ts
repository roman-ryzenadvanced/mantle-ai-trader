/**
 * News Signals API Route
 * Generates trading signals from recent breaking/high-impact news
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { signalEngine } from '@/lib/trading/signals/signal-engine';
import { newsAggregator } from '@/lib/trading/news/news-aggregator';

const validSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT'];

const newsSignalsSchema = z.object({
  symbols: z.array(z.string()).min(1).max(9).default(
    ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']
  ),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = newsSignalsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { symbols } = validation.data;

    // Validate symbols
    const invalidSymbols = symbols.filter(s => !validSymbols.includes(s));
    if (invalidSymbols.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid symbols: ${invalidSymbols.join(', ')}` },
        { status: 400 }
      );
    }

    // Fetch recent news (including breaking)
    const [allNews, breakingNews] = await Promise.all([
      newsAggregator.fetchAllNews({ limit: 30 }),
      newsAggregator.getBreakingNews(10),
    ]);

    // Combine and deduplicate
    const seen = new Set<string>();
    const combined = [...breakingNews, ...allNews].filter(a => {
      const key = a.sourceUrl || a.title || a.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Generate news-based signals
    const signals = await signalEngine.generateNewsSignals(symbols, combined);

    return NextResponse.json({
      success: true,
      data: signals,
      meta: {
        symbolsScanned: symbols.length,
        articlesAnalyzed: combined.length,
        newsSignalsGenerated: signals.length,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('Error generating news signals:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate news signals' },
      { status: 500 }
    );
  }
}
