/**
 * Demo Trading Mode for Mantle AI Trading Bot
 * Paper trading system for testing signals without real money
 * 
 * v4.0.0 - Added: Circuit Breaker pattern for consecutive loss protection,
 * position size recovery after cooldown
 * v3.0.0 - Added: Trailing stop loss, partial position closing, position averaging,
 * realized PnL tracking with fees, commission calculation, margin call simulation
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
  Ticker,
  PositionSide
} from '../core/types';
import { db } from '@/lib/db';

// ==================== CIRCUIT BREAKER ====================

/** Configuration options for the circuit breaker */
export interface CircuitBreakerConfig {
  /** Number of consecutive losses that triggers the circuit breaker (default: 5) */
  consecutiveLossThreshold: number;
  /** Cooldown duration in milliseconds before trading can resume (default: 30 minutes) */
  cooldownDurationMs: number;
  /** Position size multiplier when resuming after cooldown (default: 0.5 = 50%) */
  reducedPositionMultiplier: number;
  /** How much to restore per winning trade after cooldown (default: 0.25 = 25%) */
  recoveryStep: number;
}

/** Current state of the circuit breaker */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Detailed status of the circuit breaker for monitoring */
export interface CircuitBreakerStatus {
  /** Current state: CLOSED (normal), OPEN (halted), HALF_OPEN (recovering) */
  state: CircuitBreakerState;
  /** Number of consecutive losses currently tracked */
  consecutiveLosses: number;
  /** Total trades placed while breaker was active */
  totalTradesWhileActive: number;
  /** Timestamp when the breaker was tripped (null if not OPEN) */
  trippedAt: Date | null;
  /** Timestamp when cooldown expires (null if not OPEN) */
  cooldownExpiresAt: Date | null;
  /** Current position size multiplier (1.0 = normal, <1.0 = reduced) */
  positionSizeMultiplier: number;
  /** Number of consecutive losses threshold */
  threshold: number;
  /** Number of winning trades since entering HALF_OPEN state */
  recoveryWins: number;
}

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
  trailingStop?: number;
  trailingStopDistance?: number;
  trailingStopActivated?: boolean;
  openedAt: Date;
  signalId?: string;
  realizedPnL?: number;
  totalFees?: number;
}

/** Commission rates for maker/taker fees */
export interface CommissionRates {
  makerFee: number; // Fee for limit orders (e.g., 0.0002 = 0.02%)
  takerFee: number; // Fee for market orders (e.g., 0.0005 = 0.05%)
}

/** Realized trade PnL record */
export interface RealizedTradePnL {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  realizedPnL: number;
  fees: number;
  netPnL: number;
  pnlPercent: number;
  closedAt: Date;
}

export class DemoTrader {
  private portfolio: Portfolio;
  private positions: Map<string, DemoPosition> = new Map();
  private orders: DemoOrder[] = [];
  private tradeHistory: DemoOrder[] = [];
  private currentPrices: Map<string, number> = new Map();
  private listeners: Set<(event: string, data: unknown) => void> = new Set();
  private isProcessingStopLevel = false; // Guard against re-entrancy
  private commissionRates: CommissionRates;
  private realizedTrades: RealizedTradePnL[] = [];
  private marginCallThreshold: number; // Margin ratio below which margin call triggers

