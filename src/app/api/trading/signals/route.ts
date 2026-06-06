/**
 * Trading Signals API Routes for Mantle AI Trading Bot
 * v3.0.0 - Added zod validation, signal quality scoring, multi-timeframe support
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { signalEngine } from '@/lib/trading/signals/signal-engine';
import { newsAggregator } from '@/lib/trading/news/news-aggregator';
import { TimeFrame } from '@/lib/trading/core/types';
import { db } from '@/lib/db';

// ==================== ZOD SCHEMAS ====================

const validSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT'];
const validTimeframes = Object.values(TimeFrame);

const getSignalsSchema = z.object({
  symbol: z.string().optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'EXECUTED', 'CANCELLED', 'EXPIRED']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const generateSignalSchema = z.object({
  symbol: z.string().refine(
    (val): val is string => validSymbols.includes(val),
    { message: `Symbol must be one of: ${validSymbols.join(', ')}` }
  ),
  timeframe: z.string().refine(
    (val): val is string => validTimeframes.includes(val as TimeFrame),
    { message: `Timeframe must be one of: ${validTimeframes.join(', ')}` }
  ).default(TimeFrame.ONE_HOUR),
  demo: z.boolean().default(true),
});

// GET /api/trading/signals - Get signals
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    
    const validation = getSignalsSchema.safeParse(params);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { symbol, status, limit } = validation.data;

    const where: Record<string, unknown> = {};
    if (symbol) where.symbol = symbol;
    if (status) where.status = status;

    const signals = await db.signal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return NextResponse.json({ success: true, data: signals });
  } catch (error) {
    console.error('Error fetching signals:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch signals' },
      { status: 500 }
    );
  }
}

// POST /api/trading/signals - Generate new signal
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const validation = generateSignalSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { symbol, timeframe, demo } = validation.data;

    // Generate simulated market data (in production, fetch from Bybit)
    const marketData = generateDemoMarketData(symbol, 200);
    
    // Fetch news for the symbol
    const news = await newsAggregator.getNewsForSymbol(symbol, 10);

    // Generate signal
    const signalOutput = await signalEngine.generateSignal({
      symbol,
      timeframe: timeframe as TimeFrame,
      marketData,
      newsArticles: news
    });

    // Calculate signal quality score
    const qualityScore = signalEngine.calculateSignalQualityScore(
      signalOutput.analysis.technicalAnalysis,
      signalOutput.analysis.sentimentAnalysis,
      signalOutput.signal.action
    );

    // Save signal to database
    const savedSignal = await db.signal.create({
      data: {
        symbol: signalOutput.signal.symbol,
        action: signalOutput.signal.action,
        confidence: signalOutput.signal.confidence,
        rating: qualityScore,
        priceTarget: signalOutput.signal.priceTarget,
        stopLoss: signalOutput.signal.stopLoss,
        takeProfit: signalOutput.signal.takeProfit,
        reasoning: signalOutput.signal.reasoning,
        newsSources: (signalOutput.signal.newsSources || []).join(','),
        sentimentScore: signalOutput.signal.sentimentScore,
        technicalScore: signalOutput.signal.technicalScore,
        fundamentalScore: signalOutput.signal.fundamentalScore,
        status: 'PENDING',
        demo
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        signal: savedSignal,
        analysis: signalOutput.analysis,
        riskAssessment: signalOutput.riskAssessment,
        qualityScore
      }
    });
  } catch (error) {
    console.error('Error generating signal:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate signal' },
      { status: 500 }
    );
  }
}

// Helper function to generate demo market data
function generateDemoMarketData(symbol: string, count: number) {
  const prices: Record<string, number> = {
    BTCUSDT: 45000,
    ETHUSDT: 2500,
    SOLUSDT: 100,
    BNBUSDT: 300,
    XRPUSDT: 0.5
  };

  const data = [];
  let price = prices[symbol] || 100;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  for (let i = count; i >= 0; i--) {
    const change = (Math.random() - 0.5) * price * 0.02;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * Math.abs(change) * 0.5;
    const low = Math.min(open, close) - Math.random() * Math.abs(change) * 0.5;
    const volume = 1000 + Math.random() * 5000;

    data.push({
      symbol,
      timeframe: TimeFrame.ONE_HOUR,
      timestamp: new Date(now - i * hourMs),
      open,
      high,
      low,
      close,
      volume
    });

    price = close;
  }

  return data;
}
