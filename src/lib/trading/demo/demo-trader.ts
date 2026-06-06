/**
 * Demo Trading Mode for Mantle AI Trading Bot
 * Paper trading system for testing signals without real money
 */

import {
  Signal,
  Position,
  Order,
  Portfolio,
  TradeAction,
  OrderType,
  OrderStatus,
  Ticker
} from '../core/types';

export interface DemoOrder {
  id: string;
  symbol: string;
  side: TradeAction;
  type: OrderType;
  quantity: number;
  price: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  status: OrderStatus;
  filledAt?: Date;
  closedAt?: Date;
  pnl?: number;
  signalId?: string;
}

export interface DemoPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: Date;
  signalId?: string;
}

export class DemoTrader {
  private portfolio: Portfolio;
  private positions: Map<string, DemoPosition> = new Map();
  private orders: DemoOrder[] = [];
  private tradeHistory: DemoOrder[] = [];
  private currentPrices: Map<string, number> = new Map();
  private listeners: Set<(event: string, data: unknown) => void> = new Set();

  constructor(initialCapital: number = 10000) {
    this.portfolio = {
      id: 'demo-portfolio',
      name: 'Demo Portfolio',
      totalValue: initialCapital,
      cashBalance: initialCapital,
      realizedPnL: 0,
      unrealizedPnL: 0,
      positions: [],
      demo: true
    };
  }