  // Circuit Breaker state
  private consecutiveLosses: number = 0;
  private circuitBreakerState: CircuitBreakerState = 'CLOSED';
  private circuitBreakerTrippedAt: Date | null = null;
  private circuitBreakerCooldownExpiresAt: Date | null = null;
  private positionSizeMultiplier: number = 1.0;
  private recoveryWins: number = 0;
  private circuitBreakerConfig: CircuitBreakerConfig;
  private _persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(initialCapital: number = 10000, commissionRates?: Partial<CommissionRates>, circuitBreakerConfig?: Partial<CircuitBreakerConfig>) {
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
    this.commissionRates = {
      makerFee: commissionRates?.makerFee ?? 0.0002,  // 0.02% maker
      takerFee: commissionRates?.takerFee ?? 0.0005   // 0.05% taker
    };
    this.marginCallThreshold = 0.5; // 50% margin ratio
    this.circuitBreakerConfig = {
      consecutiveLossThreshold: circuitBreakerConfig?.consecutiveLossThreshold ?? 5,
      cooldownDurationMs: circuitBreakerConfig?.cooldownDurationMs ?? 30 * 60 * 1000, // 30 minutes
      reducedPositionMultiplier: circuitBreakerConfig?.reducedPositionMultiplier ?? 0.5,
      recoveryStep: circuitBreakerConfig?.recoveryStep ?? 0.25
    };

    // Restore persisted state from DB (async, fire-and-forget)
    this.restoreFromDB().catch(err => {
      console.error('DemoTrader: failed to restore from DB, starting fresh:', err.message);
    });
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

  // ==================== PERSISTENCE ====================

  /**
   * Persist current state to the database. Called after every state-changing operation.
   * Fire-and-forget — errors are logged but not thrown.
   */
  private persistState(): void {
    // Serialize in a try-catch to never break trading flow
    try {
      const portfolioData = JSON.stringify({
        totalValue: this.portfolio.totalValue,
        cashBalance: this.portfolio.cashBalance,
        realizedPnL: this.portfolio.realizedPnL,
        unrealizedPnL: this.portfolio.unrealizedPnL,
      });

      const positionsData = JSON.stringify(
        Array.from(this.positions.entries()).map(([key, pos]) => ({
          id: pos.id,
          symbol: key,
          symbol2: pos.symbol,
          side: pos.side,
          quantity: pos.quantity,
          avgEntryPrice: pos.avgEntryPrice,
          currentPrice: pos.currentPrice,
          marketValue: pos.marketValue,
          unrealizedPnL: pos.unrealizedPnL,
          unrealizedPnLPercent: pos.unrealizedPnLPercent,
          leverage: pos.leverage,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          trailingStopActivated: pos.trailingStopActivated,
          trailingStopDistance: pos.trailingStopDistance,
          openedAt: pos.openedAt,
        }))
      );

      const realizedData = JSON.stringify(this.realizedTrades);
      const circuitData = JSON.stringify({
        consecutiveLosses: this.consecutiveLosses,
        circuitBreakerState: this.circuitBreakerState,
        circuitBreakerTrippedAt: this.circuitBreakerTrippedAt,
        circuitBreakerCooldownExpiresAt: this.circuitBreakerCooldownExpiresAt,
        positionSizeMultiplier: this.positionSizeMultiplier,
        recoveryWins: this.recoveryWins,
      });

      // Upsert the singleton row
      db.demoState.upsert({
        where: { id: 'singleton' },
        update: { portfolioData, positionsData, realizedData, circuitData },
        create: { id: 'singleton', portfolioData, positionsData, realizedData, circuitData },
      }).catch(err => {
        console.error('DemoTrader: persist error:', err.message);
      });
    } catch (err) {
      console.error('DemoTrader: persist serialization error:', err);
    }
  }

  /**
   * Restore demo state from the database on startup.
   */
  private async restoreFromDB(): Promise<void> {
    try {
      const state = await db.demoState.findUnique({ where: { id: 'singleton' } });
      if (!state) return;

      // Restore portfolio
      const portfolio = JSON.parse(state.portfolioData);
      this.portfolio = {
        id: 'demo-portfolio',
        name: 'Demo Portfolio',
        totalValue: portfolio.totalValue ?? 10000,
        cashBalance: portfolio.cashBalance ?? 10000,
        realizedPnL: portfolio.realizedPnL ?? 0,
        unrealizedPnL: portfolio.unrealizedPnL ?? 0,
        positions: [],
        demo: true,
      };

      // Restore positions
      const positions: Array<Record<string, unknown>> = JSON.parse(state.positionsData);
      for (const p of positions) {
        const pos: DemoPosition = {
          id: p.id as string || `pos-${p.symbol2}`,
          symbol: p.symbol2 as string,
          side: p.side as PositionSide,
          quantity: p.quantity as number,
          avgEntryPrice: p.avgEntryPrice as number,
          currentPrice: p.currentPrice as number,
          marketValue: p.marketValue as number,
          unrealizedPnL: p.unrealizedPnL as number,
          unrealizedPnLPercent: p.unrealizedPnLPercent as number,
          leverage: p.leverage as number,
          stopLoss: p.stopLoss as number | undefined,
          takeProfit: p.takeProfit as number | undefined,
          trailingStopActivated: p.trailingStopActivated as boolean,
          trailingStopDistance: p.trailingStopDistance as number,
          openedAt: new Date(p.openedAt as string),
        };
        this.positions.set(p.symbol as string, pos);
        // Also populate currentPrices so placeOrder/closePosition work
        if (pos.currentPrice > 0) {
          this.currentPrices.set(p.symbol as string, pos.currentPrice);
        }
      }

      // Restore realized trades
      if (state.realizedData) {
        const rt: Array<RealizedTradePnL> = JSON.parse(state.realizedData);
        this.realizedTrades = rt.map(t => ({ ...t, closedAt: new Date(t.closedAt) }));
      }

      // Restore circuit breaker
      if (state.circuitData) {
        const cb = JSON.parse(state.circuitData);
        this.consecutiveLosses = cb.consecutiveLosses ?? 0;
        this.circuitBreakerState = cb.circuitBreakerState ?? 'CLOSED';
        this.circuitBreakerTrippedAt = cb.circuitBreakerTrippedAt ? new Date(cb.circuitBreakerTrippedAt) : null;
        this.circuitBreakerCooldownExpiresAt = cb.circuitBreakerCooldownExpiresAt ? new Date(cb.circuitBreakerCooldownExpiresAt) : null;
        this.positionSizeMultiplier = cb.positionSizeMultiplier ?? 1.0;
        this.recoveryWins = cb.recoveryWins ?? 0;
      }

      console.log(`DemoTrader: restored from DB — ${this.positions.size} positions, ${this.realizedTrades.length} realized trades, portfolio $${this.portfolio.totalValue.toFixed(2)}`);
      this.emit('portfolio_restored', this.portfolio);
    } catch (err) {
      console.error('DemoTrader: restore error:', err);
    }
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

      // Update trailing stop if configured
      this.updateTrailingStop(position);

      // Check margin call
      this.checkMarginCall();

      // Check stop loss and take profit (with re-entrancy guard)
      this.checkStopLevels(position);
    }

    // Check pending orders
    this.checkPendingOrders(symbol, price);

    this.emit('price_update', { symbol, price });

    // Debounced persist — save state after price updates (throttled to 1/sec)
    if (!this._persistTimer) {
      this._persistTimer = setTimeout(() => {
        this.persistState();
        this._persistTimer = null;
      }, 1000);
    }
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
   * v4.0.0 - Added circuit breaker check: blocks trading when breaker is OPEN,
   * applies reduced position size when in HALF_OPEN recovery mode
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

    // Circuit breaker check: update state first
    this.updateCircuitBreakerState();

    if (this.circuitBreakerState === 'OPEN') {
      throw new Error('Circuit breaker is OPEN: trading halted due to consecutive losses. Please wait for cooldown.');
    }

    // Apply position size multiplier if in HALF_OPEN (recovery) mode
    const adjustedQuantity = this.circuitBreakerState === 'HALF_OPEN'
      ? params.quantity * this.positionSizeMultiplier
      : params.quantity;

    if (adjustedQuantity <= 0) {
      throw new Error('Position size reduced to zero by circuit breaker recovery. Wait for more wins.');
    }

    const leverage = params.leverage || 1;

    const currentPrice = this.currentPrices.get(params.symbol) || 0;
    const executionPrice = params.price || currentPrice;

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
      quantity: adjustedQuantity,
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
    this.persistState();
    return order;
  }
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
        price: currentPrice,
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
        quantity: closeQuantity,
        price: position.currentPrice
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

