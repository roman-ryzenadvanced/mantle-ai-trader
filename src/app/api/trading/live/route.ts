import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createBybitClient } from '@/lib/trading/core/trading-engine';
import { TradeAction, OrderType, RiskLevel } from '@/lib/trading/core/types';
import { z } from 'zod';
import { getAuthUser, handleAuthError, AuthError } from '@/lib/api-auth';
import { decrypt } from '@/lib/crypto';

// Helper: get the active exchange account for a user and create a BybitClient
async function getLiveClient(userId: string) {
  const account = await db.exchangeAccount.findFirst({ where: { isActive: true, userId } });
  if (!account) {
    throw new Error('No active exchange account configured. Go to Settings to add and activate an account.');
  }
  const apiKey = decrypt(account.apiKey, userId);
  const apiSecret = decrypt(account.apiSecret, userId);
  const client = createBybitClient({
    apiKey,
    apiSecret,
    testnet: account.testnet,
    riskLevel: RiskLevel.MODERATE,
    maxPositionSize: 1000,
    maxLeverage: 5,
    autoTrading: false,
    defaultStopLossPercent: 2,
    defaultTakeProfitPercent: 5,
  });
  return { client, account };
}

const placeOrderSchema = z.object({
  action: z.literal('place_order'),
  symbol: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['MARKET', 'LIMIT']).default('MARKET'),
  quantity: z.number().positive(),
  price: z.number().positive().optional(),
  leverage: z.number().min(1).max(100).optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
});

const closePositionSchema = z.object({
  action: z.literal('close_position'),
  symbol: z.string().min(1),
  side: z.enum(['LONG', 'SHORT']).optional(),
});

const liveActionSchema = z.discriminatedUnion('action', [placeOrderSchema, closePositionSchema]);

// GET /api/trading/live — fetch live data
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    let client: Awaited<ReturnType<typeof getLiveClient>>['client'];

    try {
      const result = await getLiveClient(userId);
      client = result.client;
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'No active account' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'balance': {
        const balance = await client.getWalletBalance();
        if (!balance) {
          return NextResponse.json({ success: false, error: 'Could not fetch balance' }, { status: 500 });
        }
        return NextResponse.json({ success: true, data: balance });
      }

      case 'positions': {
        const symbol = searchParams.get('symbol') || undefined;
        const positions = await client.getPositions(symbol);
        return NextResponse.json({ success: true, data: positions });
      }

      case 'tickers': {
        const symbolsParam = searchParams.get('symbols');
        const symbols = symbolsParam ? symbolsParam.split(',').filter(Boolean) : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
        const tickers = await client.getTickers(symbols);
        return NextResponse.json({ success: true, data: tickers });
      }

      default: {
        // Return everything
        const [balance, positions, tickers] = await Promise.all([
          client.getWalletBalance(),
          client.getPositions(),
          client.getTickers(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT']),
        ]);
        return NextResponse.json({
          success: true,
          data: { balance, positions, tickers },
        });
      }
    }
  } catch (error) {
    console.error('Live trading GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch live data' },
      { status: 500 }
    );
  }
}

// POST /api/trading/live — execute live actions
export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);
    const body = await request.json();
    const validation = liveActionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    let client: Awaited<ReturnType<typeof getLiveClient>>['client'];
    try {
      const result = await getLiveClient(userId);
      client = result.client;
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'No active account' },
        { status: 400 }
      );
    }

    const data = validation.data;

    switch (data.action) {
      case 'place_order': {
        const order = await client.placeOrder({
          symbol: data.symbol,
          side: data.side === 'BUY' ? TradeAction.BUY : TradeAction.SELL,
          orderType: data.type === 'LIMIT' ? OrderType.LIMIT : OrderType.MARKET,
          quantity: data.quantity,
          price: data.price,
          leverage: data.leverage,
          stopLoss: data.stopLoss,
          takeProfit: data.takeProfit,
        });

        if (!order) {
          return NextResponse.json({ success: false, error: 'Order failed — no response from exchange' }, { status: 500 });
        }
        return NextResponse.json({ success: true, data: order });
      }

      case 'close_position': {
        const order = await client.closePosition(data.symbol, data.side);
        if (!order) {
          return NextResponse.json({ success: false, error: 'Position not found or close failed' }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: order });
      }

      default:
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Live trading POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Trade execution failed' },
      { status: 500 }
    );
  }
}
