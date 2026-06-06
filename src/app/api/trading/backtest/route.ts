/**
 * Backtest API Routes for Mantle AI Trading Bot
 */

import { NextRequest, NextResponse } from 'next/server';
import { backtestEngine } from '@/lib/trading/backtest/backtest-engine';
import { db } from '@/lib/db';

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
    const {
      name,
      symbol,
      startDate,
      endDate,
      initialCapital = 10000,
      riskPerTrade = 0.02,
      fees = 0.001,
      slippage = 0.001
    } = body;

    if (!symbol || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Symbol, startDate, and endDate are required' },
        { status: 400 }
      );
    }

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
          closedAt: trade.closedAt,
          notes: trade.notes
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
