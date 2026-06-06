'use client';

import { useState, useEffect, useCallback } from 'react';
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
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import {
  TrendingUp, TrendingDown, Activity, DollarSign, AlertTriangle,
  RefreshCw, Play, Square, BarChart3, Newspaper, Settings,
  Brain, Target, Shield, Zap, CheckCircle, XCircle, Clock,
  AlertCircle, Info, X
} from 'lucide-react';

// Types
interface Signal {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  priceTarget?: number;
  stopLoss?: number;
  takeProfit?: number;
  sentimentScore?: number;
  technicalScore?: number;
  fundamentalScore?: number;
  status: string;
  createdAt: string;
}

interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
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
  publishedAt?: string;
}

interface PriceUpdate {
  symbol: string;
  price: number;
  change: number;
}

// Colors for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function TradingDashboard() {
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
  const [prices, setPrices] = useState<Record<string, PriceUpdate>>({});
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('signals');

  // Symbol options
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

  // WebSocket connection
  useEffect(() => {
    const socket: Socket = io('/?XTransformPort=3003');

    socket.on('connect', () => {
      setConnected(true);
      console.log('Connected to trading service');
    });

    socket.on('disconnect', () => {
      setConnected(false);
      console.log('Disconnected from trading service');
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

    socket.on('signal_generated', (data: { signal: Signal; analysis: unknown }) => {
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
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
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
        setSignals((prev) => [data.data.signal, ...prev].slice(0, 50));
      }
    } catch (error) {
      console.error('Error generating signal:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedSymbol]);

  const placeDemoOrder = async (symbol: string, side: 'BUY' | 'SELL', quantity: number) => {
    try {
      await fetch('/api/trading/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'place_order',
          symbol,
          side,
          type: 'MARKET',
          quantity
        })
      });
      // Refresh portfolio
      const res = await fetch('/api/trading/demo?action=portfolio');
      const data = await res.json();
      if (data.success) {
        setPortfolio(data.data);
      }
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
    } catch (error) {
      console.error('Error closing position:', error);
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
    } catch (error) {
      console.error('Error resetting demo:', error);
    }
  };

  // Generate chart data for portfolio
  const portfolioChartData = [
    { name: 'Cash', value: portfolio.cashBalance },
    { name: 'Positions', value: portfolio.totalValue - portfolio.cashBalance }
  ];

  // Generate performance chart data
  const performanceData = Array.from({ length: 24 }, (_, i) => ({
    time: `${i}:00`,
    value: 10000 + Math.random() * 500 * (i / 24) * (Math.random() > 0.5 ? 1 : -1)
  }));

  // Sentiment gauge data
  const sentimentValue = signals[0]?.sentimentScore || 0;
  const sentimentLabel = sentimentValue > 0.3 ? 'Bullish' : sentimentValue < -0.3 ? 'Bearish' : 'Neutral';
  const sentimentColor = sentimentValue > 0.3 ? 'text-green-500' : sentimentValue < -0.3 ? 'text-red-500' : 'text-yellow-500';

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
              <p>
                <strong>This software is for EDUCATIONAL and DEMONSTRATION purposes ONLY.</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li><strong>Trading involves SUBSTANTIAL RISK</strong> - You could lose ALL your investment</li>
                <li><strong>NOT financial advice</strong> - AI signals are algorithmic suggestions only</li>
                <li><strong>No guarantee of profits</strong> - Past performance does NOT guarantee future results</li>
                <li><strong>Use PAPER TRADING mode</strong> - Test thoroughly before any live trading</li>
                <li><strong>NEVER trade with money you cannot afford to lose</strong></li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                By using this software, you acknowledge you have read and understood the full{' '}
                <a href="https://github.com/roman-ryzenadvanced/mantle-ai-trader/blob/main/DISCLAIMER.md" 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="underline text-primary hover:text-primary/80">
                  Risk Disclaimer
                </a>.
              </p>
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
            <Button variant="outline" size="sm" onClick={resetDemo}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Reset Demo
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
              <div className="flex items-center gap-2">
                <Progress value={(portfolio.totalValue / 12000) * 100} className="h-2" />
              </div>
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
              <Badge variant="outline">Open Positions: {positions.length}</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Market Sentiment</CardDescription>
              <CardTitle className={`text-2xl ${sentimentColor}`}>
                {sentimentLabel}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={(sentimentValue + 1) * 50} className="h-2" />
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
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>AI Trading Signals</CardTitle>
                    <CardDescription>AI-generated trading signals with analysis</CardDescription>
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
                <ScrollArea className="h-[400px]">
                  {signals.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <Target className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No signals yet. Generate one to get started!</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {signals.map((signal) => (
                        <Card key={signal.id} className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <Badge
                                variant={signal.action === 'BUY' ? 'default' : signal.action === 'SELL' ? 'destructive' : 'secondary'}
                                className="text-lg px-3 py-1"
                              >
                                {signal.action === 'BUY' ? (
                                  <TrendingUp className="h-4 w-4 mr-1" />
                                ) : signal.action === 'SELL' ? (
                                  <TrendingDown className="h-4 w-4 mr-1" />
                                ) : null}
                                {signal.action}
                              </Badge>
                              <div>
                                <div className="font-semibold">{signal.symbol}</div>
                                <div className="text-sm text-muted-foreground">
                                  Confidence: {(signal.confidence * 100).toFixed(0)}%
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-muted-foreground">
                                {new Date(signal.createdAt).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          
                          <Separator className="my-3" />
                          
                          <p className="text-sm mb-3">{signal.reasoning}</p>
                          
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Technical:</span>
                              <Progress value={(signal.technicalScore || 0) * 100} className="h-2 mt-1" />
                            </div>
                            <div>
                              <span className="text-muted-foreground">Sentiment:</span>
                              <Progress value={((signal.sentimentScore || 0) + 1) * 50} className="h-2 mt-1" />
                            </div>
                            <div>
                              <span className="text-muted-foreground">Fundamental:</span>
                              <Progress value={(signal.fundamentalScore || 0) * 100} className="h-2 mt-1" />
                            </div>
                          </div>

                          {signal.action !== 'HOLD' && (
                            <div className="mt-3 flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => placeDemoOrder(signal.symbol, signal.action, 0.01)}
                              >
                                <Play className="h-3 w-3 mr-1" />
                                Execute
                              </Button>
                              <Button size="sm" variant="outline">
                                <Shield className="h-3 w-3 mr-1" />
                                Set Alerts
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
                  <CardTitle>Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={performanceData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Open Positions</CardTitle>
                <CardDescription>Current trading positions</CardDescription>
              </CardHeader>
              <CardContent>
                {positions.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No open positions</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {positions.map((position) => (
                      <div key={position.id} className="flex items-center justify-between p-3 rounded-lg border">
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
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => closePosition(position.symbol)}
                        >
                          <Square className="h-3 w-3 mr-1" />
                          Close
                        </Button>
                      </div>
                    ))}
                  </div>
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
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Market News</CardTitle>
                    <CardDescription>Latest news and sentiment analysis</CardDescription>
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
      </div>
    </div>
  );
}
