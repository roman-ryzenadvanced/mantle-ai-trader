'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import {
  TrendingUp, TrendingDown, Activity, DollarSign, AlertTriangle,
  RefreshCw, Play, Square, BarChart3, Newspaper, Settings,
  Brain, Target, Shield, Zap, CheckCircle, XCircle, Clock,
  AlertCircle, Info, X, Flame, Gauge as GaugeIcon, ShieldAlert,
  ChevronUp, ChevronDown, MoveDown, Percent, Repeat,
  ArrowUpRight, ArrowDownRight, Crosshair, Timer, Layers, CandlestickChart,
  Radio, RadioTower, Power, Eye, EyeOff, ScanSearch, NewspaperIcon, LogOut, User
} from 'lucide-react';

// Types
interface SignalDetails {
  currentPrice: number;
  entryZone: { low: number; high: number; strategy: string; description: string };
  takeProfitLevels: Array<{ level: number; price: number; percentFromEntry: number; positionPercent: number; description: string }>;
  stopLoss: { price: number; percentFromEntry: number; reasoning: string; type: string };
  riskRewardRatio: number;
  leverage: { min: number; max: number; recommended: number; reasoning: string };
  timeHorizon: string;
  timeHorizonDescription: string;
  volatility: { value: number; label: string; atrPercent: number };
  marketContext: string;
  priceActionNotes: string[];
  fundamentalCatalysts: string[];
  keyLevels: { supports: number[]; resistances: number[]; nearestSupport: number; nearestResistance: number };
  indicatorSummary: Array<{ name: string; value: number; signal: string; note: string }>;
  patternAnalysis: { detected: string[]; reliability: string; summary: string };
}

interface Signal {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  rating: number;
  reasoning: string;
  status: string;
  createdAt: string;
  demo?: boolean;
  sentimentScore?: number;
  technicalScore?: number;
  fundamentalScore?: number;
  details?: SignalDetails;
  analysis?: {
    technicalAnalysis: { trend: string; trendStrength: number; patterns: string[]; score: number };
    fundamentalAnalysis: { score: number };
    sentimentAnalysis: { overallSentiment: number; sentimentLabel: string };
    warnings?: string[];
  };
  riskAssessment?: { riskLevel: string; riskFactors: string[]; marketVolatility: number };
}

interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue?: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  leverage?: number;
  stopLoss?: number;
  takeProfit?: number;
  trailingStop?: number;
  trailingStopDistance?: number;
  trailingStopActivated?: boolean;
  realizedPnL?: number;
  totalFees?: number;
  openedAt?: string;
}

interface TradeHistoryEntry {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  quantity: number;
  price: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  status: string;
  pnl?: number;
  filledAt?: string;
  closedAt?: string;
}

interface RealizedTrade {
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
  closedAt: string;
}

interface Portfolio {
  totalValue: number;
  cashBalance: number;
  realizedPnL: number;
  unrealizedPnL: number;
}

interface NewsItem {
  id: string;
  title: string;
  source: string;
  sentiment?: number;
  importance?: number;
  publishedAt?: string;
  isBreaking?: boolean;
}

interface PriceUpdate {
  symbol: string;
  price: number;
  change: number;
}

interface RiskMetrics {
  totalRiskScore: number;
  currentDrawdown: number;
  maxDrawdown: number;
  dailyPnLPercent: number;
  openPositionCount: number;
  totalExposurePercent: number;
  avgCorrelation: number;
  riskLevel: string;
  shouldHaltTrading: boolean;
  haltReason?: string;
}

interface EquityPoint {
  time: string;
  value: number;
  peak: number;
}

// Active Mode types
interface ActiveScanSignal {
  signal: Signal;
  analysis?: {
    technicalAnalysis: { trend: string; trendStrength: number; patterns: string[]; score: number };
    fundamentalAnalysis: { score: number };
    sentimentAnalysis: { overallSentiment: number; sentimentLabel: string };
    warnings?: string[];
  };
  riskAssessment?: { riskLevel: string; marketVolatility: number };
  details?: SignalDetails;
  strategyName: string;
  signalType: 'TECHNICAL' | 'NEWS';
  scannedAt: string;
  // News signal extras
  sourceArticle?: string;
  sentimentShift?: number;
  indicators?: {
    newsSentiment: number;
    articleCount: number;
    highImpactCount: number;
    topicKeywords: string[];
  };
}

const ALL_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT'];
const STRATEGY_OPTIONS = [
  { value: 'DEFAULT', label: 'Balanced', desc: 'Equal weight across all factors' },
  { value: 'MOMENTUM', label: 'Momentum', desc: 'RSI trend + MACD + volume surge' },
  { value: 'BREAKOUT', label: 'Breakout', desc: 'Bollinger squeeze + ADX + resistance' },
  { value: 'MEAN_REVERSION', label: 'Mean Reversion', desc: 'RSI extreme + Bollinger bounce' },
  { value: 'VWAP_TWAP', label: 'VWAP/TWAP', desc: 'Price vs VWAP spread + volume' },
];
const SCAN_INTERVALS = [
  { value: 30, label: '30s' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 300, label: '5 min' },
];

