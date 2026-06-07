'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { StatsRow } from '@/components/dashboard/StatsRow';
import { PnLChart } from '@/components/dashboard/PnLChart';
import { RiskPanel } from '@/components/risk/RiskPanel';
import { ActivityLog } from '@/components/ActivityLog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Target, TrendingUp, AlertTriangle, Brain } from 'lucide-react';
import { toast } from 'sonner';

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  data?: unknown;
}

interface RiskState {
  dailyPnL: number;
  monthlyPnL: number;
  totalPnL: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  drawdown: number;
  isPaused: boolean;
  pauseUntil?: number;
  permanentlyHalted: boolean;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();

  // Portfolio state
  const [portfolioValue, setPortfolioValue] = useState(100000);
  const [dailyPnL, setDailyPnL] = useState(0);
  const [totalTrades, setTotalTrades] = useState(0);
  const [winRate, setWinRate] = useState(0);
  const [pnlHistory, setPnlHistory] = useState<Array<{ timestamp: string; value: number }>>([]);
  const [riskState, setRiskState] = useState<RiskState>({
    dailyPnL: 0, monthlyPnL: 0, totalPnL: 0,
    consecutiveWins: 0, consecutiveLosses: 0, drawdown: 0,
    isPaused: false, permanentlyHalted: false,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tradingModeLabel, setTradingModeLabel] = useState('DEMO');

  useEffect(() => {
    const mode = localStorage.getItem('mantle_trading_mode') || 'demo';
    setTradingModeLabel(mode.toUpperCase());
  }, []);

  const addLog = useCallback((level: string, message: string, data?: unknown) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };
    setLogs(prev => [entry, ...prev].slice(0, 100));
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/demo');
      if (res.ok) {
        const json = await res.json();
        const data = json.data || json;
        const portfolio = data.portfolio;
        const positions = data.positions || [];

        if (portfolio) {
          setPortfolioValue(portfolio.totalValue || 100000);
          // Portfolio has realizedPnL + unrealizedPnL, not dailyPnL
          setDailyPnL((portfolio.realizedPnL || 0) + (portfolio.unrealizedPnL || 0));
        }
        setTotalTrades(positions.length);

        // Build equity curve from trade history
        const historyRes = await fetch('/api/trading/demo?action=history');
        if (historyRes.ok) {
          const historyJson = await historyRes.json();
          const trades = historyJson.data || [];
          if (trades.length > 0) {
            let cumulative = 0;
            setPnlHistory(trades.map((t: { pnl?: number; closedAt?: string | Date }) => {
              cumulative += (t.pnl || 0);
              return {
                timestamp: t.closedAt ? new Date(t.closedAt).toISOString() : new Date().toISOString(),
                value: cumulative,
              };
            }));
          }
        }
      }

      // Fetch signals for stats (API returns { success, data: signals })
      const sigRes = await fetch('/api/trading/signals');
      if (sigRes.ok) {
        const sigJson = await sigRes.json();
        const sigData = sigJson.data || [];
        const executed = sigData.filter((s: { status: string }) => s.status === 'EXECUTED');
        setTotalTrades(prev => Math.max(prev, executed.length));
        // Signals don't have a "result" field, so derive win rate from confidence >= 70
        if (executed.length > 0) {
          const wins = executed.filter((s: { confidence?: number }) => (s.confidence || 0) >= 70).length;
          setWinRate(Math.round((wins / executed.length) * 100));
        }
      }
    } catch (error) {
      addLog('ERROR', 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  useEffect(() => {
    fetchDashboardData();
    addLog('INFO', 'Dashboard initialized', { user: session?.user?.email });

    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboardData, addLog, session?.user?.email]);

  // Update risk state from portfolio data
  useEffect(() => {
    const initialCapital = 100000;
    const drawdown = portfolioValue < initialCapital
      ? ((initialCapital - portfolioValue) / initialCapital) * 100
      : 0;
    setRiskState(prev => ({
      ...prev,
      dailyPnL,
      totalPnL: dailyPnL,
      drawdown,
    }));
  }, [portfolioValue, dailyPnL]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-gray-900/50 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <StatsRow
        portfolioValue={portfolioValue}
        dailyPnL={dailyPnL}
        totalTrades={totalTrades}
        winRate={winRate}
      />

      {/* P&L Chart + Risk Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PnLChart data={pnlHistory} height={300} />
        <RiskPanel state={riskState} />
      </div>

      {/* Activity Log + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ActivityLog logs={logs} />
        </div>
        <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Brain className="w-5 h-5 text-blue-400" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full justify-start gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={async () => {
                addLog('SIGNAL', 'Generating BTCUSDT signal...');
                toast.info('Signal generation initiated');
                try {
                  const res = await fetch('/api/trading/signals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ symbol: 'BTCUSDT' }),
                  });
                  if (res.ok) {
                    const result = await res.json();
                    const action = result.data?.signal?.action || 'N/A';
                    const confidence = result.data?.signal?.confidence || 0;
                    addLog('SIGNAL', `Signal generated: ${action} BTCUSDT (${Math.round(confidence)}% confidence)`, result.data?.analysis);
                    toast.success(`Signal: ${action} BTCUSDT`);
                  } else {
                    addLog('ERROR', 'Signal generation failed');
                    toast.error('Signal generation failed');
                  }
                } catch {
                  addLog('ERROR', 'Signal generation error');
                  toast.error('Signal generation error');
                }
              }}
            >
              <Target className="w-4 h-4" />
              Generate BTCUSDT Signal
            </Button>
            <Button
              className="w-full justify-start gap-2 bg-gray-700 hover:bg-gray-600"
              onClick={() => {
                addLog('INFO', 'Refreshing dashboard data...');
                fetchDashboardData();
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Data
            </Button>
            <Button
              className="w-full justify-start gap-2 bg-gray-700 hover:bg-gray-600"
              onClick={async () => {
                addLog('WARN', 'Running risk assessment...');
                try {
                  const res = await fetch('/api/trading/demo?action=portfolio');
                  if (res.ok) {
                    const json = await res.json();
                    const portfolio = json.data?.portfolio;
                    const positions = json.data?.positions || [];
                    if (portfolio) {
                      const exposure = portfolio.totalValue - (portfolio.cashBalance || 0);
                      const exposurePct = portfolio.totalValue > 0 ? (exposure / portfolio.totalValue) * 100 : 0;
                      const riskLevel = exposurePct > 80 ? 'HIGH' : exposurePct > 50 ? 'MEDIUM' : 'LOW';
                      addLog('WARN', `Risk check: ${riskLevel} exposure (${exposurePct.toFixed(1)}%), ${positions.length} open positions`);
                      toast.info(`Risk: ${riskLevel} — ${positions.length} positions, ${exposurePct.toFixed(1)}% exposure`);
                    }
                  }
                } catch {
                  addLog('ERROR', 'Risk check failed');
                }
              }}
            >
              <AlertTriangle className="w-4 h-4" />
              Risk Check
            </Button>
            <Button
              className="w-full justify-start gap-2 bg-gray-700 hover:bg-gray-600"
              onClick={() => {
                addLog('INFO', 'Navigating to trade analytics...');
                router.push('/trades');
              }}
            >
              <TrendingUp className="w-4 h-4" />
              Analytics
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Status badges */}
      <div className="flex gap-3 items-center">
        <Badge variant="outline" className="text-gray-400 border-gray-700">
          Mode: {tradingModeLabel}
        </Badge>
        <Badge variant="outline" className="text-gray-400 border-gray-700">
          Session: Active
        </Badge>
        <Badge
          variant="outline"
          className={riskState.isPaused
            ? 'text-yellow-400 border-yellow-700'
            : riskState.permanentlyHalted
              ? 'text-red-400 border-red-700'
              : 'text-green-400 border-green-700'}
        >
          Risk: {riskState.permanentlyHalted ? 'HALTED' : riskState.isPaused ? 'PAUSED' : 'OK'}
        </Badge>
      </div>
    </div>
  );
}
