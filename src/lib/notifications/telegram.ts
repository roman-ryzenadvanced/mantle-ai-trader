/**
 * Telegram Bot Notification Service for Mantle AI Trader
 * Pure TypeScript implementation using fetch for HTTP requests.
 */

// ==================== TYPES ====================

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

export interface TelegramNotification {
  type: 'TRADE' | 'SIGNAL' | 'RISK_WARNING' | 'ERROR' | 'PnL_UPDATE';
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

// ==================== CONSTANTS ====================

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

const TYPE_EMOJIS: Record<TelegramNotification['type'], string> = {
  TRADE: '\u{1F4B0}',
  SIGNAL: '\u{1F3AF}',
  RISK_WARNING: '\u26A0\uFE0F',
  ERROR: '\u274C',
  PnL_UPDATE: '\u{1F4CA}',
};

// ==================== HELPERS ====================

function formatTimestamp(): string {
  return new Date().toISOString();
}

function buildMarkdownMessage(notification: TelegramNotification): string {
  const emoji = TYPE_EMOJIS[notification.type];
  const lines: string[] = [];

  // Header
  lines.push(`*${emoji} ${notification.title}*`);
  lines.push('');

  // Body
  lines.push(notification.message);

  // Optional data
  if (notification.data) {
    lines.push('');
    for (const [key, value] of Object.entries(notification.data)) {
      lines.push(`\`${key}\`: ${value}`);
    }
  }

  // Footer
  lines.push('');
  lines.push(`_${formatTimestamp()}_`);

  return lines.join('\n');
}

// ==================== CORE ====================

/**
 * Send a notification to Telegram.
 * Returns true on success, false on failure (never throws).
 */
export async function sendTelegramNotification(
  config: TelegramConfig,
  notification: TelegramNotification
): Promise<boolean> {
  if (!config.enabled) {
    return false;
  }

  try {
    const url = `${TELEGRAM_API_BASE}${config.botToken}/sendMessage`;
    const text = buildMarkdownMessage(notification);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Telegram API error (${response.status}): ${errorBody}`);
      return false;
    }

    const result = await response.json() as { ok: boolean; description?: string };
    return result.ok === true;
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
    return false;
  }
}

// ==================== FORMATTERS ====================

export interface TradeNotificationInput {
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  pnl?: number;
}

/**
 * Format a trade execution notification for Telegram.
 */
export function formatTradeNotification(trade: TradeNotificationInput): string {
  const lines: string[] = [];
  lines.push(`*Symbol:* ${trade.symbol}`);
  lines.push(`*Side:* ${trade.side}`);
  lines.push(`*Quantity:* ${trade.quantity}`);
  lines.push(`*Price:* ${trade.price.toFixed(2)}`);

  if (trade.pnl !== undefined) {
    const pnlSign = trade.pnl >= 0 ? '+' : '';
    lines.push(`*PnL:* ${pnlSign}${trade.pnl.toFixed(2)}`);
  }

  return lines.join('\n');
}

export interface RiskWarningInput {
  level: string;
  message: string;
  currentValue: number;
  limit: number;
}

/**
 * Format a risk warning notification for Telegram.
 */
export function formatRiskWarning(warning: RiskWarningInput): string {
  const lines: string[] = [];
  lines.push(`*Level:* ${warning.level}`);
  lines.push(`*Message:* ${warning.message}`);
  lines.push(`*Current:* ${warning.currentValue.toFixed(4)}`);
  lines.push(`*Limit:* ${warning.limit.toFixed(4)}`);

  const overBy = warning.currentValue - warning.limit;
  lines.push(`*Over by:* ${overBy.toFixed(4)}`);

  return lines.join('\n');
}

export interface PnLUpdateInput {
  daily: number;
  total: number;
  winRate: number;
  tradesToday: number;
}

/**
 * Format a P&L summary notification for Telegram.
 */
export function formatPnLUpdate(pnl: PnLUpdateInput): string {
  const dailySign = pnl.daily >= 0 ? '+' : '';
  const totalSign = pnl.total >= 0 ? '+' : '';

  const lines: string[] = [];
  lines.push(`*Daily PnL:* ${dailySign}${pnl.daily.toFixed(2)}`);
  lines.push(`*Total PnL:* ${totalSign}${pnl.total.toFixed(2)}`);
  lines.push(`*Win Rate:* ${(pnl.winRate * 100).toFixed(1)}%`);
  lines.push(`*Trades Today:* ${pnl.tradesToday}`);

  return lines.join('\n');
}

// ==================== CONNECTION TEST ====================

/**
 * Send a test message to verify Telegram bot connectivity.
 */
export async function testTelegramConnection(
  config: TelegramConfig
): Promise<{ success: boolean; error?: string }> {
  if (!config.enabled) {
    return { success: false, error: 'Telegram notifications are disabled' };
  }

  try {
    const url = `${TELEGRAM_API_BASE}${config.botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: '\u2705 Mantle AI Trader connected',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, error: `Telegram API returned ${response.status}: ${errorBody}` };
    }

    const result = await response.json() as { ok: boolean; description?: string };
    if (result.ok) {
      return { success: true };
    }

    return { success: false, error: result.description ?? 'Unknown Telegram API error' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reach Telegram API',
    };
  }
}
