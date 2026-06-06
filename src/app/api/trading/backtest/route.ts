/**
 * Backtest API Routes for Mantle AI Trading Bot
 * v3.0.0 - Added zod validation for date ranges and parameters
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { backtestEngine } from '@/lib/trading/backtest/backtest-engine';
import { db } from '@/lib/db';

// ==================== ZOD SCHEMAS ====================

const runBacktestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
  symbol: z.string().min(1, 'Symbol is required'),
  startDate: z.string().datetime({ message: 'startDate must be a valid ISO date' }).or(z.date()),
  endDate: z.string().datetime({ message: 'endDate must be a valid ISO date' }).or(z.date()),
  initialCapital: z.number().positive().default(10000),
  riskPerTrade: z.number().min(0.001).max(0.1, 'Risk per trade must be 0.1-10%').default(0.02),
  fees: z.number().min(0).max(0.01, 'Fees must be 0-1%').default(0.001),
  slippage: z.number().min(0).max(0.01, 'Slippage must be 0-1%').default(0.001),
}).refine(
  (data) => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    return end > start;
  },
  { message: 'endDate must be after startDate' }
).refine(
  (data) => {
    const start = new Date(data.startDate);
    const maxPast = new Date();
    maxPast.setFullYear(maxPast.getFullYear() - 5);
    return start >= maxPast;
  },
  { message: 'startDate cannot be more than 5 years ago' }
).refine(
  (data) => {
    const end = new Date(data.endDate);
    return end <= new Date();
  },
  { message: 'endDate cannot be in the future' }
);

// GET /api/trading/backtest - Get backtest sessions
export async function GET(request: NextRequest) {
  try {
    const sessions = await db.backtestSession.findMany({
      orderBy: { createdAt: 'desc' },
      include: { results: true }
    });

    return NextResponse.json({ success: true, data: sessions });
  } catch (error) {
    console.error('Error fetching backtest sessions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch backtest sessions' },
      { status: 500 }
    );
  }
}

// POST /api/trading/backtest - Run backtest
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const validation = runBacktestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { name, symbol, startDate, endDate, initialCapital, riskPerTrade, fees, slippage } = validation.data;

    // Create session record
    const session = await db.backtestSession.create({
      data: {
        name: name || `Backtest ${symbol}`,
        symbol,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        initialCapital,
        status: 'RUNNING'
      }
    });

    // Run backtest asynchronously
    const result = await backtestEngine.runBacktest({
      name: session.name,
      symbol,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      initialCapital,
      strategy: 'default',
      parameters: { riskPerTrade },
      fees,
      slippage
    });

    // Update session with results
    const updatedSession = await db.backtestSession.update({
      where: { id: session.id },
      data: {
        status: result.status,
        finalCapital: result.finalCapital,
        totalTrades: result.totalTrades,
        winRate: result.winRate,
        maxDrawdown: result.maxDrawdown,
        sharpeRatio: result.sharpeRatio
      }
    });

    // Save results
    for (const trade of result.results) {
      await db.backtestResult.create({
        data: {
          sessionId: session.id,
          symbol: trade.symbol,
          action: trade.action,
          entryPrice: trade.entryPrice,
          exitPrice: trade.exitPrice,
          quantity: trade.quantity,
          pnl: trade.pnl,
          pnlPercent: trade.pnlPercent,
          executedAt: trade.executedAt,
          closedAt: trade.closedAt
        }
      });
    }

    // Generate report
    const report = backtestEngine.generateReport(result);

    return NextResponse.json({
      success: true,
      data: {
        session: updatedSession,
        results: result,
        report
      }
    });
  } catch (error) {
    console.error('Error running backtest:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to run backtest' },
      { status: 500 }
    );
  }
}
