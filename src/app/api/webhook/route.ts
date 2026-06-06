/**
 * Webhook API Route for Mantle AI Trader
 * External trigger endpoint for actions like signal scans, risk checks, and status queries.
 *
 * POST /api/webhook/trigger
 * Auth: Bearer token from WEBHOOK_SECRET env var (skipped if not set)
 */

import { NextRequest, NextResponse } from 'next/server';

// ==================== TYPES ====================

interface WebhookRequestBody {
  action: string;
  symbol?: string;
  params?: Record<string, unknown>;
}

interface WebhookResponse {
  success: boolean;
  message: string;
  data?: unknown;
}

// ==================== UPTIME ====================

const startTime = Date.now();

// ==================== AUTH ====================

/**
 * Verify the Bearer token against WEBHOOK_SECRET.
 * Returns true if auth passes or if no secret is configured.
 */
function verifyAuth(request: NextRequest): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    return true;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  return token === secret;
}

// ==================== ACTION HANDLERS ====================

function handleScan(_body: WebhookRequestBody): WebhookResponse {
  return {
    success: true,
    message: 'Scan triggered',
    data: {
      action: 'scan',
      symbol: _body.symbol ?? null,
      timestamp: new Date().toISOString(),
    },
  };
}

function handleRiskCheck(_body: WebhookRequestBody): WebhookResponse {
  return {
    success: true,
    message: 'Risk check triggered',
    data: {
      action: 'risk_check',
      symbol: _body.symbol ?? null,
      timestamp: new Date().toISOString(),
    },
  };
}

function handleStatus(): WebhookResponse {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  return {
    success: true,
    message: 'System status retrieved',
    data: {
      status: 'operational',
      uptime: uptimeSeconds,
      uptimeFormatted: formatUptime(uptimeSeconds),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? 'development',
    },
  };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

// ==================== ROUTE HANDLER ====================

export async function POST(request: NextRequest): Promise<NextResponse<WebhookResponse>> {
  // Auth check
  if (!verifyAuth(request)) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized: invalid or missing Bearer token' },
      { status: 401 }
    );
  }

  // Parse body
  let body: WebhookRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid request body: expected JSON' },
      { status: 400 }
    );
  }

  // Validate action
  if (!body.action || typeof body.action !== 'string') {
    return NextResponse.json(
      { success: false, message: 'Missing required field: action' },
      { status: 400 }
    );
  }

  // Route to action handler
  switch (body.action) {
    case 'scan':
      return NextResponse.json(handleScan(body));

    case 'risk_check':
      return NextResponse.json(handleRiskCheck(body));

    case 'status':
      return NextResponse.json(handleStatus());

    default:
      return NextResponse.json(
        {
          success: false,
          message: `Unknown action: "${body.action}". Supported actions: scan, risk_check, status`,
        },
        { status: 400 }
      );
  }
}
