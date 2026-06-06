/**
 * Demo Trading API Routes for Mantle AI Trading Bot
 */

import { NextRequest, NextResponse } from 'next/server';
import { demoTrader } from '@/lib/trading/demo/demo-trader';
import { TradeAction, OrderType } from '@/lib/trading/core/types';

// GET /api/trading/demo/portfolio - Get portfolio
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'portfolio':
        return NextResponse.json({ 
          success: true, 
          data: demoTrader.getPortfolio() 
        });

      case 'positions':
        return NextResponse.json({ 
          success: true, 
          data: demoTrader.getPositions() 
        });

      case 'orders':
        return NextResponse.json({ 
          success: true, 
          data: demoTrader.getOpenOrders() 
        });

      case 'history':
        return NextResponse.json({ 
          success: true, 
          data: demoTrader.getTradeHistory() 
        });

      case 'statistics':
        return NextResponse.json({ 
          success: true, 
          data: demoTrader.getStatistics() 
        });

      default:
        return NextResponse.json({
          success: true,
          data: {
            portfolio: demoTrader.getPortfolio(),
            positions: demoTrader.getPositions(),
            orders: demoTrader.getOpenOrders(),
            statistics: demoTrader.getStatistics()
          }
        });
    }
  } catch (error) {
    console.error('Error getting demo data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get demo data' },
      { status: 500 }
    );
  }
}

// POST /api/trading/demo - Execute demo trading actions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'place_order': {
        const order = demoTrader.placeOrder({
          symbol: params.symbol,
          side: params.side as TradeAction,
          type: params.type as OrderType,
          quantity: params.quantity,
          price: params.price,
          leverage: params.leverage,
          stopLoss: params.stopLoss,
          takeProfit: params.takeProfit
        });
        return NextResponse.json({ success: true, data: order });
      }

      case 'close_position': {
        const order = demoTrader.closePosition(params.symbol, params.quantity);
        if (!order) {
          return NextResponse.json(
            { success: false, error: 'Position not found' },
            { status: 404 }
          );
        }
        return NextResponse.json({ success: true, data: order });
      }

      case 'cancel_order': {
        const cancelled = demoTrader.cancelOrder(params.orderId);
        return NextResponse.json({ success: cancelled });
      }

      case 'reset': {
        demoTrader.reset(params.initialCapital || 10000);
        return NextResponse.json({ 
          success: true, 
          data: demoTrader.getPortfolio() 
        });
      }

      case 'update_price': {
        demoTrader.updatePrice(params.symbol, params.price);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error executing demo action:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
