import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createBybitClient } from '@/lib/trading/core/trading-engine';
import { RiskLevel } from '@/lib/trading/core/types';
import { z } from 'zod';
import { getAuthUser, handleAuthError } from '@/lib/api-auth';
import { encrypt, decrypt } from '@/lib/crypto';

const saveAccountSchema = z.object({
  action: z.literal('save'),
  id: z.string().optional(),
  name: z.string().min(1).max(50),
  exchange: z.string().default('bybit'),
  apiKey: z.string().min(1, 'API Key is required'),
  apiSecret: z.string().min(1, 'API Secret is required'),
  testnet: z.boolean().default(true),
});

const testConnectionSchema = z.object({
  action: z.literal('test_connection'),
  id: z.string().min(1, 'Account ID is required'),
});

const deleteAccountSchema = z.object({
  action: z.literal('delete'),
  id: z.string().min(1, 'Account ID is required'),
});

const activateAccountSchema = z.object({
  action: z.literal('activate'),
  id: z.string().min(1, 'Account ID is required'),
});

const settingsActionSchema = z.discriminatedUnion('action', [
  saveAccountSchema,
  testConnectionSchema,
  deleteAccountSchema,
  activateAccountSchema,
]);

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

// GET /api/trading/settings — list all accounts
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);
    const accounts = await db.exchangeAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: accounts.map(a => {
        let apiKey: string;
        let apiSecret: string;
        try {
          apiKey = decrypt(a.apiKey, userId);
          apiSecret = decrypt(a.apiSecret, userId);
        } catch {
          // Skip accounts with undecryptable credentials (corrupt/null keys)
          return null;
        }
        return {
          id: a.id,
          name: a.name,
          exchange: a.exchange,
          apiKey: maskKey(apiKey),
          apiSecret: maskKey(apiSecret),
          testnet: a.testnet,
          isActive: a.isActive,
          lastTested: a.lastTested,
          lastError: a.lastError,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        };
      }).filter(Boolean),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return handleAuthError(error);
    }
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    console.error('Error fetching settings:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// POST /api/trading/settings — save/test/delete/activate account
export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);
    const body = await request.json();
    const validation = settingsActionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const data = validation.data;

    switch (data.action) {
      case 'save': {
        // Upsert: if id provided, update; else create new
        if (data.id) {
          const existing = await db.exchangeAccount.findUnique({ where: { id: data.id } });
          if (!existing) {
            return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
          }
          const updated = await db.exchangeAccount.update({
            where: { id: data.id },
            data: {
              name: data.name,
              exchange: data.exchange,
              apiKey: encrypt(data.apiKey, userId),
              apiSecret: encrypt(data.apiSecret, userId),
              testnet: data.testnet,
            },
          });
          return NextResponse.json({ success: true, data: { id: updated.id, maskedKey: maskKey(updated.apiKey) } });
        } else {
          const created = await db.exchangeAccount.create({
            data: {
              name: data.name,
              exchange: data.exchange,
              apiKey: encrypt(data.apiKey, userId),
              apiSecret: encrypt(data.apiSecret, userId),
              testnet: data.testnet,
              userId,
            },
          });
          return NextResponse.json({ success: true, data: { id: created.id, maskedKey: maskKey(created.apiKey) } });
        }
      }

      case 'test_connection': {
        const account = await db.exchangeAccount.findUnique({ where: { id: data.id } });
        if (!account) {
          return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
        }

        const apiKey = decrypt(account.apiKey, userId);
        const apiSecret = decrypt(account.apiSecret, userId);

        try {
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

          const balance = await client.getWalletBalance();
          if (!balance) {
            const error = 'Connection succeeded but could not retrieve balance. Check API key permissions.';
            await db.exchangeAccount.update({
              where: { id: data.id },
              data: { lastTested: new Date(), lastError: error },
            });
            return NextResponse.json({ success: false, error });
          }

          await db.exchangeAccount.update({
            where: { id: data.id },
            data: { lastTested: new Date(), lastError: null },
          });

          return NextResponse.json({
            success: true,
            data: {
              totalEquity: balance.totalEquity,
              availableBalance: balance.totalAvailableBalance,
              coinCount: balance.coins?.length || 0,
              testnet: account.testnet,
            },
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Connection failed';
          await db.exchangeAccount.update({
            where: { id: data.id },
            data: { lastTested: new Date(), lastError: msg },
          });
          return NextResponse.json({ success: false, error: msg });
        }
      }

      case 'delete': {
        const existing = await db.exchangeAccount.findUnique({ where: { id: data.id } });
        if (!existing) {
          return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
        }
        await db.exchangeAccount.delete({ where: { id: data.id } });
        return NextResponse.json({ success: true });
      }

      case 'activate': {
        // Deactivate all user's accounts, then activate the chosen one
        await db.exchangeAccount.updateMany({ where: { userId }, data: { isActive: false } });
        await db.exchangeAccount.update({
          where: { id: data.id },
          data: { isActive: true },
        });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return handleAuthError(error);
    }
    console.error('Error in settings:', error);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
