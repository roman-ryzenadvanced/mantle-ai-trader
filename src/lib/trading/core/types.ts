/**
 * Core Trading Types and Interfaces for Mantle AI Trading Bot
 * Comprehensive type definitions for the entire trading system
 */

// ==================== ENUMS ====================

export enum TradeAction {
  BUY = 'BUY',
  SELL = 'SELL',
  HOLD = 'HOLD',
  CLOSE = 'CLOSE'
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP_MARKET = 'STOP_MARKET',
  STOP_LIMIT = 'STOP_LIMIT'
}

export enum OrderStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  FILLED = 'FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED'
}

export enum SignalStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  EXECUTED = 'EXECUTED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED'
}

export enum SignalResult {
  WIN = 'WIN',
  LOSS = 'LOSS',
  NEUTRAL = 'NEUTRAL',
  PENDING = 'PENDING'
}

export enum RiskLevel {
  CONSERVATIVE = 'CONSERVATIVE',
  MODERATE = 'MODERATE',
  AGGRESSIVE = 'AGGRESSIVE'
}

export enum PositionSide {
  LONG = 'LONG',
  SHORT = 'SHORT'
}

export enum TimeFrame {
  ONE_MINUTE = '1m',
  FIVE_MINUTES = '5m',
  FIFTEEN_MINUTES = '15m',
  ONE_HOUR = '1h',
  FOUR_HOURS = '4h',
  ONE_DAY = '1d',
  ONE_WEEK = '1w'
}

export enum NewsSource {
  CRYPTOPANIC = 'CryptoPanic',
  COINGECKO = 'CoinGecko',
  CRYPTOCOMPARE = 'CryptoCompare',
  BINANCE_NEWS = 'BinanceNews',
  TWITTER = 'Twitter',
  REDDIT = 'Reddit',
  CUSTOM_RSS = 'CustomRSS'
}

export enum SentimentLabel {
  VERY_BEARISH = 'VERY_BEARISH',
  BEARISH = 'BEARISH',
  NEUTRAL = 'NEUTRAL',
  BULLISH = 'BULLISH',
  VERY_BULLISH = 'VERY_BULLISH'
}

// ==================== INTERFACES ====================

export interface TradingConfig {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  riskLevel: RiskLevel;
  maxPositionSize: number;
  maxLeverage: number;
  autoTrading: boolean;
  defaultStopLossPercent: number;
  defaultTakeProfitPercent: number;
}

