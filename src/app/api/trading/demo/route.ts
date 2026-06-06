/**
 * Demo Trading API Routes for Mantle AI Trading Bot
 * v3.0.0 - Added zod validation, trailing stop, partial close, margin call endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { demoTrader } from '@/lib/trading/demo/demo-trader';
import { TradeAction, OrderType } from '@/lib/trading/core/types';

// ==================== ZOD SCHEMAS ====================

const placeOrderSchema = z.object({
  action: z.literal('place_order'),
  symbol: z.string().min(1, 'Symbol is required'),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT']),
  quantity: z.number().positive('Quantity must be positive'),
  price: z.number().positive().optional(),
  leverage: z.number().min(1).max(100).optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
});

const closePositionSchema = z.object({
  action: z.literal('close_position'),
  symbol: z.string().min(1, 'Symbol is required'),
  quantity: z.number().positive().optional(),
});

const closePositionPartialSchema = z.object({
  action: z.literal('close_position_partial'),
  symbol: z.string().min(1, 'Symbol is required'),
  percent: z.number().min(1).max(100, 'Percent must be 1-100'),
});

const setTrailingStopSchema = z.object({
  action: z.literal('set_trailing_stop'),
  symbol: z.string().min(1, 'Symbol is required'),
  distance: z.number().positive('Distance must be positive'),
});

const averagePositionSchema = z.object({
  action: z.literal('average_position'),
  symbol: z.string().min(1, 'Symbol is required'),
  quantity: z.number().positive('Quantity must be positive'),
  orderType: z.enum(['MARKET', 'LIMIT']).default('MARKET'),
});

const cancelOrderSchema = z.object({
  action: z.literal('cancel_order'),
  orderId: z.string().min(1, 'Order ID is required'),
});

const resetSchema = z.object({
  action: z.literal('reset'),
  initialCapital: z.number().positive().default(10000),
});

const updatePriceSchema = z.object({
  action: z.literal('update_price'),
  symbol: z.string().min(1, 'Symbol is required'),
  price: z.number().positive('Price must be positive'),
});

const setMarginCallSchema = z.object({
  action: z.literal('set_margin_call_threshold'),
  threshold: z.number().min(0.01).max(1, 'Threshold must be between 0.01 and 1'),
});

const demoActionSchema = z.discriminatedUnion('action', [
  placeOrderSchema,
  closePositionSchema,
  closePositionPartialSchema,
  setTrailingStopSchema,
  averagePositionSchema,
  cancelOrderSchema,
  resetSchema,
  updatePriceSchema,
  setMarginCallSchema,
]);

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
          data: {
            ...demoTrader.getStatistics(),
            totalFees: demoTrader.getTotalFees(),
            realizedTrades: demoTrader.getRealizedTrades()
          }
        });

      case 'realized_trades':
        return NextResponse.json({ 
          success: true, 
          data: demoTrader.getRealizedTrades() 
        });

      default:
        return NextResponse.json({
          success: true,
          data: {
            portfolio: demoTrader.getPortfolio(),
            positions: demoTrader.getPositions(),
            orders: demoTrader.getOpenOrders(),
            statistics: {
              ...demoTrader.getStatistics(),
              totalFees: demoTrader.getTotalFees()
            }
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
    
    const validation = demoActionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const validatedData = validation.data;

    switch (validatedData.action) {
      case 'place_order': {
        const order = demoTrader.placeOrder({
          symbol: validatedData.symbol,
          side: validatedData.side as TradeAction,
          type: validatedData.type as OrderType,
          quantity: validatedData.quantity,
          price: validatedData.price,
          leverage: validatedData.leverage,
          stopLoss: validatedData.stopLoss,
          takeProfit: validatedData.takeProfit
        });
        return NextResponse.json({ success: true, data: order });
      }

      case 'close_position': {
        const order = demoTrader.closePosition(validatedData.symbol, validatedData.quantity);
        if (!order) {
          return NextResponse.json(
            { success: false, error: 'Position not found' },
            { status: 404 }
          );
        }
        return NextResponse.json({ success: true, data: order });
      }

      case 'close_position_partial': {
        const order = demoTrader.closePositionPartial(validatedData.symbol, validatedData.percent);
        if (!order) {
          return NextResponse.json(
            { success: false, error: 'Position not found' },
            { status: 404 }
          );
        }
        return NextResponse.json({ success: true, data: order });
      }

      case 'set_trailing_stop': {
        const result = demoTrader.setTrailingStop(validatedData.symbol, validatedData.distance);
        if (!result) {
          return NextResponse.json(
            { success: false, error: 'Position not found or invalid distance' },
            { status: 404 }
          );
        }
        return NextResponse.json({ success: true, data: { symbol: validatedData.symbol, trailingStopDistance: validatedData.distance } });
      }

      case 'average_position': {
        const order = demoTrader.averagePosition(validatedData.symbol, validatedData.quantity, validatedData.orderType as OrderType);
        if (!order) {
          return NextResponse.json(
            { success: false, error: 'Position not found' },
            { status: 404 }
          );
        }
        return NextResponse.json({ success: true, data: order });
      }

      case 'cancel_order': {
        const cancelled = demoTrader.cancelOrder(validatedData.orderId);
        return NextResponse.json({ success: cancelled });
      }

      case 'reset': {
        demoTrader.reset(validatedData.initialCapital);
        return NextResponse.json({ 
          success: true, 
          data: demoTrader.getPortfolio() 
        });
      }

      case 'update_price': {
        demoTrader.updatePrice(validatedData.symbol, validatedData.price);
        // Also check for margin calls after price update
        // QA-FIX #10: checkMarginCall now returns an object {isMarginCall, closedSymbols}
        const marginResult = demoTrader.checkMarginCall();
        return NextResponse.json({ success: true, data: { marginCalls: marginResult.closedSymbols, isMarginCall: marginResult.isMarginCall } });
      }

      case 'set_margin_call_threshold': {
        demoTrader.setMarginCallThreshold(validatedData.threshold);
        return NextResponse.json({ success: true, data: { threshold: validatedData.threshold } });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    // QA-FIX #11: Don't expose internal error details to client - could leak implementation info
    console.error('Error executing demo action:', error);
    return NextResponse.json(
      { success: false, error: 'An internal error occurred while executing the demo action' },
      { status: 500 }
    );
  }
}