    // Calculate commission fee
    const fee = this.calculateCommission(order.price, order.quantity, order.type);
    
    order.status = OrderStatus.FILLED;
    order.filledAt = new Date();
    this.tradeHistory.push(order);

    this.emit('order_filled', order);
    this.emit('position_updated', this.positions.get(order.symbol));
  }

  /**
   * Close existing position
   * Fixed: Proper PnL calculation and cash handling for shorts
   * v4.0.0 - Added circuit breaker loss/win tracking on position close
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

    // Calculate closing commission fee
    const closeFee = this.calculateCommission(order.price, closeQuantity, order.type);
    pnl -= closeFee; // Deduct fee from PnL

    // Update order PnL
    order.pnl = pnl;
    order.closedAt = new Date();

    // Track realized trade with fees
    const entryCost = position.avgEntryPrice * closeQuantity;
    this.realizedTrades.push({
      id: `rpnl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      symbol: position.symbol,
      side: position.side,
      entryPrice: position.avgEntryPrice,
      exitPrice: order.price,
      quantity: closeQuantity,
      realizedPnL: pnl + closeFee, // PnL before closing fee
      fees: closeFee,
      netPnL: pnl, // After fees
      pnlPercent: entryCost > 0 ? (pnl / entryCost) * 100 : 0,
      closedAt: new Date()
    });

    // Update position-level realized PnL tracking
    position.realizedPnL = (position.realizedPnL || 0) + pnl;
    position.totalFees = (position.totalFees || 0) + closeFee;

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

    // Circuit breaker: track consecutive wins/losses
    this.recordTradeResult(pnl);
    this.persistState();
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
      side: p.side as PositionSide,
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
   * Update trailing stop for a position (public API)
   * Sets a trailing stop distance and activates it on next price update
   * The trailing stop moves up with the price for LONG positions, 
   * and moves down for SHORT positions
   */
  updateTrailingStop(symbolOrPosition: string | DemoPosition, trailPercentOrUndefined?: number): boolean | void {
    // QA-FIX #8: Merged the two conflicting updateTrailingStop methods into one.
    // The original code had a public method updateTrailingStop(symbol, trailPercent) at line 707
    // and a private method updateTrailingStop(position) at line 872. In JavaScript, the latter
    // would override the former, making the public API inaccessible. Now we use a single
    // overloaded method that handles both call signatures.
    if (typeof symbolOrPosition === 'string') {
      // Public API: updateTrailingStop(symbol, trailPercent)
      const symbol = symbolOrPosition;
      const trailPercent = trailPercentOrUndefined;
      if (trailPercent === undefined) return false;
      const position = this.positions.get(symbol);
      if (!position || trailPercent <= 0 || trailPercent >= 100) return false;

      if (position.side === 'LONG') {
        const newStop = position.currentPrice * (1 - trailPercent / 100);
        if (!position.stopLoss || newStop > position.stopLoss) {
          position.stopLoss = newStop;
          this.emit('trailing_stop_updated', { symbol, newStop, side: 'LONG' });
          return true;
        }
      } else {
        const newStop = position.currentPrice * (1 + trailPercent / 100);
        if (!position.stopLoss || newStop < position.stopLoss) {
          position.stopLoss = newStop;
          this.emit('trailing_stop_updated', { symbol, newStop, side: 'SHORT' });
          return true;
        }
      }
      return false;
    } else {
      // Internal: updateTrailingStop(position) - called from updatePrice()
      const position = symbolOrPosition;
      if (!position.trailingStopDistance || position.trailingStopDistance <= 0) return;

      const distance = position.trailingStopDistance;
      const price = position.currentPrice;

      if (position.side === 'LONG') {
        const newStop = price - distance;
        if (!position.trailingStop || newStop > position.trailingStop) {
          position.trailingStop = newStop;
          if (!position.trailingStopActivated && price > position.avgEntryPrice + distance) {
            position.trailingStopActivated = true;
          }
        }
      } else {
        const newStop = price + distance;
        if (!position.trailingStop || newStop < position.trailingStop) {
          position.trailingStop = newStop;
          if (!position.trailingStopActivated && price < position.avgEntryPrice - distance) {
            position.trailingStopActivated = true;
          }
        }
      }
    }
  }

  /**
   * Close a portion of a position (partial close)
   * QA-FIX #4: Removed duplicate closePositionPartial. The original code had two definitions
   * at lines 738 and 925. In JS, the second definition overrode the first. The first used
   * placeOrder() directly while the second delegated to closePosition(). We keep the version
   * that delegates to closePosition() for consistency, and remove the dead duplicate.
   * @param symbol - Symbol to partially close
   * @param percent - Percentage of position to close (1-100)
   */
  closePositionPartial(symbol: string, percent: number): DemoOrder | null {
    const position = this.positions.get(symbol);
    if (!position) return null;

    if (percent <= 0 || percent > 100) {
      throw new Error('Percent must be between 1 and 100');
    }

    const closeQuantity = (position.quantity * percent) / 100;
    if (closeQuantity <= 0) return null;

    return this.closePosition(symbol, closeQuantity);
  }

  /**
   * Check for margin call conditions
   * QA-FIX #5: Removed duplicate checkMarginCall() that returned string[].
   * The original code had two definitions: one returning boolean (line 770) and one
   * returning string[] (line 976). In JS, the last definition wins, silently changing
   * the return type. Now we have a single method that returns an object with both
   * the boolean status and the list of liquidated symbols.
   * @returns Object with isMarginCall boolean and closedSymbols array
   */
  checkMarginCall(): { isMarginCall: boolean; closedSymbols: string[] } {
    if (this.positions.size === 0) return { isMarginCall: false, closedSymbols: [] };

    const closedSymbols: string[] = [];

    this.positions.forEach((position) => {
      const positionMargin = (position.avgEntryPrice * position.quantity) / position.leverage;
      const positionValue = position.side === 'LONG'
        ? position.currentPrice * position.quantity
        : (2 * position.avgEntryPrice - position.currentPrice) * position.quantity;

      const marginRatio = positionMargin > 0 ? positionValue / positionMargin : 0;

      if (marginRatio < this.marginCallThreshold && marginRatio > 0) {
        this.closePosition(position.symbol);
        closedSymbols.push(position.symbol);
        this.emit('margin_call', {
          symbol: position.symbol,
          marginRatio,
          threshold: this.marginCallThreshold,
          action: 'FORCE_CLOSE'
        });
      }
    });

    return { isMarginCall: closedSymbols.length > 0, closedSymbols };
  }

  /**
   * Get positions that should be liquidated in margin call (worst first)
   */
  getMarginCallLiquidationOrder(): DemoPosition[] {
    return Array.from(this.positions.values())
      .sort((a, b) => a.unrealizedPnL - b.unrealizedPnL);
  }

  /**
   * Calculate commission for a trade
   * QA-FIX #6: Removed duplicate calculateCommission that used `isMaker: boolean` parameter.
   * The original code had two definitions with different signatures. The first (line 796)
   * accepted `isMaker: boolean` but was called with `order.type` (an OrderType), causing
   * a type mismatch at runtime. The second (line 1012) correctly used `orderType: OrderType`.
   * In JS the second definition won, so the first was dead code. Now we have a single
   * correct method that maps OrderType to maker/taker fee rates.
   * @param price - Execution price
   * @param quantity - Trade quantity  
   * @param orderType - Type of order (LIMIT uses maker fee, others use taker fee)
   * @returns Commission fee amount
   */
  calculateCommission(price: number, quantity: number, orderType: OrderType): number {
    const notional = price * quantity;
    const rate = orderType === OrderType.LIMIT
      ? this.commissionRates.makerFee
      : this.commissionRates.takerFee;
    return notional * rate;
  }

  /**
   * Reset demo account
   * v4.0.0 - Also resets circuit breaker state
   */
  reset(initialCapital: number = 10000): void {
    if (initialCapital <= 0) {
      throw new Error('Initial capital must be positive');
    }
    
    this.positions.clear();
    this.orders = [];
    this.tradeHistory = [];
    this.realizedTrades = [];

    // Reset circuit breaker
    this.consecutiveLosses = 0;
    this.circuitBreakerState = 'CLOSED';
    this.circuitBreakerTrippedAt = null;
    this.circuitBreakerCooldownExpiresAt = null;
    this.positionSizeMultiplier = 1.0;
    this.recoveryWins = 0;

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
    this.persistState();
  }
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

  // ==================== NEW v3.0.0 METHODS ====================

  // QA-FIX #8: The private updateTrailingStop(position) method is now merged into
  // the unified updateTrailingStop above. No separate private method needed.

  /**
   * Set trailing stop loss for a position
   * @param symbol - Position symbol
   * @param distance - Distance from current price for the trailing stop
   * @returns Whether the trailing stop was set successfully
   */
  setTrailingStop(symbol: string, distance: number): boolean {
    const position = this.positions.get(symbol);
    if (!position || distance <= 0) return false;

    position.trailingStopDistance = distance;
    position.trailingStop = undefined; // Will be set on next price update
    position.trailingStopActivated = false;

    this.emit('trailing_stop_set', { symbol, distance });
    return true;
  }

  /**
   * Close a partial position - delegates to the unified closePositionPartial above.
   * QA-FIX #4: This duplicate definition has been removed. The original had two
   * closePositionPartial definitions (lines 738 and 925). The second one won due to
   * JS class semantics, making the first dead code. We keep only the unified version above.
   */

  /**
   * Average into a position (add to an existing position at a different price)
   * @param symbol - Position symbol
   * @param quantity - Additional quantity to add
   * @param orderType - Order type (default: MARKET)
   * @returns The averaging order or null
   */
  averagePosition(symbol: string, quantity: number, orderType: OrderType = OrderType.MARKET): DemoOrder | null {
    const position = this.positions.get(symbol);
    if (!position) return null;

    const side = position.side === 'LONG' ? TradeAction.BUY : TradeAction.SELL;

    try {
      const order = this.placeOrder({
        symbol,
        side,
        type: orderType,
        quantity,
        leverage: position.leverage,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit
      });

      this.emit('position_averaged', { symbol, quantity, avgEntryPrice: position.avgEntryPrice });
      return order;
    } catch (error) {
      console.error('Error averaging position:', error);
      return null;
    }
  }

  /**
   * Check for margin call - now delegates to the unified checkMarginCall above.
   * QA-FIX #5: This duplicate definition has been removed. The original had two
   * checkMarginCall definitions with different return types (boolean vs string[]),
   * causing a silent type change. Now we have one method returning an object.
   */

  /**
   * Calculate commission for an order - now delegates to the unified calculateCommission above.
   * QA-FIX #6: This duplicate definition has been removed. The original had two
   * calculateCommission definitions with different parameter types (boolean vs OrderType),
   * causing incorrect fee calculations when the first definition was expected.
   */

  /**
   * Get realized trade PnL history
   * @returns Array of realized trade PnL records
   */
  getRealizedTrades(): RealizedTradePnL[] {
    return [...this.realizedTrades];
  }

  /**
   * Get total fees paid
   * @returns Total commission fees across all trades
   */
  getTotalFees(): number {
    return this.realizedTrades.reduce((sum, t) => sum + t.fees, 0);
  }

  /**
   * Set margin call threshold
   * @param threshold - New threshold (0-1, where 0.5 = 50%)
   */
  setMarginCallThreshold(threshold: number): void {
    if (threshold <= 0 || threshold > 1) {
      throw new Error('Margin call threshold must be between 0 and 1');
    }
    this.marginCallThreshold = threshold;
  }

  // ==================== CIRCUIT BREAKER METHODS ====================

  /**
   * Record the result of a trade for circuit breaker tracking
   * Increments consecutive losses on losing trades, resets on winning trades
   * @param pnl - The realized PnL of the closed trade
   */
  private recordTradeResult(pnl: number): void {
    if (pnl < 0) {
      this.consecutiveLosses++;
      this.recoveryWins = 0; // Reset recovery wins on a loss

      // Check if we should trip the circuit breaker
      if (this.consecutiveLosses >= this.circuitBreakerConfig.consecutiveLossThreshold
          && this.circuitBreakerState === 'CLOSED') {
        this.tripCircuitBreaker();
      }
    } else if (pnl > 0) {
      this.consecutiveLosses = 0;

      // If in HALF_OPEN state, gradually restore position size
      if (this.circuitBreakerState === 'HALF_OPEN') {
        this.recoveryWins++;
        this.positionSizeMultiplier = Math.min(
          1.0,
          this.positionSizeMultiplier + this.circuitBreakerConfig.recoveryStep
        );

        // If fully recovered, close the breaker
        if (this.positionSizeMultiplier >= 1.0) {
          this.circuitBreakerState = 'CLOSED';
          this.circuitBreakerTrippedAt = null;
          this.circuitBreakerCooldownExpiresAt = null;
          this.recoveryWins = 0;
          this.emit('circuit_breaker_closed', { multiplier: 1.0 });
        } else {
          this.emit('circuit_breaker_recovery', {
            wins: this.recoveryWins,
            multiplier: this.positionSizeMultiplier
          });
        }
      }
    }
  }

  /**
   * Trip the circuit breaker, halting trading for the cooldown period
   */
  private tripCircuitBreaker(): void {
    this.circuitBreakerState = 'OPEN';
    this.circuitBreakerTrippedAt = new Date();
    this.circuitBreakerCooldownExpiresAt = new Date(
      Date.now() + this.circuitBreakerConfig.cooldownDurationMs
    );
    this.positionSizeMultiplier = 0; // No trading while OPEN
    this.recoveryWins = 0;

    this.emit('circuit_breaker_tripped', {
      consecutiveLosses: this.consecutiveLosses,
      cooldownExpiresAt: this.circuitBreakerCooldownExpiresAt,
      threshold: this.circuitBreakerConfig.consecutiveLossThreshold
    });
  }

  /**
   * Update the circuit breaker state based on current time
   * Transitions from OPEN to HALF_OPEN when cooldown expires
   */
  private updateCircuitBreakerState(): void {
    if (this.circuitBreakerState === 'OPEN' && this.circuitBreakerCooldownExpiresAt) {
      if (Date.now() >= this.circuitBreakerCooldownExpiresAt.getTime()) {
        // Cooldown expired - transition to HALF_OPEN
        this.circuitBreakerState = 'HALF_OPEN';
        this.positionSizeMultiplier = this.circuitBreakerConfig.reducedPositionMultiplier;
        this.recoveryWins = 0;

        this.emit('circuit_breaker_half_open', {
          multiplier: this.positionSizeMultiplier
        });
      }
    }
  }

  /**
   * Get the current circuit breaker status for monitoring
   * @returns Detailed circuit breaker status object
   */
  getCircuitBreakerStatus(): CircuitBreakerStatus {
    // Update state before reporting
    this.updateCircuitBreakerState();

    return {
      state: this.circuitBreakerState,
      consecutiveLosses: this.consecutiveLosses,
      totalTradesWhileActive: this.tradeHistory.length,
      trippedAt: this.circuitBreakerTrippedAt,
      cooldownExpiresAt: this.circuitBreakerCooldownExpiresAt,
      positionSizeMultiplier: this.positionSizeMultiplier,
      threshold: this.circuitBreakerConfig.consecutiveLossThreshold,
      recoveryWins: this.recoveryWins
    };
  }

  /**
   * Manually reset the circuit breaker to CLOSED state
   * Useful for testing or admin override
   */
  resetCircuitBreaker(): void {
    this.circuitBreakerState = 'CLOSED';
    this.circuitBreakerTrippedAt = null;
    this.circuitBreakerCooldownExpiresAt = null;
    this.positionSizeMultiplier = 1.0;
    this.consecutiveLosses = 0;
    this.recoveryWins = 0;
    this.emit('circuit_breaker_reset', {});
  }
}

// Export singleton
export const demoTrader = new DemoTrader();
