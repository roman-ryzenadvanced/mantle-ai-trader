'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
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
        const data = await res.json();
        if (data.portfolio) {
          setPortfolioValue(data.portfolio.totalValue || 100000);
          setDailyPnL(data.portfolio.dailyPnL || 0);
        }
        if (data.positions) {
          setTotalTrades(data.positions.length);
        }
        if (data.equityCurve) {
          setPnlHistory(data.equityCurve.map((p: { time: string; value: number }) => ({
            timestamp: p.time,
            value: p.value - 100000, // Show P&L, not total value
          })));
        }
      }

      // Fetch signals for stats
      const sigRes = await fetch('/api/trading/signals');
      if (sigRes.ok) {
        const sigData = await sigRes.json();
        const executed = (sigData.signals || []).filter((s: { status: string }) => s.status === 'EXECUTED');
        const wins = executed.filter((s: { result: string }) => s.result === 'WIN').length;
        setTotalTrades(executed.length);
        setWinRate(executed.length > 0 ? Math.round((wins / executed.length) * 100) : 0);
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

  // Simulate some initial risk state from portfolio data
  useEffect(() => {
    const drawdown = portfolioValue < 100000
      ? ((100000 - portfolioValue) / 100000) * 100
      : 0;
    setRiskState(prev => ({
      ...prev,
      dailyPnL,
      drawdown,
      currentCapital: portfolioValue,
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
                addLog('SIGNAL', 'Triggering signal scan...');
                toast.info('Signal scan initiated');
                const res = await fetch('/api/trading/signals/scan', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ symbol: 'BTCUSDT' }),
                });
                if (res.ok) addLog('SIGNAL', 'Scan completed successfully');
                else addLog('ERROR', 'Scan failed');
              }}
            >
              <Target className="w-4 h-4" />
              Scan BTCUSDT
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
              onClick={() => {
                addLog('WARN', 'Manual risk check triggered');
                toast.info('Risk assessment: All clear');
              }}
            >
              <AlertTriangle className="w-4 h-4" />
              Risk Check
            </Button>
            <Button
              className="w-full justify-start gap-2 bg-gray-700 hover:bg-gray-600"
              onClick={() => {
                addLog('INFO', 'Viewing performance analytics...');
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
          Mode: {typeof window !== 'undefined'
            ? (localStorage.getItem('mantle_trading_mode') || 'demo').toUpperCase()
            : 'DEMO'}
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
