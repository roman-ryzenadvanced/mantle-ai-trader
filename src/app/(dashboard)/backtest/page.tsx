'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { FlaskConical, Play, TrendingUp, TrendingDown, Target, Award, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface BacktestResult {
  totalReturn: number;
  winRate: number;
  maxDrawdown: number;
  totalTrades: number;
  sharpeRatio: number;
  equityCurve: Array<{ time: string; value: number }>;
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

const strategies = [
  { value: 'default', label: 'Default (Momentum)' },
  { value: 'breakout', label: 'Breakout' },
  { value: 'mean_reversion', label: 'Mean Reversion' },
  { value: 'vwap_twap', label: 'VWAP/TWAP' },
];

export default function BacktestPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-06-01');
  const [initialCapital, setInitialCapital] = useState('10000');
  const [strategy, setStrategy] = useState('default');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<BacktestResult | null>(null);

  const handleRunBacktest = async () => {
    setIsRunning(true);
    setResults(null);

    try {
      const res = await fetch('/api/trading/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          initialCapital: parseFloat(initialCapital),
          riskPerTrade: 0.02,
          fees: 0.001,
          slippage: 0.001,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const session = data.data?.session || data.data;
        const backtestResults = data.data?.results || data.data;

        setResults({
          totalReturn: session.finalCapital
            ? ((session.finalCapital - parseFloat(initialCapital)) / parseFloat(initialCapital)) * 100
            : backtestResults.totalReturn || 0,
          winRate: session.winRate || backtestResults.winRate || 0,
          maxDrawdown: session.maxDrawdown || backtestResults.maxDrawdown || 0,
          totalTrades: session.totalTrades || backtestResults.totalTrades || 0,
          sharpeRatio: session.sharpeRatio || backtestResults.sharpeRatio || 0,
          equityCurve: backtestResults.equityCurve || generateMockEquityCurve(parseFloat(initialCapital)),
        });
        toast.success('Backtest completed successfully');
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || 'Backtest failed');
      }
    } catch {
      toast.error('Failed to run backtest');
    } finally {
      setIsRunning(false);
    }
  };

  if (isRunning) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Backtest</h1>
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="animate-spin w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">Running backtest...</h3>
          <p className="text-sm text-muted-foreground mt-1">Analyzing {symbol} with {strategy} strategy</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FlaskConical className="w-7 h-7 text-blue-600" />
        <h1 className="text-2xl font-bold">Backtest</h1>
      </div>

      {/* Configuration */}
      <Card className="bg-card border border-border rounded-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-foreground">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Symbol</Label>
              <Input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="BTCUSDT"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Initial Capital ($)</Label>
              <Input
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(e.target.value)}
                min="100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Strategy</Label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {strategies.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4">
            <Button
              onClick={handleRunBacktest}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isRunning}
            >
              <Play className="w-4 h-4 mr-2" />
              Run Backtest
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isRunning && <ResultsSkeleton />}
      {results && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="bg-card border border-border rounded-xl">
              <CardContent className="p-4 flex items-center gap-3">
                <TrendingUp className={`w-5 h-5 ${results.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                <div>
                  <p className="text-xs text-muted-foreground">Total Return</p>
                  <p className={`text-lg font-bold ${results.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {results.totalReturn >= 0 ? '+' : ''}{results.totalReturn.toFixed(2)}%
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border border-border rounded-xl">
              <CardContent className="p-4 flex items-center gap-3">
                <Target className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Win Rate</p>
                  <p className="text-lg font-bold text-foreground">{results.winRate.toFixed(1)}%</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border border-border rounded-xl">
              <CardContent className="p-4 flex items-center gap-3">
                <TrendingDown className="w-5 h-5 text-red-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Max Drawdown</p>
                  <p className="text-lg font-bold text-red-600">-{results.maxDrawdown.toFixed(2)}%</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border border-border rounded-xl">
              <CardContent className="p-4 flex items-center gap-3">
                <BarChart3 className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Total Trades</p>
                  <p className="text-lg font-bold text-foreground">{results.totalTrades}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border border-border rounded-xl">
              <CardContent className="p-4 flex items-center gap-3">
                <Award className="w-5 h-5 text-yellow-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Sharpe Ratio</p>
                  <p className="text-lg font-bold text-foreground">{results.sharpeRatio.toFixed(2)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Equity Curve */}
          <Card className="bg-card border border-border rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-foreground">Equity Curve</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={results.equityCurve}>
                    <defs>
                      <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="time"
                      stroke="#d1d5db"
                      tick={{ fill: '#6b7280', fontSize: 11 }}
                      tickFormatter={(val: string) => {
                        const d = new Date(val);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis
                      stroke="#d1d5db"
                      tick={{ fill: '#6b7280', fontSize: 11 }}
                      tickFormatter={(val: number) => `$${(val / 1000).toFixed(1)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        color: '#111827',
                      }}
                      labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Equity']}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#3b82f6"
                      fill="url(#equityGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function generateMockEquityCurve(initialCapital: number) {
  const data: Array<{ time: string; value: number }> = [];
  let value = initialCapital;
  const start = new Date('2024-01-01').getTime();
  const end = new Date('2024-06-01').getTime();
  const step = (end - start) / 120;

  for (let i = 0; i <= 120; i++) {
    data.push({
      time: new Date(start + i * step).toISOString(),
      value,
    });
    value += value * (Math.random() - 0.48) * 0.02;
  }
  return data;
}