export interface Signal {
  id: string;
  symbol: string;
  action: TradeAction;
  confidence: number;
  rating: number;
  priceTarget?: number;
  stopLoss?: number;
  takeProfit?: number;
  reasoning: string;
  newsSources?: string[];
  sentimentScore?: number;
  technicalScore?: number;
  fundamentalScore?: number;
  status: SignalStatus;
  executedAt?: Date;
  executedPrice?: number;
  result?: SignalResult;
  resultPnL?: number;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SignalGenerationInput {
  symbol: string;
  timeframe: TimeFrame;
  marketData: MarketDataPoint[];
  newsArticles: NewsArticle[];
  additionalContext?: string;
}

export interface SignalGenerationOutput {
  signal: Omit<Signal, 'id' | 'createdAt' | 'updatedAt'>;
  analysis: SignalAnalysis;
  riskAssessment: RiskAssessment;
}

export interface SignalAnalysis {
  technicalAnalysis: TechnicalAnalysis;
  fundamentalAnalysis: FundamentalAnalysis;
  sentimentAnalysis: SentimentAnalysis;
  overallScore: number;
  keyFactors: string[];
  warnings: string[];
}

export interface TechnicalAnalysis {
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  trendStrength: number;
  supportLevels: number[];
  resistanceLevels: number[];
  indicators: Record<string, number>;
  patterns: string[];
  score: number;
}

export interface FundamentalAnalysis {
  newsImpact: number;
  marketEvents: string[];
  economicFactors: string[];
  tokenomics?: TokenomicsData;
  score: number;
}

export interface TokenomicsData {
  circulatingSupply?: number;
  totalSupply?: number;
  marketCap?: number;
  volume24h?: number;
  priceChange24h?: number;
  priceChange7d?: number;
}

export interface SentimentAnalysis {
  overallSentiment: number;
  sentimentLabel: SentimentLabel;
  newsSentiment: number;
  socialSentiment: number;
  fearGreedIndex?: number;
  keyTopics: string[];
  trendingKeywords: string[];
}

export interface RiskAssessment {
  riskScore: number;
  riskLevel: RiskLevel;
  maxRecommendedPosition: number;
  suggestedStopLoss: number;
  suggestedTakeProfit: number;
  riskFactors: string[];
  marketVolatility: number;
  liquidityRisk: number;
}

export interface MarketDataPoint {
  symbol: string;
  timeframe: TimeFrame;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: Date;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface Ticker {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  bidQty: number;
  askQty: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  highPrice24h: number;
  lowPrice24h: number;
  timestamp: Date;
}

export interface Order {
  id: string;
  symbol: string;
  side: TradeAction;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  status: OrderStatus;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  orderId?: string;
  executedAt?: Date;
  executedPrice?: number;
  filledQuantity: number;
  fees: number;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Position {
  id: string;
  symbol: string;
  side: PositionSide;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  leverage: number;
  liquidationPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: Date;
  demo: boolean;
}

export interface Portfolio {
  id: string;
  name: string;
  totalValue: number;
  cashBalance: number;
  realizedPnL: number;
  unrealizedPnL: number;
  positions: Position[];
  demo: boolean;
}

export interface Trade {
  id: string;
  signalId?: string;
  symbol: string;
  side: TradeAction;
  orderType: OrderType;
  quantity: number;
  price: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  status: OrderStatus;
  orderId?: string;
  executedAt?: Date;
  closedAt?: Date;
  pnl?: number;
  fees?: number;
  demo: boolean;
  notes?: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  content?: string;
  summary?: string;
  source: string;
  sourceUrl?: string;
  author?: string;
  category?: string;
  sentiment?: number;
  importance?: number;
  tags?: string[];
  publishedAt?: Date;
  fetchedAt: Date;
  processed: boolean;
  vectorId?: string;
}

export interface NewsQuery {
  sources?: NewsSource[];
  categories?: string[];
  symbols?: string[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  minImportance?: number;
}

export interface BacktestConfig {
  name: string;
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  strategy: string;
  parameters: Record<string, unknown>;
  fees: number; // Fee percentage per trade
  slippage: number; // Slippage percentage
}

export interface BacktestResult {
  id: string;
  sessionId: string;
  signalId?: string;
  symbol: string;
  action: TradeAction;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  pnl?: number;
  pnlPercent?: number;
  executedAt: Date;
  closedAt?: Date;
  notes?: string;
}

export interface BacktestSession {
  id: string;
  name: string;
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  finalCapital?: number;
  totalTrades: number;
  winRate?: number;
  maxDrawdown?: number;
  sharpeRatio?: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  results: BacktestResult[];
}

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
}

// ==================== API RESPONSE TYPES ====================

export interface BybitTickerResponse {
  symbol: string;
  lastPrice: string;
  bid1Price: string;
  ask1Price: string;
  bid1Size: string;
  ask1Size: string;
  volume24h: string;
  price24hPcnt: string;
  highPrice24h: string;
  lowPrice24h: string;
}

export interface BybitKlineResponse {
  startTime: number;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
  turnover: string;
}

export interface BybitOrderResponse {
  orderId: string;
  orderLinkId: string;
  symbol: string;
  side: string;
  orderType: string;
  price: string;
  qty: string;
  orderStatus: string;
  cumExecQty: string;
  cumExecFee: string;
  createdTime: string;
  updatedTime: string;
  avgPrice?: string;
}

export interface BybitPositionResponse {
  symbol: string;
  side: string;
  size: string;
  avgPrice: string;
  positionValue: string;
  unrealisedPnl: string;
  leverage: string;
  liqPrice: string;
  stopLoss: string;
  takeProfit: string;
  createdTime: string;
  updatedTime: string;
}

// ==================== WEBSOCKET TYPES ====================

export interface WSMessage<T = unknown> {
  type: string;
  data: T;
  timestamp: Date;
}

export interface WSTickerMessage {
  symbol: string;
  ticker: Ticker;
}

export interface WSSignalMessage {
  signal: Signal;
  analysis: SignalAnalysis;
}

export interface WSOrderMessage {
  order: Order;
  status: OrderStatus;
}

export interface WSPortfolioMessage {
  portfolio: Portfolio;
  changes: Partial<Portfolio>;
}

export interface WSNotificationMessage {
  level: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

// ==================== UTILITY TYPES ====================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface OHLCV {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
