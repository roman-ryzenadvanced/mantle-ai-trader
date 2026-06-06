/**
 * Bybit Trading Client for Mantle AI Trading Bot
 * Handles all exchange interactions including orders, positions, and market data
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import {
  TradingConfig,
  Order,
  Position,
  Ticker,
  MarketDataPoint,
  OrderBook,
  TradeAction,
  OrderType,
  OrderStatus,
  TimeFrame,
  BybitTickerResponse,
  BybitKlineResponse,
  BybitOrderResponse,
  BybitPositionResponse,
  APIResponse,
  PositionSide
} from './types';

// Bybit API endpoints
const BYBIT_ENDPOINTS = {
  mainnet: {
    spot: 'https://api.bybit.com',
    futures: 'https://api.bybit.com'
  },
  testnet: {
    spot: 'https://api-testnet.bybit.com',
    futures: 'https://api-testnet.bybit.com'
  }
};

export class BybitClient {
  private client: AxiosInstance;
  private config: TradingConfig;
  private baseUrl: string;

  constructor(config: TradingConfig) {
    this.config = config;
    this.baseUrl = config.testnet 
      ? BYBIT_ENDPOINTS.testnet.futures 
      : BYBIT_ENDPOINTS.mainnet.futures;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Generate signature for authenticated requests
   */
  private generateSignature(params: Record<string, unknown>, timestamp: number): string {
    const queryString = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    const signString = `${timestamp}${this.config.apiKey}5000${queryString}`;
    return crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(signString)
      .digest('hex');
  }

  /**
   * Make authenticated request to Bybit API
   */
  private async authenticatedRequest<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<APIResponse<T>> {
    const timestamp = Date.now();
    const signature = this.generateSignature(params, timestamp);

    const headers = {
      'X-BAPI-API-KEY': this.config.apiKey,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
      'X-BAPI-RECV-WINDOW': '5000'
    };

    try {
      const response = method === 'GET'
        ? await this.client.get(endpoint, { params, headers })
        : await this.client.post(endpoint, params, { headers });

      return {
        success: response.data.retCode === 0,
        data: response.data.result,
        message: response.data.retMsg
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Make public request to Bybit API
   */
  private async publicRequest<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<APIResponse<T>> {
    try {
      const response = method === 'GET'
        ? await this.client.get(endpoint, { params })
        : await this.client.post(endpoint, params);

      return {
        success: response.data.retCode === 0,
        data: response.data.result,
        message: response.data.retMsg
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ==================== MARKET DATA ====================

  /**
   * Get ticker information for a symbol
   */
  async getTicker(symbol: string): Promise<Ticker | null> {
    const response = await this.publicRequest<BybitTickerResponse[]>(
      'GET',
      '/v5/market/tickers',
      { category: 'linear', symbol }
    );

    if (!response.success || !response.data?.length) {
      return null;
    }

    const data = response.data[0];
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
   * Get multiple tickers
   */
  async getTickers(symbols: string[]): Promise<Ticker[]> {
    const tickers: Ticker[] = [];
    
    for (const symbol of symbols) {
      const ticker = await this.getTicker(symbol);
      if (ticker) tickers.push(ticker);
    }

    return tickers;
  }

  /**
   * Get kline/candlestick data
   */
  async getKlines(
    symbol: string,
    timeframe: TimeFrame,
    limit: number = 200,
    startTime?: number,
    endTime?: number
  ): Promise<MarketDataPoint[]> {
    const intervalMap: Record<TimeFrame, string> = {
      [TimeFrame.ONE_MINUTE]: '1',
      [TimeFrame.FIVE_MINUTES]: '5',
      [TimeFrame.FIFTEEN_MINUTES]: '15',
      [TimeFrame.ONE_HOUR]: '60',
      [TimeFrame.FOUR_HOURS]: '240',
      [TimeFrame.ONE_DAY]: 'D',
      [TimeFrame.ONE_WEEK]: 'W'
    };

    const params: Record<string, unknown> = {
      category: 'linear',
      symbol,
      interval: intervalMap[timeframe],
      limit
    };

    if (startTime) params.start = startTime;
    if (endTime) params.end = endTime;

    const response = await this.publicRequest<BybitKlineResponse[]>(
      'GET',
      '/v5/market/kline',
      params
    );

    if (!response.success || !response.data) {
      return [];
    }

    return response.data.map((kline): MarketDataPoint => ({
      symbol,
      timeframe,
      timestamp: new Date(kline.startTime),
      open: parseFloat(kline.openPrice),
      high: parseFloat(kline.highPrice),
      low: parseFloat(kline.lowPrice),
      close: parseFloat(kline.closePrice),
      volume: parseFloat(kline.volume)
    }));
  }

  /**
   * Get order book
   */
  async getOrderBook(symbol: string, limit: number = 50): Promise<OrderBook | null> {
    const response = await this.publicRequest<{
      b: [string, string][];
      a: [string, string][];
    }>(
      'GET',
      '/v5/market/orderbook',
      { category: 'linear', symbol, limit }
    );

    if (!response.success || !response.data) {
      return null;
    }

    return {
      symbol,
      bids: response.data.b.map(([price, qty]) => ({
        price: parseFloat(price),
        quantity: parseFloat(qty)
      })),
      asks: response.data.a.map(([price, qty]) => ({
        price: parseFloat(price),
        quantity: parseFloat(qty)
      })),
      timestamp: new Date()
    };
  }

  // ==================== ORDER MANAGEMENT ====================

  /**
   * Place a new order
   */
  async placeOrder(params: {
    symbol: string;
    side: TradeAction;
    orderType: OrderType;
    quantity: number;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
    leverage?: number;
    positionIdx?: number;
  }): Promise<Order | null> {
    const sideMap: Record<TradeAction, string> = {
      [TradeAction.BUY]: 'Buy',
      [TradeAction.SELL]: 'Sell',
      [TradeAction.HOLD]: 'Buy', // Should not be used
      [TradeAction.CLOSE]: 'Sell' // Close position
    };

    const orderTypeMap: Record<OrderType, string> = {
      [OrderType.MARKET]: 'Market',
      [OrderType.LIMIT]: 'Limit',
      [OrderType.STOP_MARKET]: 'Market',
      [OrderType.STOP_LIMIT]: 'Limit'
    };

    const requestParams: Record<string, unknown> = {
      category: 'linear',
      symbol: params.symbol,
      side: sideMap[params.side],
      orderType: orderTypeMap[params.orderType],
      qty: params.quantity.toString(),
      positionIdx: params.positionIdx || 0
    };

    if (params.price && params.orderType !== OrderType.MARKET) {
      requestParams.price = params.price.toString();
    }

    if (params.stopLoss) {
      requestParams.stopLoss = params.stopLoss.toString();
    }

    if (params.takeProfit) {
      requestParams.takeProfit = params.takeProfit.toString();
    }

    // Set leverage if specified
    if (params.leverage && params.leverage !== 1) {
      await this.setLeverage(params.symbol, params.leverage);
    }

    const response = await this.authenticatedRequest<BybitOrderResponse>(
      'POST',
      '/v5/order/create',
      requestParams
    );

    if (!response.success || !response.data) {
      console.error('Order placement failed:', response.error);
      return null;
    }

    const data = response.data;
    return {
      id: data.orderId,
      symbol: data.symbol,
      side: params.side,
      type: params.orderType,
      quantity: params.quantity,
      price: params.price,
      status: OrderStatus.PENDING,
      leverage: params.leverage || 1,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      orderId: data.orderId,
      filledQuantity: 0,
      fees: 0,
      demo: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Cancel an order
   */
  async cancelOrder(symbol: string, orderId: string): Promise<boolean> {
    const response = await this.authenticatedRequest(
      'POST',
      '/v5/order/cancel',
      {
        category: 'linear',
        symbol,
        orderId
      }
    );

    return response.success;
  }

  /**
   * Cancel all orders for a symbol
   */
  async cancelAllOrders(symbol?: string): Promise<boolean> {
    const params: Record<string, unknown> = {
      category: 'linear'
    };

    if (symbol) {
      params.symbol = symbol;
    }

    const response = await this.authenticatedRequest(
      'POST',
      '/v5/order/cancel-all',
      params
    );

    return response.success;
  }

  /**
   * Get order details
   */
  async getOrder(symbol: string, orderId: string): Promise<Order | null> {
    const response = await this.authenticatedRequest<BybitOrderResponse>(
      'GET',
      '/v5/order/realtime',
      {
        category: 'linear',
        symbol,
        orderId
      }
    );

    if (!response.success || !response.data) {
      return null;
    }

    const data = response.data;
    return {
      id: data.orderId,
      symbol: data.symbol,
      side: data.side === 'Buy' ? TradeAction.BUY : TradeAction.SELL,
      type: data.orderType === 'Market' ? OrderType.MARKET : OrderType.LIMIT,
      quantity: parseFloat(data.qty),
      price: parseFloat(data.price),
      status: this.mapOrderStatus(data.orderStatus),
      leverage: 1,
      orderId: data.orderId,
      executedPrice: parseFloat(data.avgPrice || '0') || undefined,
      executedAt: data.updatedTime ? new Date(parseInt(data.updatedTime)) : undefined,
      filledQuantity: parseFloat(data.cumExecQty),
      fees: parseFloat(data.cumExecFee || '0'),
      demo: false,
      createdAt: new Date(parseInt(data.createdTime)),
      updatedAt: new Date(parseInt(data.updatedTime))
    };
  }

  /**
   * Get open orders
   */
  async getOpenOrders(symbol?: string): Promise<Order[]> {
    const params: Record<string, unknown> = {
      category: 'linear',
      openOnly: 0
    };

    if (symbol) {
      params.symbol = symbol;
    }

    const response = await this.authenticatedRequest<{ list: BybitOrderResponse[] }>(
      'GET',
      '/v5/order/realtime',
      params
    );

    if (!response.success || !response.data?.list) {
      return [];
    }

    return response.data.list.map(data => ({
      id: data.orderId,
      symbol: data.symbol,
      side: data.side === 'Buy' ? TradeAction.BUY : TradeAction.SELL,
      type: data.orderType === 'Market' ? OrderType.MARKET : OrderType.LIMIT,
      quantity: parseFloat(data.qty),
      price: parseFloat(data.price),
      status: this.mapOrderStatus(data.orderStatus),
      leverage: 1,
      orderId: data.orderId,
      filledQuantity: parseFloat(data.cumExecQty),
      fees: parseFloat(data.cumExecFee || '0'),
      demo: false,
      createdAt: new Date(parseInt(data.createdTime)),
      updatedAt: new Date(parseInt(data.updatedTime))
    }));
  }

  // ==================== POSITION MANAGEMENT ====================

  /**
   * Get positions
   */
  async getPositions(symbol?: string): Promise<Position[]> {
    const params: Record<string, unknown> = {
      category: 'linear'
    };

    if (symbol) {
      params.symbol = symbol;
    }

    const response = await this.authenticatedRequest<{ list: BybitPositionResponse[] }>(
      'GET',
      '/v5/position/list',
      params
    );

    if (!response.success || !response.data?.list) {
      return [];
    }

    return response.data.list
      .filter(pos => parseFloat(pos.size) > 0)
      .map(data => ({
        id: `${data.symbol}-${data.side}`,
        symbol: data.symbol,
        side: data.side === 'Buy' ? PositionSide.LONG : PositionSide.SHORT,
        quantity: parseFloat(data.size),
        avgEntryPrice: parseFloat(data.avgPrice),
        currentPrice: parseFloat(data.avgPrice), // Would need to fetch current price separately
        marketValue: parseFloat(data.positionValue),
        unrealizedPnL: parseFloat(data.unrealisedPnl),
        unrealizedPnLPercent: (parseFloat(data.unrealisedPnl) / parseFloat(data.positionValue)) * 100,
        leverage: parseFloat(data.leverage),
        liquidationPrice: parseFloat(data.liqPrice) || undefined,
        stopLoss: parseFloat(data.stopLoss) || undefined,
        takeProfit: parseFloat(data.takeProfit) || undefined,
        openedAt: new Date(parseInt(data.createdTime)),
        demo: false
      }));
  }

  /**
   * Set leverage for a symbol
   */
  async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    const response = await this.authenticatedRequest(
      'POST',
      '/v5/position/set-leverage',
      {
        category: 'linear',
        symbol,
        buyLeverage: leverage.toString(),
        sellLeverage: leverage.toString()
      }
    );

    return response.success;
  }

  /**
   * Set trading stop (TP/SL) for a position
   */
  async setTradingStop(params: {
    symbol: string;
    stopLoss?: number;
    takeProfit?: number;
    trailingStop?: number;
  }): Promise<boolean> {
    const requestParams: Record<string, unknown> = {
      category: 'linear',
      symbol: params.symbol,
      positionIdx: 0
    };

    if (params.stopLoss) {
      requestParams.stopLoss = params.stopLoss.toString();
    }

    if (params.takeProfit) {
      requestParams.takeProfit = params.takeProfit.toString();
    }

    if (params.trailingStop) {
      requestParams.trailingStop = params.trailingStop.toString();
    }

    const response = await this.authenticatedRequest(
      'POST',
      '/v5/position/trading-stop',
      requestParams
    );

    return response.success;
  }

  /**
   * Close position
   */
  async closePosition(symbol: string, side?: 'LONG' | 'SHORT'): Promise<Order | null> {
    const positions = await this.getPositions(symbol);
    const position = positions.find(p => !side || p.side === side);

    if (!position) {
      return null;
    }

    return this.placeOrder({
      symbol,
      side: position.side === 'LONG' ? TradeAction.SELL : TradeAction.BUY,
      orderType: OrderType.MARKET,
      quantity: position.quantity
    });
  }

  // ==================== WALLET ====================

  /**
   * Get wallet balance
   */
  async getWalletBalance(accountType: 'UNIFIED' | 'CONTRACT' = 'UNIFIED'): Promise<{
    totalEquity: number;
    totalAvailableBalance: number;
    coins: Array<{ coin: string; walletBalance: number; availableToWithdraw: number }>;
  } | null> {
    const response = await this.authenticatedRequest<{
      coin: Array<{
        coin: string;
        walletBalance: string;
        availableToWithdraw: string;
        equity: string;
      }>;
    }>(
      'GET',
      '/v5/account/wallet-balance',
      { accountType }
    );

    if (!response.success || !response.data?.coin) {
      return null;
    }

    const coins = response.data.coin.map(c => ({
      coin: c.coin,
      walletBalance: parseFloat(c.walletBalance),
      availableToWithdraw: parseFloat(c.availableToWithdraw)
    }));

    const totalEquity = response.data.coin.reduce(
      (sum, c) => sum + parseFloat(c.equity),
      0
    );

    return {
      totalEquity,
      totalAvailableBalance: totalEquity,
      coins
    };
  }

  // ==================== HELPERS ====================

  private mapOrderStatus(status: string): OrderStatus {
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
}

// Export singleton instance factory
export function createBybitClient(config: TradingConfig): BybitClient {
  return new BybitClient(config);
}
