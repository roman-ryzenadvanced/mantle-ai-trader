/**
 * Demo Trading Mode for Mantle AI Trading Bot
 * Paper trading system for testing signals without real money
 * 
 * v2.0.0 - Fixed: Short position cash handling, leverage effect, portfolio protection,
 * stop-loss/take-profit race conditions, and proper PnL calculations
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
  private isProcessingStopLevel = false; // Guard against re-entrancy

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
    this.listeners.forEach(cb => {
      try {
        cb(event, data);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    });
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
    if (price <= 0) return; // Guard against invalid prices
    
    this.currentPrices.set(symbol, price);
    
    // Update position values
    const position = this.positions.get(symbol);
    if (position) {
      position.currentPrice = price;
      position.marketValue = position.quantity * price;
      
      if (position.side === 'LONG') {
        position.unrealizedPnL = (price - position.avgEntryPrice) * position.quantity * position.leverage;
      } else {
        position.unrealizedPnL = (position.avgEntryPrice - price) * position.quantity * position.leverage;
      }
      
      const positionCost = position.avgEntryPrice * position.quantity;
      position.unrealizedPnLPercent = positionCost > 0 
        ? (position.unrealizedPnL / positionCost) * 100 
        : 0;

      // Check stop loss and take profit (with re-entrancy guard)
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
    if (params.quantity <= 0) {
      throw new Error('Quantity must be positive');
    }

    // Validate leverage before using default
    if (params.leverage !== undefined && (params.leverage < 1 || params.leverage > 100)) {
      throw new Error('Leverage must be between 1 and 100');
    }
    const leverage = params.leverage || 1;

    const currentPrice = this.currentPrices.get(params.symbol) || 0;
    const executionPrice = params.type === OrderType.LIMIT && params.price
      ? params.price
      : currentPrice;

    if (executionPrice <= 0) {
      throw new Error('No price available for this symbol. Set a price first using updatePrice().');
    }

    // Fixed: Calculate required margin (not full notional value for leveraged trades)
    const notionalValue = executionPrice * params.quantity;
    const requiredMargin = notionalValue / leverage; // Margin required for leveraged position
    
    // Check if closing an existing position - use different margin calculation
    const existingPosition = this.positions.get(params.symbol);
    const isClosing = existingPosition && 
      ((params.side === TradeAction.SELL && existingPosition.side === 'LONG') ||
       (params.side === TradeAction.BUY && existingPosition.side === 'SHORT'));
    
    if (isClosing) {
      // When closing, the existing position's margin is released
      // Only need additional margin if closing partial and remainder opens new
      const closingQuantity = Math.min(params.quantity, existingPosition.quantity);
      const releaseMargin = (existingPosition.avgEntryPrice * closingQuantity) / existingPosition.leverage;
      const availableForClose = this.portfolio.cashBalance + releaseMargin;
      
      // For closing, we just need to ensure we have enough to cover any difference
      // If quantity > position quantity, we need margin for the new position
      const newQuantity = params.quantity - closingQuantity;
      if (newQuantity > 0) {
        const newMargin = (executionPrice * newQuantity) / leverage;
        if (newMargin > availableForClose) {
          throw new Error(`Insufficient capital for this order. Required: $${newMargin.toFixed(2)}, Available: $${availableForClose.toFixed(2)}`);
        }
      }
    } else if (requiredMargin > this.portfolio.cashBalance) {
      throw new Error(`Insufficient capital for this order. Required: $${requiredMargin.toFixed(2)}, Available: $${this.portfolio.cashBalance.toFixed(2)}`);
    }

    const order: DemoOrder = {
      id: `demo-order-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
      price: executionPrice,
      leverage,
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
      const riskMultiplier = Math.max(signal.confidence, 0.5); // Minimum 0.5x risk
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

    try {
      const order = this.placeOrder({
        symbol,
        side: closeSide,
        type: OrderType.MARKET,
        quantity: closeQuantity
      });

      return order;
    } catch (error) {
      console.error('Error closing position:', error);
      return null;
    }
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
   * Fixed: Proper margin handling for both long and short positions
   */
  private executeOrder(order: DemoOrder): void {
    const existingPosition = this.positions.get(order.symbol);
    const marginRequired = (order.price * order.quantity) / order.leverage;

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
        existingPosition.leverage = Math.max(existingPosition.leverage, order.leverage);
      } else if (existingPosition && existingPosition.side === 'SHORT') {
        // Close short position
        this.closeExistingPosition(existingPosition, order);
        // If order quantity > position quantity, open a long with remainder
        if (order.quantity > existingPosition.quantity) {
          const remainder = order.quantity - existingPosition.quantity;
          const newPosition: DemoPosition = {
            id: `pos-${order.symbol}`,
            symbol: order.symbol,
            side: 'LONG',
            quantity: remainder,
            avgEntryPrice: order.price,
            currentPrice: order.price,
            marketValue: remainder * order.price,
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

      // Deduct margin from cash
      this.portfolio.cashBalance -= marginRequired;
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
        existingPosition.leverage = Math.max(existingPosition.leverage, order.leverage);
      } else if (existingPosition && existingPosition.side === 'LONG') {
        // Close long position
        this.closeExistingPosition(existingPosition, order);
        // If order quantity > position quantity, open a short with remainder
        if (order.quantity > existingPosition.quantity) {
          const remainder = order.quantity - existingPosition.quantity;
          const newPosition: DemoPosition = {
            id: `pos-${order.symbol}`,
            symbol: order.symbol,
            side: 'SHORT',
            quantity: remainder,
            avgEntryPrice: order.price,
            currentPrice: order.price,
            marketValue: remainder * order.price,
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
      } else {
        // Create new short position
        // Fixed: Short selling uses margin, not adding cash freely
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

      // Fixed: For short selling, deduct margin (collateral) from cash, not add cash
      this.portfolio.cashBalance -= marginRequired;
    }

    order.status = OrderStatus.FILLED;
    order.filledAt = new Date();
    this.tradeHistory.push(order);

    this.emit('order_filled', order);
    this.emit('position_updated', this.positions.get(order.symbol));
  }

  /**
   * Close existing position
   * Fixed: Proper PnL calculation and cash handling for shorts
   */
  private closeExistingPosition(position: DemoPosition, order: DemoOrder): void {
    const closeQuantity = Math.min(position.quantity, order.quantity);
    
    // Calculate realized PnL with leverage
    let pnl: number;
    const marginUsed = (position.avgEntryPrice * closeQuantity) / position.leverage;
    
    if (position.side === 'LONG') {
      pnl = (order.price - position.avgEntryPrice) * closeQuantity * position.leverage;
    } else {
      pnl = (position.avgEntryPrice - order.price) * closeQuantity * position.leverage;
    }

    // Update order PnL
    order.pnl = pnl;
    order.closedAt = new Date();

    // Update portfolio
    this.portfolio.realizedPnL += pnl;
    
    // Fixed: Return margin + PnL when closing position
    if (position.side === 'LONG') {
      this.portfolio.cashBalance += marginUsed + pnl;
    } else {
      // For short: return margin + profit (or margin - loss)
      this.portfolio.cashBalance += marginUsed + pnl;
    }

    // Ensure cash balance doesn't go negative
    this.portfolio.cashBalance = Math.max(0, this.portfolio.cashBalance);

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
   * Fixed: Added re-entrancy guard to prevent race conditions
   */
  private checkStopLevels(position: DemoPosition): void {
    if (this.isProcessingStopLevel) return;
    this.isProcessingStopLevel = true;

    try {
      if (position.stopLoss && position.currentPrice <= position.stopLoss && position.side === 'LONG') {
        this.closePosition(position.symbol);
        this.emit('stop_loss_triggered', position);
        return;
      }

      if (position.stopLoss && position.currentPrice >= position.stopLoss && position.side === 'SHORT') {
        this.closePosition(position.symbol);
        this.emit('stop_loss_triggered', position);
        return;
      }

      if (position.takeProfit && position.currentPrice >= position.takeProfit && position.side === 'LONG') {
        this.closePosition(position.symbol);
        this.emit('take_profit_triggered', position);
        return;
      }

      if (position.takeProfit && position.currentPrice <= position.takeProfit && position.side === 'SHORT') {
        this.closePosition(position.symbol);
        this.emit('take_profit_triggered', position);
        return;
      }
    } finally {
      this.isProcessingStopLevel = false;
    }
  }

  /**
   * Check pending limit orders
   */
  private checkPendingOrders(symbol: string, price: number): void {
    const ordersToExecute: DemoOrder[] = [];
    
    this.orders.forEach(order => {
      if (order.symbol !== symbol || order.status !== OrderStatus.PENDING) {
        return;
      }

      if (order.type === OrderType.LIMIT) {
        // For buy limit, execute when price drops to or below limit price
        if (order.side === TradeAction.BUY && price <= order.price) {
          ordersToExecute.push(order);
        }
        // For sell limit, execute when price rises to or above limit price
        if (order.side === TradeAction.SELL && price >= order.price) {
          ordersToExecute.push(order);
        }
      }
    });

    // Execute orders outside the loop to avoid mutation during iteration
    ordersToExecute.forEach(order => {
      const index = this.orders.indexOf(order);
      if (index !== -1) {
        this.orders.splice(index, 1);
        this.executeOrder(order);
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
    this.portfolio.totalValue = Math.max(0, this.portfolio.cashBalance + totalUnrealizedPnL);
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
    if (initialCapital <= 0) {
      throw new Error('Initial capital must be positive');
    }
    
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