// Colors for charts
const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function TradingDashboard() {
  const { data: session, status } = useSession();

  // State
  const [connected, setConnected] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [portfolio, setPortfolio] = useState<Portfolio>({
    totalValue: 10000,
    cashBalance: 10000,
    realizedPnL: 0,
    unrealizedPnL: 0
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [breakingNews, setBreakingNews] = useState<NewsItem[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceUpdate>>({});
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [marketVolumeData, setMarketVolumeData] = useState<{
    instruments: Array<{
      symbol: string; displayName: string;
      exchanges: Record<string, { volume24h: number; price: number; change24h: number; high24h: number; low24h: number }>;
      totalVolume24h: number; avgPrice: number; avgChange24h: number;
      sentiment: string; sentimentScore: number;
      volumeDominance: Record<string, number>;
      priceRange24h: { high: number; low: number; percent: number };
    }>;
    summary: {
      totalMarketVolume: number; instrumentsTracked: number;
      bullishCount: number; bearishCount: number; neutralCount: number;
      overallSentiment: string; exchangesResponding: number; timestamp: number;
    };
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('signals');
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(null);
  const [equityCurve, setEquityCurve] = useState<EquityPoint[]>([]);
  const [trailingStopDistance, setTrailingStopDistance] = useState<Record<string, number>>({});
  const [tradeHistory, setTradeHistory] = useState<TradeHistoryEntry[]>([]);
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);

  // Trading mode & platform settings
  const [tradingMode, _setTradingMode] = useState<'demo' | 'live'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('mantle_trading_mode') as 'demo' | 'live') || 'demo';
    }
    return 'demo';
  });

  // Persist trading mode to localStorage whenever it changes
  const handleSetTradingMode = (mode: 'demo' | 'live') => {
    _setTradingMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mantle_trading_mode', mode);
    }
  };
  const [showSettings, setShowSettings] = useState(false);
  const [exchangeAccounts, setExchangeAccounts] = useState<Array<{
    id: string; name: string; exchange: string; apiKey: string; apiSecret: string;
    testnet: boolean; isActive: boolean; lastTested: string | null; lastError: string | null;
  }>>([]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connected' | 'testing' | 'error'>('disconnected');
  const [liveBalance, setLiveBalance] = useState<{ totalEquity: number; totalAvailableBalance: number } | null>(null);
  const [livePositions, setLivePositions] = useState<Position[]>([]);
  // New account form
  const [newAccount, setNewAccount] = useState({ name: 'Bybit Main', exchange: 'bybit', apiKey: '', apiSecret: '', testnet: true });
  const [accountFormMode, setAccountFormMode] = useState<'add' | 'edit'>('add');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  // Trade Order Form (expanded from signal)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderForm, setOrderForm] = useState({
    symbol: '', side: 'BUY' as 'BUY' | 'SELL', orderType: 'MARKET' as 'MARKET' | 'LIMIT',
    entryPrice: 0, quantity: 0, leverage: 5,
    stopLoss: 0, takeProfit: 0, takeProfitLevel: 1,
    riskPercent: 1, // % of portfolio to risk on this trade
  });
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  // Active Mode state
  const [activeMode, setActiveMode] = useState(false);
  const [activeScanning, setActiveScanning] = useState(false);
  const [activeScanSignals, setActiveScanSignals] = useState<ActiveScanSignal[]>([]);
  const [activeShowConfig, setActiveShowConfig] = useState(true);
  const [activePairs, setActivePairs] = useState<string[]>(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']);
  const [activeStrategies, setActiveStrategies] = useState<string[]>(['DEFAULT', 'MOMENTUM', 'BREAKOUT']);
  const [activeScanInterval, setActiveScanInterval] = useState(60);
  const [activeNewsEnabled, setActiveNewsEnabled] = useState(true);
  const [lastScanTime, setLastScanTime] = useState<number>(0);
  const [scanInProgress, setScanInProgress] = useState(false);
  const activeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Symbol options
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

  // WebSocket connection
  useEffect(() => {
    const socket: Socket = io('/?XTransformPort=3003');

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('portfolio_update', (data: Portfolio) => {
      setPortfolio(data);
    });

    socket.on('positions_update', (data: Position[]) => {
      setPositions(data);
    });

    socket.on('price_updates', (data: PriceUpdate[]) => {
      const priceMap: Record<string, PriceUpdate> = {};
      data.forEach((p) => {
        priceMap[p.symbol] = p;
      });
      setPrices(priceMap);
    });

    socket.on('signal_generated', (data: { signal: Signal }) => {
      setSignals((prev) => [data.signal, ...prev].slice(0, 50));
    });

    socket.on('news_update', (data: NewsItem[]) => {
      setNews(data);
    });

    // Fetch initial data
    fetchInitialData();

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchInitialData = async () => {
    try {
      // Fetch news
      const newsRes = await fetch('/api/trading/news?limit=20');
      const newsData = await newsRes.json();
      if (newsData.success) {
        setNews(newsData.data);
      }

      // Fetch breaking news
      const breakingRes = await fetch('/api/trading/news?endpoint=breaking&limit=5');
      const breakingData = await breakingRes.json();
      if (breakingData.success) {
        setBreakingNews(breakingData.data || []);
      }

      // Restore persisted demo state (portfolio + positions)
      const syncRes = await fetch('/api/trading/demo?action=sync');
      const syncData = await syncRes.json();
      if (syncData.success) {
        if (syncData.data.portfolio) setPortfolio(syncData.data.portfolio);
        if (syncData.data.positions) setPositions(syncData.data.positions);
      }

      // Fetch risk metrics
      fetchRiskMetrics();

      // Fetch trade history
      fetchTradeHistory();

      // Generate equity curve
      generateEquityCurve();
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  };

  const fetchRiskMetrics = async () => {
    try {
      const res = await fetch('/api/trading/demo?action=statistics');
      const data = await res.json();
      if (data.success) {
        const stats = data.data;
        // Calculate risk metrics from portfolio
        const portfolioValue = portfolio.totalValue;
        const initialCapital = 10000;
        const drawdown = portfolioValue < initialCapital 
          ? (initialCapital - portfolioValue) / initialCapital 
          : 0;
        
        setRiskMetrics({
          totalRiskScore: Math.min(100, Math.round(
            (positions.length / 10) * 30 +
            Math.abs(portfolio.unrealizedPnL / portfolioValue) * 200 +
            drawdown * 100
          )),
          currentDrawdown: drawdown,
          maxDrawdown: 0.20,
          dailyPnLPercent: portfolio.realizedPnL / initialCapital,
          openPositionCount: positions.length,
          totalExposurePercent: positions.reduce((sum, p) => sum + (p.avgEntryPrice * p.quantity), 0) / portfolioValue,
          avgCorrelation: 0.65,
          riskLevel: stats.totalTrades > 10 ? 'MODERATE' : 'CONSERVATIVE',
          shouldHaltTrading: drawdown >= 0.20,
          haltReason: drawdown >= 0.20 ? 'Max drawdown exceeded' : undefined
        });
      }
    } catch (error) {
      console.error('Error fetching risk metrics:', error);
    }
  };

  const generateEquityCurve = () => {
    const curve: EquityPoint[] = [];
    let value = 10000;
    let peak = value;
    
    for (let i = 23; i >= 0; i--) {
      const change = (Math.random() - 0.48) * value * 0.015;
      value += change;
      peak = Math.max(peak, value);
      curve.push({
        time: `${23 - i}:00`,
        value: Math.round(value * 100) / 100,
        peak: Math.round(peak * 100) / 100
      });
    }
    setEquityCurve(curve);
  };

  const generateSignal = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trading/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol, timeframe: '1h', demo: true })
      });
      const data = await res.json();
      if (data.success) {
        const fullSignal = {
          ...data.data.signal,
          details: data.data.signalDetails,
          analysis: data.data.analysis,
          riskAssessment: data.data.riskAssessment,
        };
        setSignals((prev) => [fullSignal, ...prev].slice(0, 50));
        // Refresh risk metrics after new signal
        fetchRiskMetrics();
      }
    } catch (error) {
      console.error('Error generating signal:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedSymbol]);

  // Active Mode: toggle pair
  const toggleActivePair = useCallback((pair: string) => {
    setActivePairs(prev =>
      prev.includes(pair) ? prev.filter(p => p !== pair) : prev.length < 9 ? [...prev, pair] : prev
    );
  }, []);

  // Active Mode: toggle strategy
  const toggleActiveStrategy = useCallback((strategy: string) => {
    setActiveStrategies(prev =>
      prev.includes(strategy) ? prev.filter(s => s !== strategy) : prev.length < 5 ? [...prev, strategy] : prev
    );
  }, []);

  // Active Mode: run a single scan cycle
  const runActiveScan = useCallback(async () => {
    if (activePairs.length === 0 || activeStrategies.length === 0) return;
    setScanInProgress(true);
    try {
      const results = await Promise.allSettled([
        fetch('/api/trading/signals/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: activePairs, strategies: activeStrategies, timeframe: '1h' }),
        }).then(r => r.json()),
        ...(activeNewsEnabled ? [
          fetch('/api/trading/signals/news-signals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols: activePairs }),
          }).then(r => r.json()),
        ] : []),
      ]);

      const newSignals: ActiveScanSignal[] = [];

      // Process scan results
      const scanResult = results[0];
      if (scanResult.status === 'fulfilled' && scanResult.value.success) {
        for (const r of scanResult.value.data) {
          newSignals.push({
            signal: {
              id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              symbol: r.signal.symbol,
              action: r.signal.action as 'BUY' | 'SELL' | 'HOLD',
              confidence: r.signal.confidence,
              rating: r.signal.rating,
              reasoning: r.signal.reasoning,
              status: 'PENDING',
              createdAt: new Date().toISOString(),
              demo: true,
            },
            analysis: r.analysis,
            riskAssessment: r.riskAssessment,
            details: r.signalDetails,
            strategyName: r.strategyName,
            signalType: r.signalType,
            scannedAt: r.scannedAt,
          });
        }
      }

      // Process news results
      if (activeNewsEnabled && results[1]) {
        const newsResult = results[1];
        if (newsResult.status === 'fulfilled' && newsResult.value.success) {
          for (const ns of newsResult.value.data) {
            newSignals.push({
              signal: {
                id: `news-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                symbol: ns.symbol,
                action: ns.action as 'BUY' | 'SELL' | 'HOLD',
                confidence: ns.confidence,
                rating: Math.round(ns.confidence * 100),
                reasoning: ns.reasoning,
                status: 'PENDING',
                createdAt: new Date().toISOString(),
                demo: true,
              },
              strategyName: 'NEWS',
              signalType: 'NEWS',
              scannedAt: ns.generatedAt,
              sourceArticle: ns.sourceArticle,
              sentimentShift: ns.sentimentShift,
              indicators: ns.indicators,
            });
          }
        }
      }

      setLastScanTime(Date.now());
      setActiveScanSignals(prev => [...newSignals, ...prev].slice(0, 100));
    } catch (err) {
      console.error('Active scan error:', err);
    } finally {
      setScanInProgress(false);
    }
  }, [activePairs, activeStrategies, activeNewsEnabled]);

  // Active Mode: start/stop scanning
  useEffect(() => {
    if (activeScanning && activePairs.length > 0 && activeStrategies.length > 0) {
      // Run immediately
      runActiveScan();
      // Then set interval
      activeIntervalRef.current = setInterval(runActiveScan, activeScanInterval * 1000);
    } else {
      if (activeIntervalRef.current) {
        clearInterval(activeIntervalRef.current);
        activeIntervalRef.current = null;
      }
    }
    return () => {
      if (activeIntervalRef.current) {
        clearInterval(activeIntervalRef.current);
      }
    };
  }, [activeScanning, activeScanInterval]); // eslint-disable-line react-hooks/exhaustive-deps

  const placeDemoOrder = async (
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    opts?: { price?: number; stopLoss?: number; takeProfit?: number; leverage?: number }
  ) => {
    try {
      const price = opts?.price;
      if (price && price > 0) {
        // Ensure the demo trader has a current price for this symbol
        await fetch('/api/trading/demo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_price', symbol, price })
        });
      }

      const res = await fetch('/api/trading/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'place_order',
          symbol,
          side,
          type: 'MARKET',
          quantity,
          price: opts?.price,
          leverage: opts?.leverage,
          stopLoss: opts?.stopLoss,
          takeProfit: opts?.takeProfit
        })
      });
      const result = await res.json();
      if (!result.success) {
        console.error('Order failed:', result.error);
      }

      // Refresh portfolio + positions + history
      const [portRes, posRes] = await Promise.all([
        fetch('/api/trading/demo?action=portfolio'),
        fetch('/api/trading/demo?action=positions')
      ]);
      const portData = await portRes.json();
      const posData = await posRes.json();
      if (portData.success) setPortfolio(portData.data);
      if (posData.success) setPositions(posData.data);
      fetchTradeHistory();
    } catch (error) {
      console.error('Error placing order:', error);
    }
  };

  const closePosition = async (symbol: string) => {
    try {
      await fetch('/api/trading/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close_position', symbol })
      });
      fetchPositions();
    } catch (error) {
      console.error('Error closing position:', error);
    }
  };

  const closePositionPartial = async (symbol: string, percent: number) => {
    try {
      await fetch('/api/trading/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close_position_partial', symbol, percent })
      });
      fetchPositions();
    } catch (error) {
      console.error('Error closing position partially:', error);
    }
  };

  const setTrailingStop = async (symbol: string, distance: number) => {
    try {
      await fetch('/api/trading/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_trailing_stop', symbol, distance })
      });
    } catch (error) {
      console.error('Error setting trailing stop:', error);
    }
  };

  const resetDemo = async () => {
    try {
      await fetch('/api/trading/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', initialCapital: 10000 })
      });
      setPositions([]);
      setSignals([]);
      setRiskMetrics(null);
      setTradeHistory([]);
      setRealizedTrades([]);
      generateEquityCurve();
    } catch (error) {
      console.error('Error resetting demo:', error);
    }
  };

  // ── Exchange Account Management ──
  const fetchExchangeAccounts = async () => {
    try {
      const res = await fetch('/api/trading/settings');
      const data = await res.json();
      if (data.success) setExchangeAccounts(data.data);
    } catch (error) {
      console.error('Error fetching exchange accounts:', error);
    }
  };

  const saveExchangeAccount = async () => {
    try {
      const res = await fetch('/api/trading/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          ...(accountFormMode === 'edit' && editingAccountId ? { id: editingAccountId } : {}),
          name: newAccount.name,
          exchange: newAccount.exchange,
          apiKey: newAccount.apiKey,
          apiSecret: newAccount.apiSecret,
          testnet: newAccount.testnet,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewAccount({ name: 'Bybit Main', exchange: 'bybit', apiKey: '', apiSecret: '', testnet: true });
        setAccountFormMode('add');
        setEditingAccountId(null);
        fetchExchangeAccounts();
      }
    } catch (error) {
      console.error('Error saving account:', error);
    }
  };

  const testExchangeConnection = async (accountId: string) => {
    setConnectionStatus('testing');
    try {
      const res = await fetch('/api/trading/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_connection', id: accountId }),
      });
      const data = await res.json();
      if (data.success) {
        setConnectionStatus('connected');
        setLiveBalance({ totalEquity: data.data.totalEquity, totalAvailableBalance: data.data.availableBalance });
      } else {
        setConnectionStatus('error');
      }
      fetchExchangeAccounts();
      return data;
    } catch (error) {
      setConnectionStatus('error');
      console.error('Error testing connection:', error);
    }
  };

  const deleteExchangeAccount = async (accountId: string) => {
    try {
      await fetch('/api/trading/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: accountId }),
      });
      fetchExchangeAccounts();
    } catch (error) {
      console.error('Error deleting account:', error);
    }
  };

  const activateExchangeAccount = async (accountId: string) => {
    try {
      await fetch('/api/trading/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate', id: accountId }),
      });
      fetchExchangeAccounts();
    } catch (error) {
      console.error('Error activating account:', error);
    }
  };

  // ── Market Volume Monitoring ──
  const formatCompactVolume = (v: unknown): string => {
    const n = Number(v);
    if (!isFinite(n)) return '--';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(0);
  };

  const fetchMarketVolume = async () => {
    try {
      const res = await fetch('/api/trading/market?action=volume');
      const data = await res.json();
      if (data.success) setMarketVolumeData(data.data);
    } catch {}
  };

  // ── Live Trading Functions ──
  const fetchLiveData = async () => {
    if (tradingMode !== 'live') return;
    try {
      const [balRes, posRes] = await Promise.all([
        fetch('/api/trading/live?action=balance'),
        fetch('/api/trading/live?action=positions'),
      ]);
      const balData = await balRes.json();
      const posData = await posRes.json();
      if (balData.success) setLiveBalance({ totalEquity: balData.data.totalEquity, totalAvailableBalance: balData.data.totalAvailableBalance });
      if (posData.success) setLivePositions(posData.data);
    } catch (error) {
      console.error('Error fetching live data:', error);
    }
  };

  const placeLiveOrder = async (
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    opts?: { price?: number; stopLoss?: number; takeProfit?: number; leverage?: number }
  ) => {
    try {
      const res = await fetch('/api/trading/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'place_order',
          symbol,
          side,
          type: 'MARKET',
          quantity,
          price: opts?.price,
          stopLoss: opts?.stopLoss,
          takeProfit: opts?.takeProfit,
          leverage: opts?.leverage,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchLiveData();
      }
      return data;
    } catch (error) {
      console.error('Error placing live order:', error);
      return { success: false, error: 'Failed to place order' };
    }
  };

  const closeLivePosition = async (symbol: string, side?: 'LONG' | 'SHORT') => {
    try {
      const res = await fetch('/api/trading/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close_position', symbol, side }),
      });
      const data = await res.json();
      if (data.success) fetchLiveData();
      return data;
    } catch (error) {
      console.error('Error closing live position:', error);
      return { success: false, error: 'Failed to close position' };
    }
  };

  // Unified order placement based on trading mode
  const placeOrder = async (
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    opts?: { price?: number; stopLoss?: number; takeProfit?: number; leverage?: number }
  ) => {
    if (tradingMode === 'live') {
      return placeLiveOrder(symbol, side, quantity, opts);
    }
    return placeDemoOrder(symbol, side, quantity, opts);
  };

  // Unified close position based on trading mode
  const closeTrade = async (symbol: string) => {
    if (tradingMode === 'live') {
      return closeLivePosition(symbol);
    }
    return closePosition(symbol);
  };

  // ── Trade Order Panel Helpers ──
  const openOrderPanel = (signalId: string, details: SignalDetails | undefined, signalAction: 'BUY' | 'SELL' | 'HOLD', symbol: string) => {
    if (signalAction === 'HOLD') return;
    const balance = tradingMode === 'live' && liveBalance ? liveBalance.totalEquity : portfolio.totalValue;
    const price = details?.currentPrice || 0;
    const sl = details?.stopLoss?.price || 0;
    const tp = details?.takeProfitLevels?.[0]?.price || 0;
    const lev = details?.leverage?.recommended || 5;
    // Calculate quantity based on risk %
    const slDistance = sl > 0 && price > 0 ? Math.abs(price - sl) : price * 0.02; // default 2% SL
    const riskAmount = balance * 0.01; // 1% default risk
    const qty = slDistance > 0 ? riskAmount / slDistance : 0.01;

    setOrderForm({
      symbol, side: signalAction as 'BUY' | 'SELL', orderType: 'MARKET',
      entryPrice: price, quantity: Math.max(0.001, parseFloat(qty.toFixed(6))), leverage: lev,
      stopLoss: sl, takeProfit: tp, takeProfitLevel: 1,
      riskPercent: 1,
    });
    setExpandedOrderId(signalId);
  };

  const updateOrderRisk = (riskPct: number) => {
    const balance = tradingMode === 'live' && liveBalance ? liveBalance.totalEquity : portfolio.totalValue;
    const price = orderForm.entryPrice;
    const sl = orderForm.stopLoss;
    const slDistance = sl > 0 && price > 0 ? Math.abs(price - sl) : price * 0.02;
    const riskAmount = balance * (riskPct / 100);
    const qty = slDistance > 0 ? riskAmount / slDistance : 0.01;
    setOrderForm(prev => ({
      ...prev,
      riskPercent: riskPct,
      quantity: Math.max(0.001, parseFloat(qty.toFixed(6))),
    }));
  };

  const updateOrderQuantity = (qty: number) => {
    const balance = tradingMode === 'live' && liveBalance ? liveBalance.totalEquity : portfolio.totalValue;
    const price = orderForm.entryPrice;
    const sl = orderForm.stopLoss;
    const slDistance = sl > 0 && price > 0 ? Math.abs(price - sl) : price * 0.02;
    const riskAmount = qty * slDistance;
    const riskPct = balance > 0 ? (riskAmount / balance) * 100 : 0;
    setOrderForm(prev => ({
      ...prev,
      quantity: Math.max(0.001, parseFloat(qty.toFixed(6))),
      riskPercent: parseFloat(riskPct.toFixed(2)),
    }));
  };

  const updateOrderStopLoss = (sl: number) => {
    const balance = tradingMode === 'live' && liveBalance ? liveBalance.totalEquity : portfolio.totalValue;
    const price = orderForm.entryPrice;
    const qty = orderForm.quantity;
    const slDistance = price > 0 && sl > 0 ? Math.abs(price - sl) : price * 0.02;
    const riskAmount = qty * slDistance;
    const riskPct = balance > 0 ? (riskAmount / balance) * 100 : 0;
    setOrderForm(prev => ({
      ...prev,
      stopLoss: sl,
      riskPercent: parseFloat(riskPct.toFixed(2)),
    }));
  };

  const submitOrder = async () => {
    setOrderSubmitting(true);
    try {
      const livePrice = prices[orderForm.symbol]?.price;
      const price = orderForm.orderType === 'LIMIT'
        ? orderForm.entryPrice
        : (livePrice || orderForm.entryPrice || 0);
      await placeOrder(orderForm.symbol, orderForm.side, orderForm.quantity, {
        price,
        stopLoss: orderForm.stopLoss,
        takeProfit: orderForm.takeProfit,
        leverage: orderForm.leverage,
      });
      setExpandedOrderId(null);
    } finally {
      setOrderSubmitting(false);
    }
  };

  // Fetch exchange accounts on mount + live data polling
  useEffect(() => {
    fetchExchangeAccounts();
  }, []);

  useEffect(() => {
    if (tradingMode === 'live') {
      fetchLiveData();
      const interval = setInterval(fetchLiveData, 15000);
      return () => clearInterval(interval);
    }
  }, [tradingMode]);

  // Auto-sync demo data every 30 seconds to keep frontend in sync with persisted state
  useEffect(() => {
    const syncDemo = async () => {
      if (tradingMode !== 'demo') return;
      try {
        const res = await fetch('/api/trading/demo?action=sync');
        const data = await res.json();
        if (data.success) {
          if (data.data.portfolio) setPortfolio(data.data.portfolio);
          if (data.data.positions) setPositions(data.data.positions);
        }
      } catch {}
    };
    const interval = setInterval(syncDemo, 30000);
    return () => clearInterval(interval);
  }, [tradingMode]);

  // Auto-fetch market volume every 60 seconds (public data, always active)
  useEffect(() => {
    fetchMarketVolume();
    const interval = setInterval(fetchMarketVolume, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchPositions = async () => {
    try {
      const res = await fetch('/api/trading/demo?action=positions');
      const data = await res.json();
      if (data.success) {
        setPositions(data.data);
      }
      fetchRiskMetrics();
      fetchTradeHistory();
    } catch (error) {
      console.error('Error fetching positions:', error);
    }
  };

  const fetchTradeHistory = async () => {
    try {
      const [histRes, realRes] = await Promise.all([
        fetch('/api/trading/demo?action=history'),
        fetch('/api/trading/demo?action=realized_trades')
      ]);
      const histData = await histRes.json();
      const realData = await realRes.json();
      if (histData.success) setTradeHistory(histData.data);
      if (realData.success) setRealizedTrades(realData.data);
    } catch (error) {
      console.error('Error fetching trade history:', error);
    }
  };

  // Generate chart data for portfolio
  const portfolioChartData = [
    { name: 'Cash', value: portfolio.cashBalance },
    { name: 'Positions', value: Math.max(0, portfolio.totalValue - portfolio.cashBalance) }
  ];

  // Sentiment gauge data
  const sentimentValue = signals[0]?.sentimentScore || 0;
  const sentimentLabel = sentimentValue > 0.3 ? 'Bullish' : sentimentValue < -0.3 ? 'Bearish' : 'Neutral';
  const sentimentColor = sentimentValue > 0.3 ? 'text-green-500' : sentimentValue < -0.3 ? 'text-red-500' : 'text-yellow-500';

  // Signal quality score
  const signalQuality = signals[0]?.rating || 0;
  const qualityLabel = signalQuality >= 70 ? 'Strong' : signalQuality >= 40 ? 'Moderate' : 'Weak';
  const qualityColor = signalQuality >= 70 ? 'text-green-500' : signalQuality >= 40 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Risk Disclaimer Banner */}
        {showDisclaimer && (
          <Alert className="border-red-500/50 bg-red-500/10 relative">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertTitle className="text-red-500 font-bold flex items-center gap-2">
              ⚠️ RISK DISCLAIMER - IMPORTANT WARNING
            </AlertTitle>
            <AlertDescription className="text-sm space-y-2">
              <p><strong>This software is for EDUCATIONAL and DEMONSTRATION purposes ONLY.</strong></p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li><strong>Trading involves SUBSTANTIAL RISK</strong> - You could lose ALL your investment</li>
                <li><strong>NOT financial advice</strong> - AI signals are algorithmic suggestions only</li>
                <li><strong>No guarantee of profits</strong> - Past performance does NOT guarantee future results</li>
                <li><strong>Use PAPER TRADING mode</strong> - Test thoroughly before any live trading</li>
              </ul>
            </AlertDescription>
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 h-6 w-6 p-0"
              onClick={() => setShowDisclaimer(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </Alert>
        )}

        {/* Breaking News Alerts */}
        {breakingNews.length > 0 && (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <Flame className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-600 font-semibold">Breaking News</AlertTitle>
            <AlertDescription className="text-sm">
              <ScrollArea className="max-h-20">
                {breakingNews.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 py-1">
                    <Badge variant="destructive" className="text-xs shrink-0">ALERT</Badge>
                    <span className="truncate">{item.title}</span>
                  </div>
                ))}
              </ScrollArea>
            </AlertDescription>
          </Alert>
        )}

        {/* Risk Halt Alert */}
        {riskMetrics?.shouldHaltTrading && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Trading Halted - Risk Limit Exceeded</AlertTitle>
            <AlertDescription>{riskMetrics.haltReason}</AlertDescription>
          </Alert>
        )}

        {/* Auth Guard */}
        {status === 'loading' && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-8 w-8 animate-spin mr-3" />
            Loading...
          </div>
        )}
        {status === 'unauthenticated' && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Brain className="h-8 w-8 text-primary" />
              Mantle AI Trader
            </h1>
            <p className="text-muted-foreground text-center max-w-md">
              AI-powered cryptocurrency trading platform. Sign in to access your portfolio, place trades, and track your performance.
            </p>
            <div className="flex gap-3 mt-2">
              <Button onClick={() => window.location.href = '/login'}>
                Sign in
              </Button>
              <Button variant="outline" onClick={() => window.location.href = '/register'}>
                Create account
              </Button>
            </div>
          </div>
        )}

        {status === 'authenticated' && (
        <>
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Brain className="h-8 w-8 text-primary" />
              Mantle AI Trader
            </h1>
            <p className="text-muted-foreground">Fundamental News-Based Trading Bot</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={connected ? 'default' : 'secondary'} className="flex items-center gap-1">
              <Activity className={`h-3 w-3 ${connected ? 'animate-pulse' : ''}`} />
              {connected ? 'Connected' : 'Disconnected'}
            </Badge>
            {/* Demo / Live Mode Toggle */}
            <div className="flex items-center rounded-lg border bg-muted p-0.5">
              <button
                onClick={() => handleSetTradingMode('demo')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  tradingMode === 'demo'
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                DEMO
              </button>
              <button
                onClick={() => {
                  const activeAccount = exchangeAccounts.find(a => a.isActive);
                  if (!activeAccount) {
                    setShowSettings(true);
                    return;
                  }
                  handleSetTradingMode('live');
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  tradingMode === 'live'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                LIVE
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(true)}
              className={tradingMode === 'live' && connectionStatus === 'connected' ? 'border-green-500 text-green-500' : ''}
            >
              <Settings className="h-4 w-4 mr-1" />
              Platforms
            </Button>
            {tradingMode === 'demo' && (
              <Button variant="outline" size="sm" onClick={resetDemo}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Reset Demo
              </Button>
            )}
            {/* User Menu */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ callbackUrl: '/login' })}
              title="Sign out"
            >
              <User className="h-4 w-4 mr-1" />
              {session?.user?.name || session?.user?.email || 'User'}
            </Button>
          </div>
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Portfolio Value</CardDescription>
              <CardTitle className="text-2xl flex items-center">
                <DollarSign className="h-5 w-5 text-green-500 mr-1" />
                ${portfolio.totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={(portfolio.totalValue / 12000) * 100} className="h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Realized P&L</CardDescription>
              <CardTitle className={`text-2xl ${portfolio.realizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {portfolio.realizedPnL >= 0 ? '+' : ''}${portfolio.realizedPnL.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={portfolio.realizedPnL >= 0 ? 'default' : 'destructive'}>
                {portfolio.realizedPnL >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                {((portfolio.realizedPnL / 10000) * 100).toFixed(2)}%
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Unrealized P&L</CardDescription>
              <CardTitle className={`text-2xl ${portfolio.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {portfolio.unrealizedPnL >= 0 ? '+' : ''}${portfolio.unrealizedPnL.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">Open: {positions.length}</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Market Sentiment</CardDescription>
              <CardTitle className={`text-2xl ${sentimentColor}`}>{sentimentLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={(sentimentValue + 1) * 50} className="h-2" />
            </CardContent>
          </Card>
        </div>

        {/* Risk Management Panel */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className={riskMetrics?.shouldHaltTrading ? 'border-red-500' : ''}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Risk Score
              </CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <span className={riskMetrics?.totalRiskScore && riskMetrics.totalRiskScore > 60 ? 'text-red-500' : riskMetrics?.totalRiskScore && riskMetrics.totalRiskScore > 30 ? 'text-yellow-500' : 'text-green-500'}>
                  {riskMetrics?.totalRiskScore ?? 0}
                </span>
                <span className="text-sm text-muted-foreground">/100</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress 
                value={riskMetrics?.totalRiskScore ?? 0} 
                className="h-2"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Drawdown
              </CardDescription>
              <CardTitle className="text-2xl">
                {((riskMetrics?.currentDrawdown ?? 0) * 100).toFixed(1)}%
                <span className="text-sm text-muted-foreground ml-1">/ {((riskMetrics?.maxDrawdown ?? 0.2) * 100).toFixed(0)}%</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress 
                value={((riskMetrics?.currentDrawdown ?? 0) / (riskMetrics?.maxDrawdown ?? 0.2)) * 100} 
                className="h-2"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <GaugeIcon className="h-3 w-3" />
                Signal Quality
              </CardDescription>
              <CardTitle className={`text-2xl ${qualityColor}`}>
                {signalQuality}
                <span className="text-sm ml-1">{qualityLabel}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${
                    signalQuality >= 70 ? 'bg-green-500' : signalQuality >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${signalQuality}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                Exposure
              </CardDescription>
              <CardTitle className="text-2xl">
                {((riskMetrics?.totalExposurePercent ?? 0) * 100).toFixed(0)}%
                <span className="text-sm text-muted-foreground ml-1">exposed</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={riskMetrics?.riskLevel === 'AGGRESSIVE' ? 'destructive' : riskMetrics?.riskLevel === 'MODERATE' ? 'secondary' : 'default'}>
                {riskMetrics?.riskLevel ?? 'CONSERVATIVE'}
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Price Ticker */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Live Prices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {symbols.map((symbol) => {
                const priceData = prices[symbol];
                return (
                  <div
                    key={symbol}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedSymbol === symbol ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelectedSymbol(symbol)}
                  >
                    <div className="font-semibold">{symbol.replace('USDT', '')}</div>
                    <div className="text-lg font-mono">
                      ${priceData?.price?.toFixed(priceData?.price < 10 ? 4 : 2) || '---'}
                    </div>
                    <div className={`text-sm ${priceData?.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {priceData?.change >= 0 ? '+' : ''}{priceData?.change?.toFixed(2) || '0.00'}%
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Market Volume & Sentiment Monitor */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Market Volume Monitor</CardTitle>
                {marketVolumeData?.summary && (
                  <Badge variant="outline" className="text-[10px]">
                    {marketVolumeData.summary.exchangesResponding} sources &middot; live
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={fetchMarketVolume}
              >
                <RefreshCw className={`h-3 w-3 mr-1`} />
                Refresh
              </Button>
            </div>
            {marketVolumeData?.summary && (
              <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                <span>
                  Overall:{' '}
                  <span className={`font-semibold ${
                    marketVolumeData.summary.overallSentiment === 'strongly_bullish' ? 'text-green-400' :
                    marketVolumeData.summary.overallSentiment === 'bullish' ? 'text-green-500' :
                    marketVolumeData.summary.overallSentiment === 'strongly_bearish' ? 'text-red-400' :
                    marketVolumeData.summary.overallSentiment === 'bearish' ? 'text-red-500' :
                    'text-gray-400'
                  }`}>
                    {marketVolumeData.summary.overallSentiment.replace('_', ' ').toUpperCase()}
                  </span>
                </span>
                <span>Total Vol: <span className="font-semibold text-foreground">${formatCompactVolume(marketVolumeData.summary.totalMarketVolume)}</span></span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span> {marketVolumeData.summary.bullishCount} bullish
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-gray-400"></span> {marketVolumeData.summary.neutralCount} neutral
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span> {marketVolumeData.summary.bearishCount} bearish
                </span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!marketVolumeData ? (
              <div className="text-sm text-muted-foreground text-center py-8">Loading market data...</div>
            ) : (
              <div className="space-y-2">
                {marketVolumeData.instruments.map((inst) => {
                  const maxVolume = Math.max(...marketVolumeData.instruments.map(i => i.totalVolume24h), 1);
                  const volumePercent = (inst.totalVolume24h / maxVolume) * 100;
                  const sentimentColor = inst.sentiment === 'strongly_bullish' ? 'text-green-400 bg-green-500/10 border-green-500/30' :
                    inst.sentiment === 'bullish' ? 'text-green-500 bg-green-500/10 border-green-500/20' :
                    inst.sentiment === 'strongly_bearish' ? 'text-red-400 bg-red-500/10 border-red-500/30' :
                    inst.sentiment === 'bearish' ? 'text-red-500 bg-red-500/10 border-red-500/20' :
                    'text-gray-400 bg-gray-500/10 border-gray-500/20';
                  const sentimentEmoji = inst.sentiment === 'strongly_bullish' ? '▲▲' :
                    inst.sentiment === 'bullish' ? '▲' :
                    inst.sentiment === 'strongly_bearish' ? '▼▼' :
                    inst.sentiment === 'bearish' ? '▼' : '◆';
                  const exchangeList = Object.entries(inst.exchanges);
                  const selectedExchangeInst = inst.exchanges['binance'] || inst.exchanges['bybit'] || exchangeList[0]?.[1];

                  return (
                    <div
                      key={inst.symbol}
                      className={`rounded-lg border p-2.5 transition-colors cursor-pointer hover:bg-muted/50 ${
                        selectedSymbol === inst.symbol ? 'border-primary/50 bg-primary/5' : ''
                      }`}
                      onClick={() => setSelectedSymbol(inst.symbol)}
                    >
                      <div className="flex items-center gap-3">
                        {/* Symbol + Sentiment */}
                        <div className="flex items-center gap-2 w-36 shrink-0">
                          <span className="font-semibold text-sm">{inst.displayName}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${sentimentColor}`}>
                            {sentimentEmoji} {inst.sentiment.replace('_', ' ')}
                          </span>
                        </div>

                        {/* Volume Bar */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                            <span>24h Volume</span>
                            <span className="font-mono font-medium text-foreground">
                              ${inst.totalVolume24h > 0 ? formatCompactVolume(inst.totalVolume24h) : '---'}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                inst.avgChange24h >= 0 ? 'bg-green-500/70' : 'bg-red-500/70'
                              }`}
                              style={{ width: `${Math.max(volumePercent, 1)}%` }}
                            />
                          </div>
                          {/* Exchange breakdown mini bars */}
                          {exchangeList.length > 1 && (
                            <div className="flex gap-0.5 mt-0.5">
                              {exchangeList.map(([name, data]) => {
                                const share = inst.volumeDominance[name] || 0;
                                if (share < 0.5) return null;
                                return (
                                  <span key={name} className="text-[9px] text-muted-foreground">
                                    {name}: {share.toFixed(0)}%
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Price + Change */}
                        <div className="text-right shrink-0 w-28">
                          <div className="font-mono text-sm font-medium">
                            ${selectedExchangeInst ? selectedExchangeInst.price.toFixed(selectedExchangeInst.price < 10 ? 4 : 2) : '---'}
                          </div>
                          <div className={`text-xs font-mono font-medium ${
                            inst.avgChange24h >= 0 ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {inst.avgChange24h >= 0 ? '+' : ''}{inst.avgChange24h.toFixed(2)}%
                          </div>
                        </div>

                        {/* Range + Sources */}
                        <div className="text-right shrink-0 w-28 text-[10px] text-muted-foreground">
                          {inst.priceRange24h.high > 0 && (
                            <>
                              <div>H: ${inst.priceRange24h.high.toFixed(inst.priceRange24h.high < 10 ? 4 : 2)}</div>
                              <div>L: ${inst.priceRange24h.low.toFixed(inst.priceRange24h.low < 10 ? 4 : 2)}</div>
                              <div className="text-muted-foreground/60">R: {inst.priceRange24h.percent.toFixed(1)}%</div>
                            </>
                          )}
                          <div className="mt-0.5">
                            {exchangeList.map(([name]) => (
                              <span key={name} className="inline-block mr-1 px-1 py-px rounded bg-muted/60 text-[8px] uppercase">
                                {name.slice(0, 3)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full max-w-lg">
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="backtest">Backtest</TabsTrigger>
            <TabsTrigger value="news">News</TabsTrigger>
          </TabsList>

          {/* Signals Tab */}
          <TabsContent value="signals" className="space-y-4">
            {/* Active Mode Toggle Bar */}
            <Card className="border-primary/30">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Radio className={`h-5 w-5 ${activeMode ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
                    <div>
                      <span className="font-semibold text-sm">Active Mode</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {activeScanning
                          ? `Scanning ${activePairs.length} pairs × ${activeStrategies.length} strategies${activeNewsEnabled ? ' + news' : ''}`
                          : activeMode ? 'Configured — ready to scan' : 'Auto-scan multiple pairs with multiple strategies'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {activeScanning && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className={`w-2 h-2 rounded-full ${scanInProgress ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
                        {scanInProgress ? 'Scanning...' : 'Idle'}
                        {lastScanTime > 0 && (
                          <span>· Last scan {Math.round((Date.now() - lastScanTime) / 1000)}s ago</span>
                        )}
                      </div>
                    )}
                    {activeMode && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Interval:</span>
                        <select
                          value={activeScanInterval}
                          onChange={(e) => setActiveScanInterval(Number(e.target.value))}
                          className="text-xs px-2 py-1 rounded border bg-background"
                          disabled={activeScanning}
                        >
                          {SCAN_INTERVALS.map(i => (
                            <option key={i.value} value={i.value}>{i.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <Button
                      variant={activeScanning ? 'destructive' : 'default'}
                      size="sm"
                      onClick={() => {
                        if (activeScanning) {
                          setActiveScanning(false);
                        } else {
                          setActiveMode(true);
                          setActiveShowConfig(false);
                          setActiveScanning(true);
                        }
                      }}
                    >
                      {activeScanning ? (
                        <><Square className="h-3 w-3 mr-1" /> Stop</>
                      ) : (
                        <><Radio className="h-3 w-3 mr-1" /> Start Scanning</>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Mode Config Panel */}
            {activeMode && activeShowConfig && (
              <Card className="border-dashed">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Active Mode Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Pair Selector */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">Trading Pairs (click to toggle)</div>
                    <div className="flex flex-wrap gap-2">
                      {ALL_SYMBOLS.map(pair => (
                        <Badge
                          key={pair}
                          variant={activePairs.includes(pair) ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => toggleActivePair(pair)}
                        >
                          {pair.replace('USDT', '')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {/* Strategy Selector */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">Strategies (click to toggle)</div>
                    <div className="flex flex-wrap gap-2">
                      {STRATEGY_OPTIONS.map(s => (
                        <Badge
                          key={s.value}
                          variant={activeStrategies.includes(s.value) ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => toggleActiveStrategy(s.value)}
                          title={s.desc}
                        >
                          {s.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {/* News Signals Toggle */}
                  <div className="flex items-center gap-3">
                    <Button
                      variant={activeNewsEnabled ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setActiveNewsEnabled(!activeNewsEnabled)}
                    >
                      <NewspaperIcon className="h-3 w-3 mr-1" />
                      News Signals: {activeNewsEnabled ? 'ON' : 'OFF'}
                    </Button>
                    <span className="text-xs text-muted-foreground">Generate signals from breaking/high-impact news events</span>
                  </div>
                  {/* Start Button */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => {
                        setActiveShowConfig(false);
                        setActiveScanning(true);
                      }}
                      disabled={activePairs.length === 0 || activeStrategies.length === 0}
                    >
                      <Radio className="h-4 w-4 mr-1" />
                      Start Scanning ({activePairs.length} pairs × {activeStrategies.length} strategies)
                    </Button>
                    <Button variant="ghost" onClick={() => setActiveMode(false)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Active Mode Live Signal Feed */}
            {activeMode && activeScanSignals.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ScanSearch className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm">Live Scan Feed</CardTitle>
                      <Badge variant="secondary">{activeScanSignals.length} signals</Badge>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setActiveScanSignals([])}>
                      <X className="h-3 w-3 mr-1" /> Clear
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-4">
                      {activeScanSignals.map((as) => (
                        <Card key={as.signal.id} className={`p-4 space-y-4 ${as.scannedAt && Date.now() - new Date(as.scannedAt).getTime() < 5000 ? 'ring-1 ring-primary/50' : ''}`}>
                          {/* === HEADER === */}
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <Badge
                                variant={as.signal.action === 'BUY' ? 'default' : as.signal.action === 'SELL' ? 'destructive' : 'secondary'}
                                className="text-lg px-4 py-1.5 font-bold"
                              >
                                {as.signal.action === 'BUY' ? <ArrowUpRight className="h-4 w-4 mr-1" /> : as.signal.action === 'SELL' ? <ArrowDownRight className="h-4 w-4 mr-1" /> : null}
                                {as.signal.action}
                              </Badge>
                              <div>
                                <div className="font-bold text-lg">{as.signal.symbol}</div>
                                <div className="text-xs text-muted-foreground">
                                  Confidence: {(as.signal.confidence * 100).toFixed(0)}% &middot; Quality: {as.signal.rating}/100
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {as.strategyName === 'NEWS' ? (
                                  <><NewspaperIcon className="h-3 w-3 mr-1" /> NEWS</>
                                ) : (
                                  <><Brain className="h-3 w-3 mr-1" /> {as.strategyName}</>
                                )}
                              </Badge>
                            </div>
                            <div className="text-right flex items-center gap-3">
                              {as.details && (
                                <div className="text-right">
                                  <div className="text-xs text-muted-foreground">Current Price</div>
                                  <div className="font-mono font-bold text-lg">
                                    ${as.details.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                  </div>
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                {as.scannedAt ? new Date(as.scannedAt).toLocaleTimeString() : ''}
                              </div>
                            </div>
                          </div>

                          {/* News signal extras */}
                          {as.signalType === 'NEWS' && as.indicators && (
                            <div className="flex flex-wrap gap-1">
                              {as.indicators.topicKeywords?.slice(0, 4).map((kw, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px]">{kw}</Badge>
                              ))}
                              <Badge variant="outline" className="text-[10px]">
                                {as.indicators.articleCount || 0} articles &middot; {as.indicators.highImpactCount || 0} high-impact
                              </Badge>
                              {as.sourceArticle && (
                                <span className="text-xs text-muted-foreground italic">{as.sourceArticle}</span>
                              )}
                            </div>
                          )}

                          {/* === FULL PROFESSIONAL SIGNAL DETAILS === */}
                          {as.details && (
                            <div className="space-y-4">
                              <Separator />

                              {/* Row: Entry + SL + TP + R:R + Leverage + Time */}
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                {/* Entry Zone */}
                                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                  <div className="flex items-center gap-1 text-xs text-blue-400 mb-1">
                                    <Crosshair className="h-3 w-3" /> Entry Zone
                                  </div>
                                  <div className="font-mono font-semibold text-sm">
                                    ${as.details.entryZone.low.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                  </div>
                                  <div className="text-xs text-muted-foreground">to</div>
                                  <div className="font-mono font-semibold text-sm">
                                    ${as.details.entryZone.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                  </div>
                                  <Badge variant="outline" className="text-[10px] mt-1">{as.details.entryZone.strategy}</Badge>
                                </div>

                                {/* Stop Loss */}
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                  <div className="flex items-center gap-1 text-xs text-red-400 mb-1">
                                    <ShieldAlert className="h-3 w-3" /> Stop Loss
                                  </div>
                                  <div className="font-mono font-semibold text-sm text-red-400">
                                    ${as.details.stopLoss.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                  </div>
                                  <div className="text-xs text-red-300">
                                    {as.details.stopLoss.percentFromEntry >= 0 ? '+' : ''}{as.details.stopLoss.percentFromEntry.toFixed(1)}%
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-1">{as.details.stopLoss.type}</div>
                                </div>

                                {/* TP Levels */}
                                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                  <div className="flex items-center gap-1 text-xs text-green-400 mb-1">
                                    <Target className="h-3 w-3" /> Take Profits
                                  </div>
                                  {as.details.takeProfitLevels.map((tp) => (
                                    <div key={tp.level} className="flex justify-between text-[11px]">
                                      <span className="text-green-300">TP{tp.level}</span>
                                      <span className="font-mono">
                                        ${tp.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        <span className="text-green-400 ml-1">({tp.percentFromEntry >= 0 ? '+' : ''}{tp.percentFromEntry.toFixed(1)}%)</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>

                                {/* Risk:Reward */}
                                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                                  <div className="flex items-center gap-1 text-xs text-purple-400 mb-1">
                                    <Activity className="h-3 w-3" /> Risk : Reward
                                  </div>
                                  <div className="font-bold text-lg text-purple-300">
                                    1 : {as.details.riskRewardRatio.toFixed(1)}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-1">
                                    {as.details.riskRewardRatio >= 2 ? 'Favorable' : as.details.riskRewardRatio >= 1 ? 'Moderate' : 'Unfavorable'}
                                  </div>
                                </div>

                                {/* Leverage */}
                                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                  <div className="flex items-center gap-1 text-xs text-amber-400 mb-1">
                                    <Zap className="h-3 w-3" /> Leverage
                                  </div>
                                  <div className="font-bold text-lg text-amber-300">
                                    {as.details.leverage.min}x - {as.details.leverage.max}x
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-1">
                                    Rec: {as.details.leverage.recommended}x
                                  </div>
                                </div>

                                {/* Time Horizon */}
                                <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                                  <div className="flex items-center gap-1 text-xs text-cyan-400 mb-1">
                                    <Timer className="h-3 w-3" /> Time Horizon
                                  </div>
                                  <div className="font-bold text-sm text-cyan-300">
                                    {as.details.timeHorizon}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-1">
                                    {as.details.volatility.label} vol
                                  </div>
                                </div>
                              </div>

                              {/* TP position sizing guide */}
                              <div className="flex gap-2">
                                {as.details.takeProfitLevels.map((tp) => (
                                  <div key={tp.level} className="flex-1 p-2 rounded border text-center text-xs">
                                    <div className="text-muted-foreground">TP{tp.level} — close {tp.positionPercent}%</div>
                                    <div className="text-muted-foreground text-[10px]">{tp.description}</div>
                                  </div>
                                ))}
                              </div>

                              {/* Score bars */}
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Technical:</span>
                                  <Progress value={(as.analysis?.technicalAnalysis?.score || 0) * 100} className="h-2 mt-1" />
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Sentiment:</span>
                                  <Progress value={((as.analysis?.sentimentAnalysis?.overallSentiment || 0) + 1) * 50} className="h-2 mt-1" />
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Fundamental:</span>
                                  <Progress value={(as.analysis?.fundamentalAnalysis?.score || 0) * 100} className="h-2 mt-1" />
                                </div>
                              </div>

                              <Separator />

                              {/* Market Context */}
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                  <BarChart3 className="h-4 w-4" /> Market Context
                                </div>
                                <p className="text-sm text-muted-foreground">{as.details.marketContext}</p>
                              </div>

                              {/* Price Action */}
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                  <CandlestickChart className="h-4 w-4" /> Price Action
                                </div>
                                <ul className="space-y-1">
                                  {as.details.priceActionNotes.map((note, i) => (
                                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                      <span className="text-primary mt-0.5">&#8226;</span> {note}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              {/* Indicator Summary */}
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                  <Layers className="h-4 w-4" /> Indicators
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                  {as.details.indicatorSummary.map((ind, i) => (
                                    <div key={i} className="p-2 rounded border text-xs">
                                      <div className="flex justify-between items-center">
                                        <span className="font-medium">{ind.name}</span>
                                        <Badge variant={ind.signal === 'BULLISH' ? 'default' : ind.signal === 'BEARISH' ? 'destructive' : 'secondary'} className="text-[10px]">
                                          {ind.signal}
                                        </Badge>
                                      </div>
                                      <div className="font-mono text-muted-foreground">{ind.value.toFixed(1)}</div>
                                      <div className="text-muted-foreground text-[10px]">{ind.note}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Key Levels */}
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                  <Layers className="h-4 w-4" /> Key Levels
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-green-500">Support:</span>{' '}
                                    {as.details.keyLevels.supports.length > 0
                                      ? as.details.keyLevels.supports.map(s => `$${s.toLocaleString(undefined, { maximumFractionDigits: 2 })}`).join(', ')
                                      : `$${as.details.keyLevels.nearestSupport.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                                  </div>
                                  <div>
                                    <span className="text-red-500">Resistance:</span>{' '}
                                    {as.details.keyLevels.resistances.length > 0
                                      ? as.details.keyLevels.resistances.map(r => `$${r.toLocaleString(undefined, { maximumFractionDigits: 2 })}`).join(', ')
                                      : `$${as.details.keyLevels.nearestResistance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                                  </div>
                                </div>
                              </div>

                              {/* Pattern Analysis */}
                              {as.details.patternAnalysis.detected.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                    <CandlestickChart className="h-4 w-4" /> Pattern Analysis
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {as.details.patternAnalysis.detected.map((p, i) => (
                                      <Badge key={i} variant="outline">{p}</Badge>
                                    ))}
                                    <Badge variant="secondary" className="text-[10px]">
                                      Reliability: {as.details.patternAnalysis.reliability}
                                    </Badge>
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1">{as.details.patternAnalysis.summary}</div>
                                </div>
                              )}

                              {/* Fundamental Catalysts */}
                              {as.details.fundamentalCatalysts.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                    <Newspaper className="h-4 w-4" /> Fundamental Catalysts
                                  </div>
                                  <ul className="space-y-1">
                                    {as.details.fundamentalCatalysts.map((cat, i) => (
                                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                        <span className="text-amber-500 mt-0.5">&#8226;</span> {cat}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* AI Reasoning */}
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                  <Brain className="h-4 w-4" /> AI Reasoning
                                </div>
                                <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">{as.signal.reasoning}</p>
                              </div>

                              {/* Warnings */}
                              {as.analysis?.warnings && as.analysis.warnings.length > 0 && (
                                <div className="space-y-1">
                                  {as.analysis.warnings.map((w, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs text-amber-600 bg-amber-500/10 p-2 rounded">
                                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {w}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Trade Actions */}
                          <div className="flex gap-2">
                            {as.signal.action !== 'HOLD' && (
                              <>
                                {expandedOrderId !== as.signal.id ? (
                                  <Button size="sm" variant="default" className="h-7 text-xs"
                                    onClick={() => openOrderPanel(as.signal.id, as.details, as.signal.action, as.signal.symbol)}
                                  >
                                    <Crosshair className="h-3 w-3 mr-1" /> Open Order Panel
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" className="h-7 text-xs"
                                    onClick={() => setExpandedOrderId(null)}
                                  >
                                    <ChevronUp className="h-3 w-3 mr-1" /> Close Panel
                                  </Button>
                                )}
                              </>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 text-xs"
                              onClick={() => setActiveScanSignals(prev => prev.filter(s => s.signal.id !== as.signal.id))}
                            >
                              <X className="h-3 w-3 mr-1" /> Dismiss
                            </Button>
                          </div>

                          {/* Trade Order Panel */}
                          {expandedOrderId === as.signal.id && (
                            <div className="mt-3 p-3 rounded-lg border bg-card space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                  <Crosshair className="h-4 w-4 text-primary" />
                                  Trade Order
                                  <Badge className={`text-[10px] ${tradingMode === 'live' ? 'bg-red-600' : 'bg-green-600'}`}>
                                    {tradingMode.toUpperCase()}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Balance: ${(tradingMode === 'live' && liveBalance ? liveBalance.totalEquity : portfolio.totalValue).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Symbol</label>
                                  <div className="text-sm font-bold mt-0.5">{orderForm.symbol}</div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Direction</label>
                                  <div className="flex gap-1 mt-0.5">
                                    <button onClick={() => setOrderForm(p => ({ ...p, side: 'BUY' }))}
                                      className={`flex-1 text-xs py-1 rounded font-semibold transition-colors ${orderForm.side === 'BUY' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}
                                    >BUY</button>
                                    <button onClick={() => setOrderForm(p => ({ ...p, side: 'SELL' }))}
                                      className={`flex-1 text-xs py-1 rounded font-semibold transition-colors ${orderForm.side === 'SELL' ? 'bg-red-600 text-white' : 'bg-muted text-muted-foreground'}`}
                                    >SELL</button>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Order Type</label>
                                  <div className="flex gap-1 mt-0.5">
                                    <button onClick={() => setOrderForm(p => ({ ...p, orderType: 'MARKET' }))}
                                      className={`flex-1 text-xs py-1 rounded font-semibold transition-colors ${orderForm.orderType === 'MARKET' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                                    >Market</button>
                                    <button onClick={() => setOrderForm(p => ({ ...p, orderType: 'LIMIT' }))}
                                      className={`flex-1 text-xs py-1 rounded font-semibold transition-colors ${orderForm.orderType === 'LIMIT' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                                    >Limit</button>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Leverage</label>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <input type="range" min="1" max="100" value={orderForm.leverage}
                                      onChange={e => setOrderForm(p => ({ ...p, leverage: parseInt(e.target.value) }))}
                                      className="flex-1 h-1 accent-primary" />
                                    <span className="text-xs font-mono w-8 text-right">{orderForm.leverage}x</span>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Entry Price</label>
                                  <Input type="number" step="any" className="h-7 text-xs font-mono mt-0.5"
                                    value={orderForm.entryPrice || ''}
                                    onChange={e => setOrderForm(p => ({ ...p, entryPrice: parseFloat(e.target.value) || 0 }))}
                                    disabled={orderForm.orderType === 'MARKET'}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Stop Loss</label>
                                  <Input type="number" step="any" className="h-7 text-xs font-mono mt-0.5 text-red-400"
                                    value={orderForm.stopLoss || ''}
                                    onChange={e => updateOrderStopLoss(parseFloat(e.target.value) || 0)}
                                    placeholder="SL price"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Take Profit</label>
                                  <Input type="number" step="any" className="h-7 text-xs font-mono mt-0.5 text-green-400"
                                    value={orderForm.takeProfit || ''}
                                    onChange={e => setOrderForm(p => ({ ...p, takeProfit: parseFloat(e.target.value) || 0 }))}
                                    placeholder="TP price"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Quantity</label>
                                  <Input type="number" step="any" className="h-7 text-xs font-mono mt-0.5"
                                    value={orderForm.quantity || ''}
                                    onChange={e => updateOrderQuantity(parseFloat(e.target.value) || 0)}
                                  />
                                </div>
                              </div>

                              {/* Risk Management */}
                              <div className="rounded-lg border p-2.5 bg-muted/30 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-muted-foreground">Risk Management</span>
                                  <span className="text-xs text-muted-foreground">
                                    Risk: <span className={`font-bold ${orderForm.riskPercent > 3 ? 'text-red-500' : orderForm.riskPercent > 1 ? 'text-amber-500' : 'text-green-500'}`}>
                                      ${((tradingMode === 'live' && liveBalance ? liveBalance.totalEquity : portfolio.totalValue) * orderForm.riskPercent / 100).toFixed(2)}
                                    </span> ({orderForm.riskPercent.toFixed(2)}%)
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input type="range" min="0.1" max="10" step="0.1" value={orderForm.riskPercent}
                                    onChange={e => updateOrderRisk(parseFloat(e.target.value))}
                                    className="flex-1 h-1 accent-primary" />
                                  <div className="flex gap-1">
                                    {[0.5, 1, 2, 3, 5].map(pct => (
                                      <button key={pct} onClick={() => updateOrderRisk(pct)}
                                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                                          Math.abs(orderForm.riskPercent - pct) < 0.15
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                                        }`}
                                      >{pct}%</button>
                                    ))}
                                  </div>
                                </div>
                                {/* TP Level selector */}
                                {as.details?.takeProfitLevels && as.details.takeProfitLevels.length > 1 && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] text-muted-foreground">TP Level:</span>
                                    {as.details.takeProfitLevels.map((tp, i) => (
                                      <button key={i} onClick={() => setOrderForm(p => ({
                                        ...p, takeProfit: tp.price, takeProfitLevel: i + 1
                                      }))}
                                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                                          orderForm.takeProfitLevel === i + 1
                                            ? 'bg-green-600 text-white'
                                            : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                                        }`}
                                      >TP{tp.level} (+{tp.percentFromEntry.toFixed(1)}%)</button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Order Summary */}
                              <div className="flex items-center justify-between p-2 rounded bg-muted/50 text-xs">
                                <div className="space-y-0.5">
                                  <div className="text-muted-foreground">Position Size: <span className="font-mono font-bold text-foreground">${(orderForm.quantity * orderForm.entryPrice * orderForm.leverage).toFixed(2)}</span></div>
                                  <div className="text-muted-foreground">Margin Required: <span className="font-mono font-bold text-foreground">${(orderForm.quantity * orderForm.entryPrice).toFixed(2)}</span></div>
                                </div>
                                <div className="text-right space-y-0.5">
                                  <div className="text-muted-foreground">SL Distance: <span className="font-mono text-red-400">
                                    {orderForm.entryPrice > 0 && orderForm.stopLoss > 0
                                      ? `${((Math.abs(orderForm.entryPrice - orderForm.stopLoss) / orderForm.entryPrice) * 100).toFixed(2)}%`
                                      : '—'}
                                  </span></div>
                                  <div className="text-muted-foreground">R:R: <span className="font-mono text-green-400">
                                    {orderForm.entryPrice > 0 && orderForm.stopLoss > 0 && orderForm.takeProfit > 0
                                      ? `${(Math.abs(orderForm.takeProfit - orderForm.entryPrice) / Math.abs(orderForm.entryPrice - orderForm.stopLoss)).toFixed(1)}:1`
                                      : '—'}
                                  </span></div>
                                </div>
                              </div>

                              <Button
                                className="w-full h-8"
                                variant={orderForm.side === 'BUY' ? 'default' : 'destructive'}
                                disabled={orderSubmitting || orderForm.quantity <= 0 || orderForm.entryPrice <= 0}
                                onClick={submitOrder}
                              >
                                {orderSubmitting ? (
                                  <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Submitting...</>
                                ) : (
                                  <><Play className="h-3 w-3 mr-1" />
                                    {orderForm.side === 'BUY' ? 'BUY' : 'SELL'} {orderForm.symbol}
                                    {orderForm.orderType === 'LIMIT' && ` @ $${orderForm.entryPrice}`}
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Manual Signal Generator */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>AI Trading Signals</CardTitle>
                    <CardDescription>
                      {activeMode ? 'Manual signal generation (Active Mode scanning above)' : 'AI-generated signals with quality scoring'}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={selectedSymbol}
                      onChange={(e) => setSelectedSymbol(e.target.value)}
                      className="px-3 py-2 rounded-md border bg-background"
                    >
                      {symbols.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <Button onClick={generateSignal} disabled={loading}>
                      {loading ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Brain className="h-4 w-4 mr-1" />
                      )}
                      Generate Signal
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  {signals.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <Target className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No manual signals yet. Generate one above or enable Active Mode for auto-scanning.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {signals.map((signal) => (
                        <Card key={signal.id} className="p-4 space-y-4">
                          {/* === HEADER === */}
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <Badge
                                variant={signal.action === 'BUY' ? 'default' : signal.action === 'SELL' ? 'destructive' : 'secondary'}
                                className="text-lg px-4 py-1.5 font-bold"
                              >
                                {signal.action === 'BUY' ? (
                                  <ArrowUpRight className="h-4 w-4 mr-1" />
                                ) : signal.action === 'SELL' ? (
                                  <ArrowDownRight className="h-4 w-4 mr-1" />
                                ) : null}
                                {signal.action}
                              </Badge>
                              <div>
                                <div className="font-bold text-lg">{signal.symbol}</div>
                                <div className="text-xs text-muted-foreground">
                                  Confidence: {(signal.confidence * 100).toFixed(0)}% &middot; Quality: {signal.rating}/100
                                </div>
                              </div>
                            </div>
                            <div className="text-right flex items-center gap-3">
                              {signal.details && (
                                <div className="text-right">
                                  <div className="text-xs text-muted-foreground">Current Price</div>
                                  <div className="font-mono font-bold text-lg">
                                    ${signal.details.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                  </div>
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                {new Date(signal.createdAt).toLocaleString()}
                              </div>
                            </div>
                          </div>

                          {/* === PROFESSIONAL SIGNAL DETAILS === */}
                          {signal.details && (
                            <div className="space-y-4">
                              <Separator />

                              {/* Row: Entry + SL + TP + R:R + Leverage + Time */}
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                {/* Entry Zone */}
                                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                  <div className="flex items-center gap-1 text-xs text-blue-400 mb-1">
                                    <Crosshair className="h-3 w-3" /> Entry Zone
                                  </div>
                                  <div className="font-mono font-semibold text-sm">
                                    ${signal.details.entryZone.low.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                  </div>
                                  <div className="text-xs text-muted-foreground">to</div>
                                  <div className="font-mono font-semibold text-sm">
                                    ${signal.details.entryZone.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                  </div>
                                  <Badge variant="outline" className="text-[10px] mt-1">{signal.details.entryZone.strategy}</Badge>
                                </div>

                                {/* Stop Loss */}
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                  <div className="flex items-center gap-1 text-xs text-red-400 mb-1">
                                    <ShieldAlert className="h-3 w-3" /> Stop Loss
                                  </div>
                                  <div className="font-mono font-semibold text-sm text-red-400">
                                    ${signal.details.stopLoss.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                  </div>
                                  <div className="text-xs text-red-300">
                                    {signal.details.stopLoss.percentFromEntry >= 0 ? '+' : ''}{signal.details.stopLoss.percentFromEntry.toFixed(1)}%
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-1">{signal.details.stopLoss.type}</div>
                                </div>

                                {/* TP Levels */}
                                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                  <div className="flex items-center gap-1 text-xs text-green-400 mb-1">
                                    <Target className="h-3 w-3" /> Take Profits
                                  </div>
                                  {signal.details.takeProfitLevels.map((tp) => (
                                    <div key={tp.level} className="flex justify-between text-[11px]">
                                      <span className="text-green-300">TP{tp.level}</span>
                                      <span className="font-mono">
                                        ${tp.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        <span className="text-green-400 ml-1">({tp.percentFromEntry >= 0 ? '+' : ''}{tp.percentFromEntry.toFixed(1)}%)</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>

                                {/* Risk:Reward */}
                                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                                  <div className="flex items-center gap-1 text-xs text-purple-400 mb-1">
                                    <Activity className="h-3 w-3" /> Risk : Reward
                                  </div>
                                  <div className="font-bold text-lg text-purple-300">
                                    1 : {signal.details.riskRewardRatio.toFixed(1)}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-1">
                                    {signal.details.riskRewardRatio >= 2 ? 'Favorable' : signal.details.riskRewardRatio >= 1 ? 'Moderate' : 'Unfavorable'}
                                  </div>
                                </div>

                                {/* Leverage */}
                                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                  <div className="flex items-center gap-1 text-xs text-amber-400 mb-1">
                                    <Zap className="h-3 w-3" /> Leverage
                                  </div>
                                  <div className="font-bold text-lg text-amber-300">
                                    {signal.details.leverage.min}x - {signal.details.leverage.max}x
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-1">
                                    Rec: {signal.details.leverage.recommended}x
                                  </div>
                                </div>

                                {/* Time Horizon */}
                                <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                                  <div className="flex items-center gap-1 text-xs text-cyan-400 mb-1">
                                    <Timer className="h-3 w-3" /> Time Horizon
                                  </div>
                                  <div className="font-bold text-sm text-cyan-300">
                                    {signal.details.timeHorizon}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-1">
                                    {signal.details.volatility.label} vol
                                  </div>
                                </div>
                              </div>

                              {/* TP position sizing guide */}
                              <div className="flex gap-2">
                                {signal.details.takeProfitLevels.map((tp) => (
                                  <div key={tp.level} className="flex-1 p-2 rounded border text-center text-xs">
                                    <div className="text-muted-foreground">TP{tp.level} — close {tp.positionPercent}%</div>
                                    <div className="text-muted-foreground text-[10px]">{tp.description}</div>
                                  </div>
                                ))}
                              </div>

                              {/* Score bars */}
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Technical:</span>
                                  <Progress value={(signal.analysis?.technicalAnalysis?.score || 0) * 100} className="h-2 mt-1" />
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Sentiment:</span>
                                  <Progress value={((signal.analysis?.sentimentAnalysis?.overallSentiment || 0) + 1) * 50} className="h-2 mt-1" />
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Fundamental:</span>
                                  <Progress value={(signal.analysis?.fundamentalAnalysis?.score || 0) * 100} className="h-2 mt-1" />
                                </div>
                              </div>

                              <Separator />

                              {/* Market Context */}
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                  <BarChart3 className="h-4 w-4" /> Market Context
                                </div>
                                <p className="text-sm text-muted-foreground">{signal.details.marketContext}</p>
                              </div>

                              {/* Price Action */}
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                  <CandlestickChart className="h-4 w-4" /> Price Action
                                </div>
                                <ul className="space-y-1">
                                  {signal.details.priceActionNotes.map((note, i) => (
                                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                      <span className="text-primary mt-0.5">&#8226;</span> {note}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              {/* Indicator Summary */}
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                  <Layers className="h-4 w-4" /> Indicators
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                  {signal.details.indicatorSummary.map((ind, i) => (
                                    <div key={i} className="p-2 rounded border text-xs">
                                      <div className="flex justify-between items-center">
                                        <span className="font-medium">{ind.name}</span>
                                        <Badge variant={ind.signal === 'BULLISH' ? 'default' : ind.signal === 'BEARISH' ? 'destructive' : 'secondary'} className="text-[10px]">
                                          {ind.signal}
                                        </Badge>
                                      </div>
                                      <div className="font-mono text-muted-foreground">{ind.value.toFixed(1)}</div>
                                      <div className="text-muted-foreground text-[10px]">{ind.note}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Key Levels */}
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                  <Layers className="h-4 w-4" /> Key Levels
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-green-500">Support:</span>{' '}
                                    {signal.details.keyLevels.supports.length > 0
                                      ? signal.details.keyLevels.supports.map(s => `$${s.toLocaleString(undefined, { maximumFractionDigits: 2 })}`).join(', ')
                                      : `$${signal.details.keyLevels.nearestSupport.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                                  </div>
                                  <div>
                                    <span className="text-red-500">Resistance:</span>{' '}
                                    {signal.details.keyLevels.resistances.length > 0
                                      ? signal.details.keyLevels.resistances.map(r => `$${r.toLocaleString(undefined, { maximumFractionDigits: 2 })}`).join(', ')
                                      : `$${signal.details.keyLevels.nearestResistance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                                  </div>
                                </div>
                              </div>

                              {/* Pattern Analysis */}
                              {signal.details.patternAnalysis.detected.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                    <CandlestickChart className="h-4 w-4" /> Pattern Analysis
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {signal.details.patternAnalysis.detected.map((p, i) => (
                                      <Badge key={i} variant="outline">{p}</Badge>
                                    ))}
                                    <Badge variant="secondary" className="text-[10px]">
                                      Reliability: {signal.details.patternAnalysis.reliability}
                                    </Badge>
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1">{signal.details.patternAnalysis.summary}</div>
                                </div>
                              )}

                              {/* Fundamental Catalysts */}
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                  <Newspaper className="h-4 w-4" /> Fundamental Catalysts
                                </div>
                                <ul className="space-y-1">
                                  {signal.details.fundamentalCatalysts.map((cat, i) => (
                                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                      <span className="text-amber-500 mt-0.5">&#8226;</span> {cat}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              {/* Reasoning */}
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                  <Brain className="h-4 w-4" /> AI Reasoning
                                </div>
                                <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">{signal.reasoning}</p>
                              </div>

                              {/* Warnings */}
                              {signal.analysis?.warnings && signal.analysis.warnings.length > 0 && (
                                <div className="space-y-1">
                                  {signal.analysis.warnings.map((w, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs text-amber-600 bg-amber-500/10 p-2 rounded">
                                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {w}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Legacy display for signals without details */}
                          {!signal.details && (
                            <>
                              <Separator className="my-3" />
                              <p className="text-sm mb-3">{signal.reasoning}</p>
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Technical:</span>
                                  <Progress value={(signal.analysis?.technicalAnalysis?.score || 0) * 100} className="h-2 mt-1" />
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Sentiment:</span>
                                  <Progress value={((signal.analysis?.sentimentAnalysis?.overallSentiment || 0) + 1) * 50} className="h-2 mt-1" />
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Fundamental:</span>
                                  <Progress value={(signal.analysis?.fundamentalAnalysis?.score || 0) * 100} className="h-2 mt-1" />
                                </div>
                              </div>
                            </>
                          )}

                          {/* Action buttons */}
                          <div className="mt-3 flex gap-2">
                            {signal.action !== 'HOLD' && (
                              <>
                                {expandedOrderId !== signal.id ? (
                                  <Button size="sm" variant="default"
                                    onClick={() => openOrderPanel(signal.id, signal.details, signal.action, signal.symbol)}
                                  >
                                    <Crosshair className="h-3 w-3 mr-1" /> Open Order Panel
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline"
                                    onClick={() => setExpandedOrderId(null)}
                                  >
                                    <ChevronUp className="h-3 w-3 mr-1" /> Close Panel
                                  </Button>
                                )}
                              </>
                            )}
                            <Button size="sm" variant="outline">
                              <Shield className="h-3 w-3 mr-1" />
                              Set Alerts
                            </Button>
                          </div>

                          {/* Trade Order Panel (manual signals) */}
                          {expandedOrderId === signal.id && (
                            <div className="mt-3 p-3 rounded-lg border bg-card space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                  <Crosshair className="h-4 w-4 text-primary" />
                                  Trade Order
                                  <Badge className={`text-[10px] ${tradingMode === 'live' ? 'bg-red-600' : 'bg-green-600'}`}>
                                    {tradingMode.toUpperCase()}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Balance: ${(tradingMode === 'live' && liveBalance ? liveBalance.totalEquity : portfolio.totalValue).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Symbol</label>
                                  <div className="text-sm font-bold mt-0.5">{orderForm.symbol}</div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Direction</label>
                                  <div className="flex gap-1 mt-0.5">
                                    <button onClick={() => setOrderForm(p => ({ ...p, side: 'BUY' }))}
                                      className={`flex-1 text-xs py-1 rounded font-semibold transition-colors ${orderForm.side === 'BUY' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}
                                    >BUY</button>
                                    <button onClick={() => setOrderForm(p => ({ ...p, side: 'SELL' }))}
                                      className={`flex-1 text-xs py-1 rounded font-semibold transition-colors ${orderForm.side === 'SELL' ? 'bg-red-600 text-white' : 'bg-muted text-muted-foreground'}`}
                                    >SELL</button>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Order Type</label>
                                  <div className="flex gap-1 mt-0.5">
                                    <button onClick={() => setOrderForm(p => ({ ...p, orderType: 'MARKET' }))}
                                      className={`flex-1 text-xs py-1 rounded font-semibold transition-colors ${orderForm.orderType === 'MARKET' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                                    >Market</button>
                                    <button onClick={() => setOrderForm(p => ({ ...p, orderType: 'LIMIT' }))}
                                      className={`flex-1 text-xs py-1 rounded font-semibold transition-colors ${orderForm.orderType === 'LIMIT' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                                    >Limit</button>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Leverage</label>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <input type="range" min="1" max="100" value={orderForm.leverage}
                                      onChange={e => setOrderForm(p => ({ ...p, leverage: parseInt(e.target.value) }))}
                                      className="flex-1 h-1 accent-primary" />
                                    <span className="text-xs font-mono w-8 text-right">{orderForm.leverage}x</span>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Entry Price</label>
                                  <Input type="number" step="any" className="h-7 text-xs font-mono mt-0.5"
                                    value={orderForm.entryPrice || ''}
                                    onChange={e => setOrderForm(p => ({ ...p, entryPrice: parseFloat(e.target.value) || 0 }))}
                                    disabled={orderForm.orderType === 'MARKET'}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Stop Loss</label>
                                  <Input type="number" step="any" className="h-7 text-xs font-mono mt-0.5 text-red-400"
                                    value={orderForm.stopLoss || ''}
                                    onChange={e => updateOrderStopLoss(parseFloat(e.target.value) || 0)}
                                    placeholder="SL price"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Take Profit</label>
                                  <Input type="number" step="any" className="h-7 text-xs font-mono mt-0.5 text-green-400"
                                    value={orderForm.takeProfit || ''}
                                    onChange={e => setOrderForm(p => ({ ...p, takeProfit: parseFloat(e.target.value) || 0 }))}
                                    placeholder="TP price"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Quantity</label>
                                  <Input type="number" step="any" className="h-7 text-xs font-mono mt-0.5"
                                    value={orderForm.quantity || ''}
                                    onChange={e => updateOrderQuantity(parseFloat(e.target.value) || 0)}
                                  />
                                </div>
                              </div>

                              {/* Risk Management */}
                              <div className="rounded-lg border p-2.5 bg-muted/30 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-muted-foreground">Risk Management</span>
                                  <span className="text-xs text-muted-foreground">
                                    Risk: <span className={`font-bold ${orderForm.riskPercent > 3 ? 'text-red-500' : orderForm.riskPercent > 1 ? 'text-amber-500' : 'text-green-500'}`}>
                                      ${((tradingMode === 'live' && liveBalance ? liveBalance.totalEquity : portfolio.totalValue) * orderForm.riskPercent / 100).toFixed(2)}
                                    </span> ({orderForm.riskPercent.toFixed(2)}%)
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input type="range" min="0.1" max="10" step="0.1" value={orderForm.riskPercent}
                                    onChange={e => updateOrderRisk(parseFloat(e.target.value))}
                                    className="flex-1 h-1 accent-primary" />
                                  <div className="flex gap-1">
                                    {[0.5, 1, 2, 3, 5].map(pct => (
                                      <button key={pct} onClick={() => updateOrderRisk(pct)}
                                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                                          Math.abs(orderForm.riskPercent - pct) < 0.15
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                                        }`}
                                      >{pct}%</button>
                                    ))}
                                  </div>
                                </div>
                                {signal.details?.takeProfitLevels && signal.details.takeProfitLevels.length > 1 && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] text-muted-foreground">TP Level:</span>
                                    {signal.details.takeProfitLevels.map((tp, i) => (
                                      <button key={i} onClick={() => setOrderForm(p => ({
                                        ...p, takeProfit: tp.price, takeProfitLevel: i + 1
                                      }))}
                                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                                          orderForm.takeProfitLevel === i + 1
                                            ? 'bg-green-600 text-white'
                                            : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                                        }`}
                                      >TP{tp.level} (+{tp.percentFromEntry.toFixed(1)}%)</button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Order Summary */}
                              <div className="flex items-center justify-between p-2 rounded bg-muted/50 text-xs">
                                <div className="space-y-0.5">
                                  <div className="text-muted-foreground">Position Size: <span className="font-mono font-bold text-foreground">${(orderForm.quantity * orderForm.entryPrice * orderForm.leverage).toFixed(2)}</span></div>
                                  <div className="text-muted-foreground">Margin Required: <span className="font-mono font-bold text-foreground">${(orderForm.quantity * orderForm.entryPrice).toFixed(2)}</span></div>
                                </div>
                                <div className="text-right space-y-0.5">
                                  <div className="text-muted-foreground">SL Distance: <span className="font-mono text-red-400">
                                    {orderForm.entryPrice > 0 && orderForm.stopLoss > 0
                                      ? `${((Math.abs(orderForm.entryPrice - orderForm.stopLoss) / orderForm.entryPrice) * 100).toFixed(2)}%`
                                      : '—'}
                                  </span></div>
                                  <div className="text-muted-foreground">R:R: <span className="font-mono text-green-400">
                                    {orderForm.entryPrice > 0 && orderForm.stopLoss > 0 && orderForm.takeProfit > 0
                                      ? `${(Math.abs(orderForm.takeProfit - orderForm.entryPrice) / Math.abs(orderForm.entryPrice - orderForm.stopLoss)).toFixed(1)}:1`
                                      : '—'}
                                  </span></div>
                                </div>
                              </div>

                              <Button
                                className="w-full h-8"
                                variant={orderForm.side === 'BUY' ? 'default' : 'destructive'}
                                disabled={orderSubmitting || orderForm.quantity <= 0 || orderForm.entryPrice <= 0}
                                onClick={submitOrder}
                              >
                                {orderSubmitting ? (
                                  <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Submitting...</>
                                ) : (
                                  <><Play className="h-3 w-3 mr-1" />
                                    {orderForm.side === 'BUY' ? 'BUY' : 'SELL'} {orderForm.symbol}
                                    {orderForm.orderType === 'LIMIT' && ` @ $${orderForm.entryPrice}`}
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Positions Tab */}
          <TabsContent value="positions" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Portfolio Allocation</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={portfolioChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {portfolioChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-4 mt-2">
                    <Badge variant="outline">Cash: ${portfolio.cashBalance.toFixed(2)}</Badge>
                    <Badge variant="outline">Positions: ${(portfolio.totalValue - portfolio.cashBalance).toFixed(2)}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Equity Curve</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={equityCurve}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Equity" />
                      <Line type="monotone" dataKey="peak" stroke="#f59e0b" dot={false} name="Peak" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Open Positions</CardTitle>
                <CardDescription>With trailing stop loss controls</CardDescription>
              </CardHeader>
              <CardContent>
                {positions.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No open positions</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-3">
                      {positions.map((position) => (
                        <div key={position.id} className="p-4 rounded-lg border space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Badge variant={position.side === 'LONG' ? 'default' : 'secondary'}>
                                {position.side}
                              </Badge>
                              <div>
                                <div className="font-semibold">{position.symbol}</div>
                                <div className="text-sm text-muted-foreground">
                                  Qty: {position.quantity} @ ${position.avgEntryPrice.toFixed(2)}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={position.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}>
                                {position.unrealizedPnL >= 0 ? '+' : ''}${position.unrealizedPnL.toFixed(2)}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {position.unrealizedPnLPercent >= 0 ? '+' : ''}{position.unrealizedPnLPercent.toFixed(2)}%
                              </div>
                            </div>
                          </div>

                          {/* Trailing Stop Controls */}
                          <div className="flex items-center gap-3 pt-2 border-t">
                            <div className="flex items-center gap-2 text-sm">
                              <Repeat className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Trailing Stop:</span>
                              {position.trailingStop ? (
                                <Badge variant="outline" className="text-xs">
                                  ${position.trailingStop.toFixed(2)}
                                  {position.trailingStopActivated && <span className="ml-1 text-green-500">●</span>}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Not set</span>
                              )}
                            </div>
                            <Input
                              type="number"
                              placeholder="Distance $"
                              className="w-28 h-7 text-xs"
                              value={trailingStopDistance[position.symbol] || ''}
                              onChange={(e) => setTrailingStopDistance(prev => ({
                                ...prev,
                                [position.symbol]: parseFloat(e.target.value) || 0
                              }))}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                const dist = trailingStopDistance[position.symbol];
                                if (dist && dist > 0) {
                                  setTrailingStop(position.symbol, dist);
                                }
                              }}
                            >
                              Set
                            </Button>
                          </div>

                          {/* Position Actions */}
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => closePosition(position.symbol)}
                            >
                              <Square className="h-3 w-3 mr-1" />
                              Close All
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => closePositionPartial(position.symbol, 50)}
                            >
                              <Percent className="h-3 w-3 mr-1" />
                              Close 50%
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => closePositionPartial(position.symbol, 25)}
                            >
                              <Percent className="h-3 w-3 mr-1" />
                              Close 25%
                            </Button>
                          </div>

                          {/* Position Details */}
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            {position.stopLoss && <span>SL: ${position.stopLoss.toFixed(2)}</span>}
                            {position.takeProfit && <span>TP: ${position.takeProfit.toFixed(2)}</span>}
                            {position.totalFees !== undefined && <span>Fees: ${position.totalFees.toFixed(4)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Backtest Tab */}
          <TabsContent value="backtest" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Backtesting Engine</CardTitle>
                <CardDescription>Test strategies on historical data</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Symbol</label>
                      <select className="w-full mt-1 px-3 py-2 rounded-md border bg-background">
                        {symbols.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Start Date</label>
                      <Input type="date" className="mt-1" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">End Date</label>
                      <Input type="date" className="mt-1" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Initial Capital</label>
                      <Input type="number" defaultValue={10000} className="mt-1" />
                    </div>
                    <Button className="w-full">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Run Backtest
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <Card className="p-4 bg-muted/50">
                      <h3 className="font-semibold mb-2">Expected Metrics</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Total Return:</span>
                          <span className="font-mono">--</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Win Rate:</span>
                          <span className="font-mono">--</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sharpe Ratio:</span>
                          <span className="font-mono">--</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Max Drawdown:</span>
                          <span className="font-mono">--</span>
                        </div>
                      </div>
                    </Card>
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Info</AlertTitle>
                      <AlertDescription>
                        Backtesting uses simulated data. Connect to Bybit API for real historical data.
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* News Tab */}
          <TabsContent value="news" className="space-y-4">
            {/* Breaking News Section */}
            {breakingNews.length > 0 && (
              <Card className="border-amber-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Flame className="h-5 w-5 text-amber-500" />
                    Breaking News
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {breakingNews.map((item) => (
                      <div key={item.id} className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <div className="flex items-start gap-2">
                          <Badge variant="destructive" className="text-xs shrink-0">BREAKING</Badge>
                          <span className="text-sm font-medium">{item.title}</span>
                          {item.importance && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              Impact: {(item.importance * 100).toFixed(0)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Market News</CardTitle>
                    <CardDescription>Latest news with impact scoring</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchInitialData}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {news.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <Newspaper className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No news available</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {news.map((item) => (
                        <div key={item.id} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="flex-1">
                              <h3 className="font-medium text-sm">{item.title}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {item.source}
                                </Badge>
                                {item.sentiment !== undefined && (
                                  <Badge
                                    variant={item.sentiment > 0.2 ? 'default' : item.sentiment < -0.2 ? 'destructive' : 'secondary'}
                                    className="text-xs"
                                  >
                                    {item.sentiment > 0.2 ? 'Bullish' : item.sentiment < -0.2 ? 'Bearish' : 'Neutral'}
                                  </Badge>
                                )}
                                {item.importance !== undefined && item.importance >= 0.7 && (
                                  <Badge variant="destructive" className="text-xs">
                                    High Impact
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {item.publishedAt && (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(item.publishedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* MT5-Style Open Trades & Trade History */}
        <div className="mt-6 space-y-4">
          {/* Terminal Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Trade Terminal</h2>
              <Badge className={`text-xs ${tradingMode === 'live' ? 'bg-red-600' : 'bg-green-600'}`}>
                {tradingMode.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Balance:</span>
                <span className="font-semibold">
                  {tradingMode === 'live' && liveBalance
                    ? `$${liveBalance.totalEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : `$${portfolio.totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  }
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Equity:</span>
                <span className={`font-semibold ${
                  tradingMode === 'live'
                    ? 'text-green-500'
                    : (portfolio.totalValue + portfolio.unrealizedPnL) >= portfolio.totalValue ? 'text-green-500' : 'text-red-500'
                }`}>
                  {tradingMode === 'live' && liveBalance
                    ? `$${liveBalance.totalAvailableBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : `$${(portfolio.totalValue + portfolio.unrealizedPnL).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  }
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Free Margin:</span>
                <span className="font-semibold">
                  {tradingMode === 'live' && liveBalance
                    ? `$${liveBalance.totalAvailableBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : `$${portfolio.cashBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  }
                </span>
              </div>
              {tradingMode === 'live' && connectionStatus === 'connected' && (
                <Badge className="text-[10px] bg-green-600">LIVE</Badge>
              )}
            </div>
          </div>

          {/* Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Open Positions</div>
              <div className="text-xl font-bold">{tradingMode === 'live' ? livePositions.length : positions.length}</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Total Unrealized P&L</div>
              <div className={`text-xl font-bold ${
                (tradingMode === 'live' ? livePositions : positions).reduce((s, p) => s + (p.unrealizedPnL || 0), 0) >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {((tradingMode === 'live' ? livePositions : positions).reduce((s, p) => s + (p.unrealizedPnL || 0), 0) >= 0 ? '+' : '')}
                ${(tradingMode === 'live' ? livePositions : positions).reduce((s, p) => s + (p.unrealizedPnL || 0), 0).toFixed(2)}
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Realized P&L</div>
              <div className={`text-xl font-bold ${portfolio.realizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {portfolio.realizedPnL >= 0 ? '+' : ''}${portfolio.realizedPnL.toFixed(2)}
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Closed Trades</div>
              <div className="text-xl font-bold">{tradeHistory.filter(t => t.closedAt).length + realizedTrades.length}</div>
            </Card>
          </div>

          {/* Open Trades Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  <CardTitle className="text-sm font-semibold">Open Trades</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    ({tradingMode === 'live' ? livePositions.length : positions.length})
                  </span>
                  <Badge className={`text-[10px] px-1.5 py-0 ${tradingMode === 'live' ? 'bg-red-600' : 'bg-green-600'}`}>
                    {tradingMode.toUpperCase()}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={tradingMode === 'live' ? fetchLiveData : fetchPositions}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(tradingMode === 'live' ? livePositions : positions).length === 0 ? (
                <div className="text-center text-muted-foreground py-10">
                  <Activity className="h-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">
                    {tradingMode === 'live'
                      ? 'No open live trades'
                      : 'No open trades'}
                  </p>
                  <p className="text-xs mt-1">
                    {tradingMode === 'live'
                      ? 'Place a trade from the Signals tab using LIVE mode'
                      : 'Place a trade from the Signals tab or use the terminal above'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground w-16">#</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Symbol</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground w-16">Type</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground w-20">Volume</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Open Price</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Current</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">S/L</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">T/P</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground w-16">Swap</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground w-28">P&L</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground w-28">P&L %</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground w-16">Time</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(tradingMode === 'live' ? livePositions : positions).map((pos, idx) => (
                        <tr key={pos.id} className={`border-b hover:bg-muted/30 transition-colors ${(pos.unrealizedPnL || 0) >= 0 ? 'bg-green-500/[0.03]' : 'bg-red-500/[0.03]'}`}>
                          <td className="py-2.5 px-3 text-xs text-muted-foreground font-mono">{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold">{pos.symbol.replace('USDT', '')}</span>
                            <span className="text-muted-foreground">/USDT</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge variant={pos.side === 'LONG' ? 'default' : 'destructive'} className="text-[10px] px-1.5 py-0">
                              {pos.side}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">{pos.quantity.toFixed(4)}</td>
                          <td className="py-2.5 px-3 text-right font-mono">${pos.avgEntryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right font-mono">${(pos.currentPrice || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-red-400">
                            {pos.stopLoss ? `$${pos.stopLoss.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-green-400">
                            {pos.takeProfit ? `$${pos.takeProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2.5 px-3 text-center text-muted-foreground text-xs font-mono">
                            {pos.trailingStopActivated ? <span className="text-green-500">●</span> : '—'}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono font-semibold ${(pos.unrealizedPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {(pos.unrealizedPnL || 0) >= 0 ? '+' : ''}${(pos.unrealizedPnL || 0).toFixed(2)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono font-semibold ${(pos.unrealizedPnLPercent || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {(pos.unrealizedPnLPercent || 0) >= 0 ? '+' : ''}{(pos.unrealizedPnLPercent || 0).toFixed(2)}%
                          </td>
                          <td className="py-2.5 px-3 text-xs text-muted-foreground">
                            {pos.openedAt ? new Date(pos.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                onClick={() => closeTrade(pos.symbol)}
                                title="Close position"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                              {tradingMode === 'demo' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:bg-muted"
                                  onClick={() => closePositionPartial(pos.symbol, 50)}
                                  title="Close 50%"
                                >
                                  <Percent className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Totals Row */}
                    <tfoot>
                      <tr className="border-t-2 bg-muted/30 font-semibold">
                        <td className="py-2.5 px-3" colSpan={9}>
                          <span className="text-xs text-muted-foreground">TOTAL ({(tradingMode === 'live' ? livePositions : positions).length} positions)</span>
                        </td>
                        <td className={`py-2.5 px-3 text-right font-mono ${(tradingMode === 'live' ? livePositions : positions).reduce((s, p) => s + (p.unrealizedPnL || 0), 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {(tradingMode === 'live' ? livePositions : positions).reduce((s, p) => s + (p.unrealizedPnL || 0), 0) >= 0 ? '+' : ''}${(tradingMode === 'live' ? livePositions : positions).reduce((s, p) => s + (p.unrealizedPnL || 0), 0).toFixed(2)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-mono ${(tradingMode === 'live' ? livePositions : positions).reduce((s, p) => s + (p.unrealizedPnLPercent || 0), 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {((tradingMode === 'live' ? livePositions : positions).reduce((s, p) => s + (p.unrealizedPnLPercent || 0), 0) / Math.max(1, (tradingMode === 'live' ? livePositions : positions).length)).toFixed(2)}%
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Trade History Tab */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <CardTitle className="text-sm font-semibold">Trade History</CardTitle>
                <span className="text-xs text-muted-foreground">({tradeHistory.length + realizedTrades.length})</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {tradeHistory.length === 0 && realizedTrades.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Clock className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No trade history yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">#</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Symbol</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground w-16">Type</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Volume</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Open Price</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Close Price</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Status</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">P&L</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Fees</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Realized trades */}
                      {realizedTrades.map((trade, idx) => (
                        <tr key={`real-${trade.id}`} className={`border-b hover:bg-muted/30 ${trade.netPnL >= 0 ? 'bg-green-500/[0.03]' : 'bg-red-500/[0.03]'}`}>
                          <td className="py-2.5 px-3 text-xs text-muted-foreground font-mono">{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold">{trade.symbol.replace('USDT', '')}</span>
                            <span className="text-muted-foreground">/USDT</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge variant={trade.side === 'LONG' ? 'default' : 'destructive'} className="text-[10px] px-1.5 py-0">
                              {trade.side}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">{trade.quantity.toFixed(4)}</td>
                          <td className="py-2.5 px-3 text-right font-mono">${trade.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right font-mono">${trade.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge variant="outline" className="text-[10px]">Closed</Badge>
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono font-semibold ${trade.netPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {trade.netPnL >= 0 ? '+' : ''}${trade.netPnL.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">${trade.fees.toFixed(4)}</td>
                          <td className="py-2.5 px-3 text-xs text-muted-foreground">
                            {trade.closedAt ? new Date(trade.closedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                        </tr>
                      ))}
                      {/* Order history (non-realized, i.e. open orders etc.) */}
                      {tradeHistory.map((trade, idx) => {
                        if (!trade.closedAt) return null;
                        return (
                          <tr key={`hist-${trade.id}`} className={`border-b hover:bg-muted/30 ${(trade.pnl || 0) >= 0 ? 'bg-green-500/[0.03]' : 'bg-red-500/[0.03]'}`}>
                            <td className="py-2.5 px-3 text-xs text-muted-foreground font-mono">{realizedTrades.length + idx + 1}</td>
                            <td className="py-2.5 px-3">
                              <span className="font-semibold">{trade.symbol.replace('USDT', '')}</span>
                              <span className="text-muted-foreground">/USDT</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {trade.side}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">{trade.quantity.toFixed(4)}</td>
                            <td className="py-2.5 px-3 text-right font-mono">${trade.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            <td className="py-2.5 px-3 text-right text-muted-foreground">—</td>
                            <td className="py-2.5 px-3 text-center">
                              <Badge variant={trade.status === 'FILLED' ? 'default' : 'secondary'} className="text-[10px]">
                                {trade.status}
                              </Badge>
                            </td>
                            <td className={`py-2.5 px-3 text-right font-mono ${(trade.pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {trade.pnl !== undefined ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">—</td>
                            <td className="py-2.5 px-3 text-xs text-muted-foreground">
                              {trade.closedAt ? new Date(trade.closedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Exchange Account Settings Dialog */}
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <Card className="w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto shadow-2xl border-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    <CardTitle>Trading Platforms</CardTitle>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>Add your exchange API keys to enable live trading</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Existing Accounts */}
                {exchangeAccounts.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Connected Accounts</div>
                    {exchangeAccounts.map(account => (
                      <div key={account.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm truncate">{account.name}</span>
                            <Badge variant="outline" className="text-[10px] uppercase">{account.exchange}</Badge>
                            <Badge variant={account.testnet ? 'secondary' : 'default'} className="text-[10px]">
                              {account.testnet ? 'Testnet' : 'Mainnet'}
                            </Badge>
                            {account.isActive && (
                              <Badge className="text-[10px] bg-green-600">Active</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Key: {account.apiKey} &middot; Secret: {account.apiSecret}
                          </div>
                          {account.lastTested && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Last tested: {new Date(account.lastTested).toLocaleString()}
                              {account.lastError && <span className="text-red-500 ml-1">Error: {account.lastError}</span>}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          {!account.isActive && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[10px] h-7 px-2"
                              onClick={() => activateExchangeAccount(account.id)}
                            >
                              Activate
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[10px] h-7 px-2"
                            onClick={() => testExchangeConnection(account.id)}
                          >
                            Test
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[10px] h-7 px-2 text-red-500 hover:text-red-600"
                            onClick={() => deleteExchangeAccount(account.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Account */}
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      {accountFormMode === 'edit' ? 'Edit Account' : 'Add New Account'}
                    </div>
                    {accountFormMode === 'edit' && (
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => {
                        setAccountFormMode('add');
                        setEditingAccountId(null);
                        setNewAccount({ name: 'Bybit Main', exchange: 'bybit', apiKey: '', apiSecret: '', testnet: true });
                      }}>
                        Cancel Edit
                      </Button>
                    )}
                  </div>

                  {/* Platform Presets */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Select Platform</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: 'bybit', name: 'Bybit', color: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600' },
                        { id: 'binance', name: 'Binance', color: 'bg-yellow-400/10 border-yellow-400/30 text-yellow-500' },
                        { id: 'okx', name: 'OKX', color: 'bg-white/10 border-white/20 text-white' },
                        { id: 'bitget', name: 'Bitget', color: 'bg-blue-500/10 border-blue-500/30 text-blue-500' },
                        { id: 'kucoin', name: 'KuCoin', color: 'bg-green-500/10 border-green-500/30 text-green-500' },
                        { id: 'gateio', name: 'Gate.io', color: 'bg-blue-400/10 border-blue-400/30 text-blue-400' },
                        { id: 'htx', name: 'HTX', color: 'bg-green-400/10 border-green-400/30 text-green-400' },
                        { id: 'deribit', name: 'Deribit', color: 'bg-red-500/10 border-red-500/30 text-red-500' },
                        { id: 'bingx', name: 'BingX', color: 'bg-purple-500/10 border-purple-500/30 text-purple-500' },
                        { id: 'mexc', name: 'MEXC', color: 'bg-teal-500/10 border-teal-500/30 text-teal-500' },
                        { id: 'bitmart', name: 'BitMart', color: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-500' },
                        { id: 'cryptocom', name: 'Crypto.com', color: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-500' },
                      ].map(platform => (
                        <button
                          key={platform.id}
                          onClick={() => setNewAccount(prev => ({ ...prev, exchange: platform.id, name: `${platform.name} Main` }))}
                          className={`px-2 py-1.5 rounded-md border text-xs font-medium transition-all ${
                            newAccount.exchange === platform.id
                              ? `${platform.color} ring-1 ring-current/40`
                              : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/60'
                          }`}
                        >
                          {platform.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Account Name</label>
                      <Input
                        placeholder="e.g. Bybit Main Account"
                        value={newAccount.name}
                        onChange={e => setNewAccount(prev => ({ ...prev, name: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">API Key</label>
                        <Input
                          type="password"
                          placeholder="Enter API Key"
                          value={newAccount.apiKey}
                          onChange={e => setNewAccount(prev => ({ ...prev, apiKey: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">API Secret</label>
                        <Input
                          type="password"
                          placeholder="Enter API Secret"
                          value={newAccount.apiSecret}
                          onChange={e => setNewAccount(prev => ({ ...prev, apiSecret: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="testnet-toggle"
                        checked={newAccount.testnet}
                        onChange={e => setNewAccount(prev => ({ ...prev, testnet: e.target.checked }))}
                        className="rounded"
                      />
                      <label htmlFor="testnet-toggle" className="text-sm">
                        Use Testnet (demo keys)
                        <span className="text-xs text-muted-foreground ml-1">
                          {newAccount.testnet ? '(recommended for testing)' : '(real funds at risk!)'}
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={saveExchangeAccount}
                      disabled={!newAccount.name || !newAccount.apiKey || !newAccount.apiSecret}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {accountFormMode === 'edit' ? 'Update Account' : 'Save Account'}
                    </Button>
                    {connectionStatus === 'testing' && (
                      <span className="text-xs text-muted-foreground animate-pulse">Testing connection...</span>
                    )}
                    {connectionStatus === 'connected' && (
                      <span className="text-xs text-green-500 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Connected
                      </span>
                    )}
                    {connectionStatus === 'error' && (
                      <span className="text-xs text-red-500 flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> Connection failed
                      </span>
                    )}
                  </div>
                </div>

                {/* Warning for mainnet */}
                {!newAccount.testnet && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Real Funds Warning</AlertTitle>
                    <AlertDescription>
                      You are about to use mainnet with real funds. Make sure you understand the risks. Start with small amounts.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-sm text-muted-foreground py-4 border-t">
          <p className="font-semibold">Mantle AI Trader - Fundamental News-Based Trading Bot</p>
          <p className="mt-1">Built for Mantle Turing Test Hackathon</p>
          <div className="mt-3 p-3 bg-muted/50 rounded-lg max-w-2xl mx-auto">
            <p className="text-xs text-red-500/80 font-medium">
              ⚠️ DISCLAIMER: This is educational software. Trading cryptocurrencies involves substantial risk of loss. 
              Past performance is not indicative of future results. AI signals are NOT financial advice. 
              Never trade with money you cannot afford to lose.
            </p>
            <a 
              href="https://github.com/roman-ryzenadvanced/mantle-ai-trader/blob/main/DISCLAIMER.md" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline mt-1 inline-block"
            >
              Read Full Risk Disclaimer →
            </a>
          </div>
          <p className="mt-2 text-xs">
            Made with ❤️ by{' '}
            <a href="https://rommark.dev" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Rommark.Dev
            </a>
          </p>
        </footer>
        </>
        )}
      </div>
    </div>
  );
}
