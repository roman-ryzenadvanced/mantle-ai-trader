/**
 * Trading WebSocket Service for Mantle AI Trading Bot
 * Real-time updates for signals, prices, and portfolio
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { signalEngine } from '../../src/lib/trading/signals/signal-engine';
import { demoTrader } from '../../src/lib/trading/demo/demo-trader';
import { newsAggregator } from '../../src/lib/trading/news/news-aggregator';
import { TradeAction, TimeFrame } from '../../src/lib/trading/core/types';

interface SignalSubscription {
  symbol: string;
  timeframe: TimeFrame;
  interval: NodeJS.Timeout;
}

export class TradingWebSocketService {
  private io: SocketIOServer;
  private subscriptions: Map<string, SignalSubscription> = new Map();
  private priceUpdateInterval: NodeJS.Timeout | null = null;

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.setupEventHandlers();
    this.startBackgroundServices();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Send initial data
      this.sendInitialData(socket);

      // Handle signal generation request
      socket.on('generate_signal', async (data: { symbol: string; timeframe: TimeFrame }) => {
        try {
          const signal = await this.generateSignal(data.symbol, data.timeframe);
          socket.emit('signal_generated', signal);
        } catch (error) {
          socket.emit('error', { message: 'Failed to generate signal', error: String(error) });
        }
      });

      // Handle signal subscription
      socket.on('subscribe_signals', (data: { symbol: string; timeframe: TimeFrame }) => {
        this.subscribeToSignals(socket, data.symbol, data.timeframe);
      });

      // Handle unsubscribe
      socket.on('unsubscribe_signals', (data: { symbol: string }) => {
        this.unsubscribeFromSignals(socket.id, data.symbol);
      });

      // Handle demo trading
      socket.on('place_demo_order', (data: {
        symbol: string;
        side: TradeAction;
        quantity: number;
        type: 'MARKET' | 'LIMIT';
        price?: number;
      }) => {
        try {
          const order = demoTrader.placeOrder({
            symbol: data.symbol,
            side: data.side,
            type: data.type,
            quantity: data.quantity,
            price: data.price
          });
          socket.emit('demo_order_placed', order);
          this.broadcastPortfolio();
        } catch (error) {
          socket.emit('error', { message: 'Failed to place order', error: String(error) });
        }
      });

      // Handle close position
      socket.on('close_demo_position', (data: { symbol: string }) => {
        const order = demoTrader.closePosition(data.symbol);
        if (order) {
          socket.emit('demo_order_placed', order);
          this.broadcastPortfolio();
        }
      });

      // Handle get portfolio
      socket.on('get_portfolio', () => {
        socket.emit('portfolio_update', demoTrader.getPortfolio());
      });

      // Handle get positions
      socket.on('get_positions', () => {
        socket.emit('positions_update', demoTrader.getPositions());
      });

      // Handle get news
      socket.on('get_news', async (data: { symbol?: string; limit?: number }) => {
        try {
          const news = data.symbol
            ? await newsAggregator.getNewsForSymbol(data.symbol, data.limit || 20)
            : await newsAggregator.fetchAllNews({ limit: data.limit || 50 });
          socket.emit('news_update', news);
        } catch (error) {
          socket.emit('error', { message: 'Failed to fetch news', error: String(error) });
        }
      });

      // Handle get sentiment
      socket.on('get_sentiment', async (data: { symbol: string }) => {
        try {
          const sentiment = await newsAggregator.getSymbolSentiment(data.symbol);
          socket.emit('sentiment_update', { symbol: data.symbol, ...sentiment });
        } catch (error) {
          socket.emit('error', { message: 'Failed to fetch sentiment', error: String(error) });
        }
      });

      // Handle reset demo
      socket.on('reset_demo', (data: { initialCapital?: number }) => {
        demoTrader.reset(data.initialCapital || 10000);
        this.broadcastPortfolio();
        socket.emit('demo_reset', { success: true });
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        // Clean up subscriptions
        for (const [key, sub] of this.subscriptions) {
          if (key.startsWith(socket.id)) {
            clearInterval(sub.interval);
            this.subscriptions.delete(key);
          }
        }
      });
    });
  }

  private async sendInitialData(socket: Socket): Promise<void> {
    // Send current portfolio
    socket.emit('portfolio_update', demoTrader.getPortfolio());

    // Send positions
    socket.emit('positions_update', demoTrader.getPositions());

    // Send recent news
    try {
      const news = await newsAggregator.fetchAllNews({ limit: 20 });
      socket.emit('news_update', news);
    } catch (error) {
      console.error('Failed to fetch initial news:', error);
    }
  }

  private async generateSignal(symbol: string, timeframe: TimeFrame) {
    // Generate simulated market data for demo
    const marketData = this.generateDemoMarketData(symbol, 200);
    
    // Fetch news for the symbol
    const news = await newsAggregator.getNewsForSymbol(symbol, 10);

    const signalOutput = await signalEngine.generateSignal({
      symbol,
      timeframe,
      marketData,
      newsArticles: news
    });

    return signalOutput;
  }

  private subscribeToSignals(socket: Socket, symbol: string, timeframe: TimeFrame): void {
    const key = `${socket.id}-${symbol}`;
    
    // Remove existing subscription
    const existing = this.subscriptions.get(key);
    if (existing) {
      clearInterval(existing.interval);
    }

    // Create new subscription (check every 5 minutes)
    const interval = setInterval(async () => {
      try {
        const signal = await this.generateSignal(symbol, timeframe);
        socket.emit('signal_update', { symbol, signal });
      } catch (error) {
        console.error(`Error generating signal for ${symbol}:`, error);
      }
    }, 5 * 60 * 1000);

    this.subscriptions.set(key, {
      symbol,
      timeframe,
      interval
    });

    socket.emit('subscribed', { symbol, timeframe });
  }

  private unsubscribeFromSignals(socketId: string, symbol: string): void {
    const key = `${socketId}-${symbol}`;
    const sub = this.subscriptions.get(key);
    
    if (sub) {
      clearInterval(sub.interval);
      this.subscriptions.delete(key);
    }
  }

  private startBackgroundServices(): void {
    // Simulate price updates every 5 seconds
    this.priceUpdateInterval = setInterval(() => {
      this.simulatePriceUpdates();
    }, 5000);

    // Subscribe to demo trader events
    demoTrader.subscribe((event, data) => {
      this.io.emit(event, data);
    });
  }

  private simulatePriceUpdates(): void {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
    const updates: Array<{ symbol: string; price: number; change: number }> = [];

    symbols.forEach(symbol => {
      // Simulate price movement
      const basePrice = this.getBasePrice(symbol);
      const change = (Math.random() - 0.5) * basePrice * 0.002; // 0.2% max change
      const newPrice = basePrice + change;

      demoTrader.updatePrice(symbol, newPrice);
      updates.push({ symbol, price: newPrice, change: change / basePrice * 100 });
    });

    this.io.emit('price_updates', updates);
    this.broadcastPortfolio();
  }

  private getBasePrice(symbol: string): number {
    const prices: Record<string, number> = {
      BTCUSDT: 45000,
      ETHUSDT: 2500,
      SOLUSDT: 100,
      BNBUSDT: 300,
      XRPUSDT: 0.5
    };
    return prices[symbol] || 100;
  }

  private broadcastPortfolio(): void {
    this.io.emit('portfolio_update', demoTrader.getPortfolio());
    this.io.emit('positions_update', demoTrader.getPositions());
  }

  private generateDemoMarketData(symbol: string, count: number) {
    const data = [];
    let price = this.getBasePrice(symbol);
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;

    for (let i = count; i >= 0; i--) {
      const change = (Math.random() - 0.5) * price * 0.02;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random() * Math.abs(change) * 0.5;
      const low = Math.min(open, close) - Math.random() * Math.abs(change) * 0.5;
      const volume = 1000 + Math.random() * 5000;

      data.push({
        symbol,
        timeframe: TimeFrame.ONE_HOUR,
        timestamp: new Date(now - i * hourMs),
        open,
        high,
        low,
        close,
        volume
      });

      price = close;
    }

    return data;
  }

  public getIO(): SocketIOServer {
    return this.io;
  }

  public close(): void {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
    }
    for (const sub of this.subscriptions.values()) {
      clearInterval(sub.interval);
    }
    this.io.close();
  }
}

// Create HTTP server and WebSocket service
const httpServer = new HttpServer();
const tradingService = new TradingWebSocketService(httpServer);

const PORT = 3003;
httpServer.listen(PORT, () => {
  console.log(`Trading WebSocket Service running on port ${PORT}`);
});

export default tradingService;
