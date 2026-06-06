/**
 * Unit Tests for Bybit API Client
 * Comprehensive tests covering signature generation, request header construction,
 * order status mapping, ticker data parsing, and error handling
 *
 * All tests use mock responses - no actual API calls are made.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import crypto from 'crypto';
import {
  BybitTickerResponse,
  BybitKlineResponse,
  BybitOrderResponse,
  BybitPositionResponse,
  OrderStatus,
  TradeAction,
  OrderType,
  TimeFrame,
  Ticker,
  MarketDataPoint,
  Order,
  Position,
  TradingConfig
} from '../../src/lib/trading/core/types';

// ==================== HELPER: Bybit Client (for isolated testing) ====================

class BybitClientTestable {
  private apiKey: string;
  private apiSecret: string;
  private recvWindow: string = '5000';

  constructor(config: { apiKey: string; apiSecret: string }) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
  }

  /**
   * Generate signature for authenticated requests (mirrors actual implementation)
   */
  generateSignature(params: Record<string, unknown>, timestamp: number): string {
    const queryString = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    const signString = `${timestamp}${this.apiKey}${this.recvWindow}${queryString}`;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(signString)
      .digest('hex');
  }

  /**
   * Construct request headers
   */
  constructHeaders(timestamp: number, signature: string): Record<string, string> {
    return {
      'X-BAPI-API-KEY': this.apiKey,
      'X-BAPI-TIMESTAMP': timestamp.toString(),
      'X-BAPI-SIGN': signature,
      'X-BAPI-RECV-WINDOW': this.recvWindow,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Map Bybit order status to internal OrderStatus enum
   */
  mapOrderStatus(status: string): OrderStatus {
    const statusMap: Record<string, OrderStatus> = {
      'New': OrderStatus.OPEN,
      'PartiallyFilled': OrderStatus.PARTIALLY_FILLED,
      'Filled': OrderStatus.FILLED,
      'Cancelled': OrderStatus.CANCELLED,
      'Rejected': OrderStatus.FAILED,
      'Deactivated': OrderStatus.EXPIRED
    };
    return statusMap[status] || OrderStatus.PENDING;
  }

  /**
   * Parse Bybit ticker response to internal Ticker type
   */
  parseTicker(data: BybitTickerResponse): Ticker {
    return {
      symbol: data.symbol,
      lastPrice: parseFloat(data.lastPrice),
      bidPrice: parseFloat(data.bid1Price),
      askPrice: parseFloat(data.ask1Price),
      bidQty: parseFloat(data.bid1Size),
      askQty: parseFloat(data.ask1Size),
      volume24h: parseFloat(data.volume24h),
      priceChange24h: parseFloat(data.price24hPcnt) * parseFloat(data.lastPrice),
      priceChangePercent24h: parseFloat(data.price24hPcnt) * 100,
      highPrice24h: parseFloat(data.highPrice24h),
      lowPrice24h: parseFloat(data.lowPrice24h),
      timestamp: new Date()
    };
  }

  /**
   * Parse Bybit kline response to MarketDataPoint
   */
  parseKline(data: BybitKlineResponse, symbol: string, timeframe: TimeFrame): MarketDataPoint {
    return {
      symbol,
      timeframe,
      timestamp: new Date(data.startTime),
      open: parseFloat(data.openPrice),
      high: parseFloat(data.highPrice),
      low: parseFloat(data.lowPrice),
      close: parseFloat(data.closePrice),
      volume: parseFloat(data.volume)
    };
  }

  /**
   * Parse Bybit order response to Order
   */
  parseOrder(data: BybitOrderResponse, leverage: number = 1): Partial<Order> {
    return {
      id: data.orderId,
      symbol: data.symbol,
      side: data.side === 'Buy' ? TradeAction.BUY : TradeAction.SELL,
      type: data.orderType === 'Market' ? OrderType.MARKET : OrderType.LIMIT,
      quantity: parseFloat(data.qty),
      price: parseFloat(data.price),
      status: this.mapOrderStatus(data.orderStatus),
      leverage,
      orderId: data.orderId,
      filledQuantity: parseFloat(data.cumExecQty),
      fees: parseFloat(data.cumExecFee || '0')
    };
  }

  /**
   * Parse Bybit position response to Position
   */
  parsePosition(data: BybitPositionResponse): Partial<Position> {
    return {
      id: `${data.symbol}-${data.side}`,
      symbol: data.symbol,
      side: data.side === 'Buy' ? 'LONG' as const : 'SHORT' as const,
      quantity: parseFloat(data.size),
      avgEntryPrice: parseFloat(data.avgPrice),
      marketValue: parseFloat(data.positionValue),
      unrealizedPnL: parseFloat(data.unrealisedPnl),
      leverage: parseFloat(data.leverage),
      liquidationPrice: parseFloat(data.liqPrice) || undefined,
      stopLoss: parseFloat(data.stopLoss) || undefined,
      takeProfit: parseFloat(data.takeProfit) || undefined
    };
  }

  /**
   * Validate symbol format
   */
  validateSymbol(symbol: string): boolean {
    return /^[A-Z]{2,10}USDT?$/.test(symbol);
  }

  /**
   * Map internal TradeAction to Bybit side string
   */
  mapSide(action: TradeAction): string {
    const sideMap: Record<TradeAction, string> = {
      [TradeAction.BUY]: 'Buy',
      [TradeAction.SELL]: 'Sell',
      [TradeAction.HOLD]: 'Buy',
      [TradeAction.CLOSE]: 'Sell'
    };
    return sideMap[action];
  }

  /**
   * Map internal OrderType to Bybit order type string
   */
  mapOrderType(type: OrderType): string {
    const orderTypeMap: Record<OrderType, string> = {
      [OrderType.MARKET]: 'Market',
      [OrderType.LIMIT]: 'Limit',
      [OrderType.STOP_MARKET]: 'Market',
      [OrderType.STOP_LIMIT]: 'Limit'
    };
    return orderTypeMap[type];
  }

  /**
   * Handle simulated network error
   */
  handleNetworkError(error: Error): { success: false; error: string } {
    return {
      success: false,
      error: error.message || 'Network error'
    };
  }
}

// ==================== MOCK DATA ====================

function createMockTickerResponse(overrides?: Partial<BybitTickerResponse>): BybitTickerResponse {
  return {
    symbol: 'BTCUSDT',
    lastPrice: '45000.50',
    bid1Price: '45000.00',
    ask1Price: '45001.00',
    bid1Size: '1.5',
    ask1Size: '2.0',
    volume24h: '15000.00',
    price24hPcnt: '0.025',
    highPrice24h: '46000.00',
    lowPrice24h: '44000.00',
    ...overrides
  };
}

function createMockKlineResponse(overrides?: Partial<BybitKlineResponse>): BybitKlineResponse {
  return {
    startTime: 1700000000000,
    openPrice: '44900.00',
    highPrice: '45100.00',
    lowPrice: '44800.00',
    closePrice: '45000.00',
    volume: '1500.00',
    turnover: '67500000.00',
    ...overrides
  };
}

function createMockOrderResponse(overrides?: Partial<BybitOrderResponse>): BybitOrderResponse {
  return {
    orderId: 'order-12345',
    orderLinkId: 'link-12345',
    symbol: 'BTCUSDT',
    side: 'Buy',
    orderType: 'Market',
    price: '45000.00',
    qty: '0.1',
    orderStatus: 'Filled',
    cumExecQty: '0.1',
    cumExecFee: '0.045',
    createdTime: '1700000000000',
    updatedTime: '1700000001000',
    ...overrides
  };
}

function createMockPositionResponse(overrides?: Partial<BybitPositionResponse>): BybitPositionResponse {
  return {
    symbol: 'BTCUSDT',
    side: 'Buy',
    size: '0.1',
    avgPrice: '45000.00',
    positionValue: '4500.00',
    unrealisedPnl: '50.00',
    leverage: '10',
    liqPrice: '40500.00',
    stopLoss: '44000.00',
    takeProfit: '47000.00',
    createdTime: '1700000000000',
    updatedTime: '1700000001000',
    ...overrides
  };
}

// ==================== TESTS ====================

describe('Bybit Client', () => {
  let client: BybitClientTestable;

  beforeEach(() => {
    client = new BybitClientTestable({
      apiKey: 'test-api-key-123',
      apiSecret: 'test-api-secret-456'
    });
  });

  describe('Signature Generation', () => {
    test('should generate a valid HMAC-SHA256 signature', () => {
      const params = { symbol: 'BTCUSDT', category: 'linear' };
      const timestamp = 1700000000000;

      const signature = client.generateSignature(params, timestamp);

      // Verify it's a valid hex string
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should produce deterministic signatures', () => {
      const params = { symbol: 'BTCUSDT', category: 'linear' };
      const timestamp = 1700000000000;

      const sig1 = client.generateSignature(params, timestamp);
      const sig2 = client.generateSignature(params, timestamp);

      expect(sig1).toBe(sig2);
    });

    test('should produce different signatures for different params', () => {
      const timestamp = 1700000000000;
      const params1 = { symbol: 'BTCUSDT' };
      const params2 = { symbol: 'ETHUSDT' };

      const sig1 = client.generateSignature(params1, timestamp);
      const sig2 = client.generateSignature(params2, timestamp);

      expect(sig1).not.toBe(sig2);
    });

    test('should produce different signatures for different timestamps', () => {
      const params = { symbol: 'BTCUSDT' };
      const ts1 = 1700000000000;
      const ts2 = 1700000001000;

      const sig1 = client.generateSignature(params, ts1);
      const sig2 = client.generateSignature(params, ts2);

      expect(sig1).not.toBe(sig2);
    });

    test('should sort parameter keys alphabetically', () => {
      const params1 = { symbol: 'BTCUSDT', category: 'linear' };
      const params2 = { category: 'linear', symbol: 'BTCUSDT' };
      const timestamp = 1700000000000;

      const sig1 = client.generateSignature(params1, timestamp);
      const sig2 = client.generateSignature(params2, timestamp);

      expect(sig1).toBe(sig2); // Order shouldn't matter
    });

    test('should handle empty params', () => {
      const timestamp = 1700000000000;
      const signature = client.generateSignature({}, timestamp);
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should verify signature against manual calculation', () => {
      const params = { symbol: 'BTCUSDT' };
      const timestamp = 1700000000000;

      const queryString = `symbol=BTCUSDT`;
      const signString = `${timestamp}test-api-key-1235000${queryString}`;
      const expectedSig = crypto
        .createHmac('sha256', 'test-api-secret-456')
        .update(signString)
        .digest('hex');

      const actualSig = client.generateSignature(params, timestamp);
      expect(actualSig).toBe(expectedSig);
    });
  });

  describe('Request Header Construction', () => {
    test('should include all required headers', () => {
      const timestamp = 1700000000000;
      const signature = 'test-signature';
      const headers = client.constructHeaders(timestamp, signature);

      expect(headers['X-BAPI-API-KEY']).toBe('test-api-key-123');
      expect(headers['X-BAPI-TIMESTAMP']).toBe('1700000000000');
      expect(headers['X-BAPI-SIGN']).toBe('test-signature');
      expect(headers['X-BAPI-RECV-WINDOW']).toBe('5000');
      expect(headers['Content-Type']).toBe('application/json');
    });

    test('should use correct API key in headers', () => {
      const customClient = new BybitClientTestable({
        apiKey: 'my-custom-key',
        apiSecret: 'my-custom-secret'
      });
      const headers = customClient.constructHeaders(1700000000000, 'sig');

      expect(headers['X-BAPI-API-KEY']).toBe('my-custom-key');
    });

    test('should convert timestamp to string in headers', () => {
      const headers = client.constructHeaders(1700000000000, 'sig');
      expect(typeof headers['X-BAPI-TIMESTAMP']).toBe('string');
    });
  });

  describe('Order Status Mapping', () => {
    test('should map "New" to OPEN', () => {
      expect(client.mapOrderStatus('New')).toBe(OrderStatus.OPEN);
    });

    test('should map "PartiallyFilled" to PARTIALLY_FILLED', () => {
      expect(client.mapOrderStatus('PartiallyFilled')).toBe(OrderStatus.PARTIALLY_FILLED);
    });

    test('should map "Filled" to FILLED', () => {
      expect(client.mapOrderStatus('Filled')).toBe(OrderStatus.FILLED);
    });

    test('should map "Cancelled" to CANCELLED', () => {
      expect(client.mapOrderStatus('Cancelled')).toBe(OrderStatus.CANCELLED);
    });

    test('should map "Rejected" to FAILED', () => {
      expect(client.mapOrderStatus('Rejected')).toBe(OrderStatus.FAILED);
    });

    test('should map "Deactivated" to EXPIRED', () => {
      expect(client.mapOrderStatus('Deactivated')).toBe(OrderStatus.EXPIRED);
    });

    test('should map unknown status to PENDING', () => {
      expect(client.mapOrderStatus('UnknownStatus')).toBe(OrderStatus.PENDING);
    });

    test('should map empty string to PENDING', () => {
      expect(client.mapOrderStatus('')).toBe(OrderStatus.PENDING);
    });
  });

  describe('Ticker Data Parsing', () => {
    test('should parse all ticker fields correctly', () => {
      const mockData = createMockTickerResponse();
      const ticker = client.parseTicker(mockData);

      expect(ticker.symbol).toBe('BTCUSDT');
      expect(ticker.lastPrice).toBe(45000.50);
      expect(ticker.bidPrice).toBe(45000.00);
      expect(ticker.askPrice).toBe(45001.00);
      expect(ticker.bidQty).toBe(1.5);
      expect(ticker.askQty).toBe(2.0);
      expect(ticker.volume24h).toBe(15000.00);
      expect(ticker.highPrice24h).toBe(46000.00);
      expect(ticker.lowPrice24h).toBe(44000.00);
    });

    test('should calculate priceChange24h from percent change', () => {
      const mockData = createMockTickerResponse({
        price24hPcnt: '0.05',
        lastPrice: '100000.00'
      });
      const ticker = client.parseTicker(mockData);

      // priceChange24h = 0.05 * 100000 = 5000
      expect(ticker.priceChange24h).toBe(5000);
      expect(ticker.priceChangePercent24h).toBe(5); // 0.05 * 100
    });

    test('should handle negative price change', () => {
      const mockData = createMockTickerResponse({
        price24hPcnt: '-0.03',
        lastPrice: '50000.00'
      });
      const ticker = client.parseTicker(mockData);

      expect(ticker.priceChange24h).toBe(-1500); // -0.03 * 50000
      expect(ticker.priceChangePercent24h).toBe(-3);
    });

    test('should include timestamp', () => {
      const ticker = client.parseTicker(createMockTickerResponse());
      expect(ticker.timestamp).toBeDefined();
      expect(ticker.timestamp instanceof Date).toBe(true);
    });

    test('should handle zero price', () => {
      const mockData = createMockTickerResponse({
        lastPrice: '0',
        bid1Price: '0',
        ask1Price: '0'
      });
      const ticker = client.parseTicker(mockData);
      expect(ticker.lastPrice).toBe(0);
      expect(ticker.bidPrice).toBe(0);
      expect(ticker.askPrice).toBe(0);
    });

    test('should handle very large prices', () => {
      const mockData = createMockTickerResponse({
        lastPrice: '999999999.99'
      });
      const ticker = client.parseTicker(mockData);
      expect(ticker.lastPrice).toBe(999999999.99);
    });
  });

  describe('Kline Data Parsing', () => {
    test('should parse all kline fields correctly', () => {
      const mockData = createMockKlineResponse();
      const kline = client.parseKline(mockData, 'BTCUSDT', TimeFrame.ONE_HOUR);

      expect(kline.symbol).toBe('BTCUSDT');
      expect(kline.timeframe).toBe(TimeFrame.ONE_HOUR);
      expect(kline.open).toBe(44900.00);
      expect(kline.high).toBe(45100.00);
      expect(kline.low).toBe(44800.00);
      expect(kline.close).toBe(45000.00);
      expect(kline.volume).toBe(1500.00);
    });

    test('should convert startTime to Date', () => {
      const mockData = createMockKlineResponse({ startTime: 1700000000000 });
      const kline = client.parseKline(mockData, 'BTCUSDT', TimeFrame.ONE_HOUR);
      expect(kline.timestamp instanceof Date).toBe(true);
    });

    test('should handle different timeframes', () => {
      const mockData = createMockKlineResponse();

      const kline5m = client.parseKline(mockData, 'BTCUSDT', TimeFrame.FIVE_MINUTES);
      expect(kline5m.timeframe).toBe(TimeFrame.FIVE_MINUTES);

      const kline1d = client.parseKline(mockData, 'BTCUSDT', TimeFrame.ONE_DAY);
      expect(kline1d.timeframe).toBe(TimeFrame.ONE_DAY);
    });
  });

  describe('Order Response Parsing', () => {
    test('should parse a buy market order', () => {
      const mockData = createMockOrderResponse({
        side: 'Buy',
        orderType: 'Market'
      });
      const order = client.parseOrder(mockData);

      expect(order.side).toBe(TradeAction.BUY);
      expect(order.type).toBe(OrderType.MARKET);
    });

    test('should parse a sell limit order', () => {
      const mockData = createMockOrderResponse({
        side: 'Sell',
        orderType: 'Limit'
      });
      const order = client.parseOrder(mockData);

      expect(order.side).toBe(TradeAction.SELL);
      expect(order.type).toBe(OrderType.LIMIT);
    });

    test('should include leverage', () => {
      const mockData = createMockOrderResponse();
      const order = client.parseOrder(mockData, 5);
      expect(order.leverage).toBe(5);
    });

    test('should parse filled quantity and fees', () => {
      const mockData = createMockOrderResponse({
        cumExecQty: '0.5',
        cumExecFee: '1.25'
      });
      const order = client.parseOrder(mockData);
      expect(order.filledQuantity).toBe(0.5);
      expect(order.fees).toBe(1.25);
    });

    test('should handle missing cumExecFee', () => {
      const mockData = createMockOrderResponse({
        cumExecFee: ''
      });
      const order = client.parseOrder(mockData);
      expect(order.fees).toBe(0);
    });
  });

  describe('Position Response Parsing', () => {
    test('should parse a long position', () => {
      const mockData = createMockPositionResponse({ side: 'Buy' });
      const position = client.parsePosition(mockData);

      expect(position.side).toBe('LONG');
      expect(position.symbol).toBe('BTCUSDT');
      expect(position.quantity).toBe(0.1);
      expect(position.avgEntryPrice).toBe(45000.00);
    });

    test('should parse a short position', () => {
      const mockData = createMockPositionResponse({ side: 'Sell' });
      const position = client.parsePosition(mockData);

      expect(position.side).toBe('SHORT');
    });

    test('should parse liquidation price', () => {
      const mockData = createMockPositionResponse({ liqPrice: '40500.00' });
      const position = client.parsePosition(mockData);
      expect(position.liquidationPrice).toBe(40500.00);
    });

    test('should handle zero liquidation price as undefined', () => {
      const mockData = createMockPositionResponse({ liqPrice: '0' });
      const position = client.parsePosition(mockData);
      expect(position.liquidationPrice).toBeUndefined();
    });

    test('should parse stop loss and take profit', () => {
      const mockData = createMockPositionResponse({
        stopLoss: '44000.00',
        takeProfit: '47000.00'
      });
      const position = client.parsePosition(mockData);
      expect(position.stopLoss).toBe(44000.00);
      expect(position.takeProfit).toBe(47000.00);
    });

    test('should handle zero stop loss as undefined', () => {
      const mockData = createMockPositionResponse({ stopLoss: '0' });
      const position = client.parsePosition(mockData);
      expect(position.stopLoss).toBeUndefined();
    });
  });

  describe('Side and Order Type Mapping', () => {
    test('should map BUY to "Buy"', () => {
      expect(client.mapSide(TradeAction.BUY)).toBe('Buy');
    });

    test('should map SELL to "Sell"', () => {
      expect(client.mapSide(TradeAction.SELL)).toBe('Sell');
    });

    test('should map MARKET to "Market"', () => {
      expect(client.mapOrderType(OrderType.MARKET)).toBe('Market');
    });

    test('should map LIMIT to "Limit"', () => {
      expect(client.mapOrderType(OrderType.LIMIT)).toBe('Limit');
    });

    test('should map STOP_MARKET to "Market"', () => {
      expect(client.mapOrderType(OrderType.STOP_MARKET)).toBe('Market');
    });

    test('should map STOP_LIMIT to "Limit"', () => {
      expect(client.mapOrderType(OrderType.STOP_LIMIT)).toBe('Limit');
    });
  });

  describe('Symbol Validation', () => {
    test('should accept valid symbols', () => {
      expect(client.validateSymbol('BTCUSDT')).toBe(true);
      expect(client.validateSymbol('ETHUSDT')).toBe(true);
      expect(client.validateSymbol('SOLUSDT')).toBe(true);
      expect(client.validateSymbol('XRPUSDT')).toBe(true);
    });

    test('should reject lowercase symbols', () => {
      expect(client.validateSymbol('btcusdt')).toBe(false);
    });

    test('should reject symbols without USDT suffix', () => {
      expect(client.validateSymbol('BTC')).toBe(false);
    });

    test('should reject empty strings', () => {
      expect(client.validateSymbol('')).toBe(false);
    });

    test('should reject symbols with special characters', () => {
      expect(client.validateSymbol('BTC-USDT')).toBe(false);
      expect(client.validateSymbol('BTC USDT')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', () => {
      const error = new Error('ECONNREFUSED');
      const result = client.handleNetworkError(error);

      expect(result.success).toBe(false);
      expect(result.error).toBe('ECONNREFUSED');
    });

    test('should handle timeout errors', () => {
      const error = new Error('ETIMEDOUT');
      const result = client.handleNetworkError(error);

      expect(result.success).toBe(false);
      expect(result.error).toBe('ETIMEDOUT');
    });

    test('should handle unknown errors', () => {
      const error = new Error();
      const result = client.handleNetworkError(error);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    test('should handle rate limit errors', () => {
      const error = new Error('Rate limit exceeded');
      const result = client.handleNetworkError(error);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit');
    });
  });
});