  /**
   * Subscribe to events
   */
  subscribe(callback: (event: string, data: unknown) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Emit event
   */
  private emit(event: string, data: unknown): void {
    this.listeners.forEach(cb => cb(event, data));
  }

  /**
   * Get current portfolio state
   */
  getPortfolio(): Portfolio {
    this.updatePortfolioValue();
    return { ...this.portfolio };
  }

  /**
   * Get all positions
   */
  getPositions(): DemoPosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get open orders
   */
  getOpenOrders(): DemoOrder[] {
    return this.orders.filter(o => o.status === OrderStatus.OPEN || o.status === OrderStatus.PENDING);
  }

  /**
   * Get trade history
   */
  getTradeHistory(): DemoOrder[] {
    return [...this.tradeHistory];
  }

  /**
   * Update current price for a symbol
   */
  updatePrice(symbol: string, price: number): void {
    this.currentPrices.set(symbol, price);
    
    // Update position values
    const position = this.positions.get(symbol);
    if (position) {
      position.currentPrice = price;
      position.marketValue = position.quantity * price;
      
      if (position.side === 'LONG') {
        position.unrealizedPnL = (price - position.avgEntryPrice) * position.quantity;
      } else {
        position.unrealizedPnL = (position.avgEntryPrice - price) * position.quantity;
      }
      
      position.unrealizedPnLPercent = (position.unrealizedPnL / (position.avgEntryPrice * position.quantity)) * 100;

      // Check stop loss and take profit
      this.checkStopLevels(position);
    }

    // Check pending orders
    this.checkPendingOrders(symbol, price);

    this.emit('price_update', { symbol, price });
  }

  /**
   * Update multiple prices at once
   */
  updatePrices(tickers: Ticker[]): void {
    tickers.forEach(ticker => {
      this.updatePrice(ticker.symbol, ticker.lastPrice);
    });
  }

  /**
   * Place a demo order
   */
  placeOrder(params: {
    symbol: string;
    side: TradeAction;
    type: OrderType;
    quantity: number;
    price?: number;
    leverage?: number;
    stopLoss?: number;
    takeProfit?: number;
    signalId?: string;
  }): DemoOrder {
    const currentPrice = this.currentPrices.get(params.symbol) || 0;
    const executionPrice = params.type === OrderType.LIMIT && params.price
      ? params.price
      : currentPrice;

    // Check if we have enough capital
    const requiredCapital = executionPrice * params.quantity * (params.leverage || 1);
    if (params.side === TradeAction.BUY && requiredCapital > this.portfolio.cashBalance) {
      throw new Error('Insufficient capital for this order');
    }

    const order: DemoOrder = {
      id: `demo-order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
      price: executionPrice,
      leverage: params.leverage || 1,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      status: params.type === OrderType.MARKET ? OrderStatus.FILLED : OrderStatus.PENDING,
      signalId: params.signalId
    };

    // Execute market orders immediately
    if (params.type === OrderType.MARKET) {
      this.executeOrder(order);
    } else {
      this.orders.push(order);
    }

    this.emit('order_placed', order);
    return order;
  }

  /**
   * Execute a signal
   */
  async executeSignal(signal: Signal): Promise<DemoOrder | null> {
    if (signal.action === TradeAction.HOLD) {
      return null;
    }

    try {
      // Calculate position size based on confidence
      const baseRisk = 0.02; // 2% risk per trade
      const riskMultiplier = signal.confidence * 2; // Scale with confidence
      const riskAmount = this.portfolio.totalValue * baseRisk * riskMultiplier;
      
      const currentPrice = this.currentPrices.get(signal.symbol) || signal.priceTarget || 0;
      if (currentPrice === 0) {
        throw new Error('No price available for this symbol');
      }

      const quantity = riskAmount / currentPrice;

      return this.placeOrder({
        symbol: signal.symbol,
        side: signal.action,
        type: OrderType.MARKET,
        quantity: Math.floor(quantity * 100000000) / 100000000, // Round to 8 decimals
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        signalId: signal.id
      });
    } catch (error) {
      console.error('Error executing signal:', error);
      return null;
    }
  }

  /**
   * Close a position
   */
  closePosition(symbol: string, quantity?: number): DemoOrder | null {
    const position = this.positions.get(symbol);
    if (!position) {
      return null;
    }

    const closeQuantity = quantity || position.quantity;
    const closeSide = position.side === 'LONG' ? TradeAction.SELL : TradeAction.BUY;

    const order = this.placeOrder({
      symbol,
      side: closeSide,
      type: OrderType.MARKET,
      quantity: closeQuantity
    });

    return order;
  }

  /**
   * Cancel an order
   */
  cancelOrder(orderId: string): boolean {
    const orderIndex = this.orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) {
      return false;
    }

    const order = this.orders[orderIndex];
    if (order.status !== OrderStatus.PENDING) {
      return false;
    }

    order.status = OrderStatus.CANCELLED;
    this.orders.splice(orderIndex, 1);
    this.tradeHistory.push(order);

    this.emit('order_cancelled', order);
    return true;
  }

  /**
   * Execute an order
   */
  private executeOrder(order: DemoOrder): void {
    const existingPosition = this.positions.get(order.symbol);

    if (order.side === TradeAction.BUY) {
      if (existingPosition && existingPosition.side === 'LONG') {
        // Add to existing long position
        const newQuantity = existingPosition.quantity + order.quantity;
        const newAvgPrice = (
          (existingPosition.avgEntryPrice * existingPosition.quantity) +
          (order.price * order.quantity)
        ) / newQuantity;

        existingPosition.quantity = newQuantity;
        existingPosition.avgEntryPrice = newAvgPrice;
        existingPosition.marketValue = newQuantity * order.price;
      } else if (existingPosition && existingPosition.side === 'SHORT') {
        // Close short position
        this.closeExistingPosition(existingPosition, order);
      } else {
        // Create new long position
        const newPosition: DemoPosition = {
          id: `pos-${order.symbol}`,
          symbol: order.symbol,
          side: 'LONG',
          quantity: order.quantity,
          avgEntryPrice: order.price,
          currentPrice: order.price,
          marketValue: order.quantity * order.price,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
          leverage: order.leverage,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          openedAt: new Date(),
          signalId: order.signalId
        };
        this.positions.set(order.symbol, newPosition);
      }

      // Deduct from cash
      this.portfolio.cashBalance -= order.price * order.quantity;
    } else if (order.side === TradeAction.SELL) {
      if (existingPosition && existingPosition.side === 'SHORT') {
        // Add to existing short position
        const newQuantity = existingPosition.quantity + order.quantity;
        const newAvgPrice = (
          (existingPosition.avgEntryPrice * existingPosition.quantity) +
          (order.price * order.quantity)
        ) / newQuantity;

        existingPosition.quantity = newQuantity;
        existingPosition.avgEntryPrice = newAvgPrice;
      } else if (existingPosition && existingPosition.side === 'LONG') {
        // Close long position
        this.closeExistingPosition(existingPosition, order);
      } else {
        // Create new short position
        const newPosition: DemoPosition = {
          id: `pos-${order.symbol}`,
          symbol: order.symbol,
          side: 'SHORT',
          quantity: order.quantity,
          avgEntryPrice: order.price,
          currentPrice: order.price,
          marketValue: order.quantity * order.price,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
          leverage: order.leverage,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          openedAt: new Date(),
          signalId: order.signalId
        };
        this.positions.set(order.symbol, newPosition);
      }

      // Add to cash (for shorts, we receive cash)
      this.portfolio.cashBalance += order.price * order.quantity;
    }

    order.status = OrderStatus.FILLED;
    order.filledAt = new Date();
    this.tradeHistory.push(order);

    this.emit('order_filled', order);
    this.emit('position_updated', this.positions.get(order.symbol));
  }

  /**
   * Close existing position
   */
  private closeExistingPosition(position: DemoPosition, order: DemoOrder): void {
    const closeQuantity = Math.min(position.quantity, order.quantity);
    
    // Calculate realized PnL
    let pnl: number;
    if (position.side === 'LONG') {
      pnl = (order.price - position.avgEntryPrice) * closeQuantity;
    } else {
      pnl = (position.avgEntryPrice - order.price) * closeQuantity;
    }

    // Update order PnL
    order.pnl = pnl;
    order.closedAt = new Date();

    // Update portfolio
    this.portfolio.realizedPnL += pnl;
    if (position.side === 'LONG') {
      this.portfolio.cashBalance += order.price * closeQuantity;
    }

    // Update or remove position
    if (closeQuantity >= position.quantity) {
      this.positions.delete(position.symbol);
      this.emit('position_closed', position);
    } else {
      position.quantity -= closeQuantity;
      position.marketValue = position.quantity * order.price;
    }

    // Update signal result if applicable
    if (position.signalId) {
      this.emit('signal_result', {
        signalId: position.signalId,
        pnl,
        result: pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'NEUTRAL'
      });
    }
  }

  /**
   * Check stop loss and take profit levels
   */
  private checkStopLevels(position: DemoPosition): void {
    if (position.stopLoss && position.currentPrice <= position.stopLoss && position.side === 'LONG') {
      this.closePosition(position.symbol);
      this.emit('stop_loss_triggered', position);
    }

    if (position.stopLoss && position.currentPrice >= position.stopLoss && position.side === 'SHORT') {
      this.closePosition(position.symbol);
      this.emit('stop_loss_triggered', position);
    }

    if (position.takeProfit && position.currentPrice >= position.takeProfit && position.side === 'LONG') {
      this.closePosition(position.symbol);
      this.emit('take_profit_triggered', position);
    }

    if (position.takeProfit && position.currentPrice <= position.takeProfit && position.side === 'SHORT') {
      this.closePosition(position.symbol);
      this.emit('take_profit_triggered', position);
    }
  }

  /**
   * Check pending limit orders
   */
  private checkPendingOrders(symbol: string, price: number): void {
    this.orders.forEach(order => {
      if (order.symbol !== symbol || order.status !== OrderStatus.PENDING) {
        return;
      }

      if (order.type === OrderType.LIMIT) {
        // For buy limit, execute when price drops to or below limit price
        if (order.side === TradeAction.BUY && price <= order.price) {
          this.executeOrder(order);
        }
        // For sell limit, execute when price rises to or above limit price
        if (order.side === TradeAction.SELL && price >= order.price) {
          this.executeOrder(order);
        }
      }
    });
  }

  /**
   * Update portfolio value
   */
  private updatePortfolioValue(): void {
    let totalUnrealizedPnL = 0;

    this.positions.forEach(position => {
      totalUnrealizedPnL += position.unrealizedPnL;
    });

    this.portfolio.unrealizedPnL = totalUnrealizedPnL;
    this.portfolio.totalValue = this.portfolio.cashBalance + totalUnrealizedPnL;
    this.portfolio.positions = Array.from(this.positions.values()).map(p => ({
      id: p.id,
      symbol: p.symbol,
      side: p.side,
      quantity: p.quantity,
      avgEntryPrice: p.avgEntryPrice,
      currentPrice: p.currentPrice,
      marketValue: p.marketValue,
      unrealizedPnL: p.unrealizedPnL,
      unrealizedPnLPercent: p.unrealizedPnLPercent,
      leverage: p.leverage,
      openedAt: p.openedAt,
      demo: true
    }));
  }

  /**
   * Reset demo account
   */
  reset(initialCapital: number = 10000): void {
    this.positions.clear();
    this.orders = [];
    this.tradeHistory = [];
    this.portfolio = {
      id: 'demo-portfolio',
      name: 'Demo Portfolio',
      totalValue: initialCapital,
      cashBalance: initialCapital,
      realizedPnL: 0,
      unrealizedPnL: 0,
      positions: [],
      demo: true
    };

    this.emit('portfolio_reset', this.portfolio);
  }

  /**
   * Get performance statistics
   */
  getStatistics(): {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnL: number;
    averagePnL: number;
    bestTrade: number;
    worstTrade: number;
    profitFactor: number;
  } {
    const trades = this.tradeHistory.filter(t => t.pnl !== undefined);
    const wins = trades.filter(t => (t.pnl || 0) > 0);
    const losses = trades.filter(t => (t.pnl || 0) <= 0);
    
    const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const grossProfit = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0));

    return {
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
      totalPnL,
      averagePnL: trades.length > 0 ? totalPnL / trades.length : 0,
      bestTrade: trades.length > 0 ? Math.max(...trades.map(t => t.pnl || 0)) : 0,
      worstTrade: trades.length > 0 ? Math.min(...trades.map(t => t.pnl || 0)) : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 0
    };
  }
}

// Export singleton
export const demoTrader = new DemoTrader();
