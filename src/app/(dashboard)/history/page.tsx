'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { History, TrendingUp, TrendingDown, Clock, RefreshCw, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface TradeRecord {
  id: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price: number;
  pnl?: number;
  status: string;
  closedAt?: string | Date;
  filledAt?: string | Date;
}

function HistorySkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full bg-gray-800 rounded-lg" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full bg-gray-800 rounded-lg" />
      ))}
    </div>
  );
}

export default function HistoryPage() {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Computed stats from actual data
  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const closedTrades = trades.filter(t => t.pnl != null && t.status !== 'OPEN' && t.status !== 'PENDING');
  const wins = closedTrades.filter(t => (t.pnl || 0) > 0).length;
  const winRate = closedTrades.length > 0 ? Math.round((wins / closedTrades.length) * 100) : 0;
  const bestTrade = closedTrades.length > 0
    ? Math.max(...closedTrades.map(t => t.pnl || 0))
    : 0;
  const worstTrade = closedTrades.length > 0
    ? Math.min(...closedTrades.map(t => t.pnl || 0))
    : 0;

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/demo?action=history');
      if (res.ok) {
        const json = await res.json();
        setTrades(json.data || []);
      }
    } catch {
      toast.error('Failed to fetch trade history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const pnlClass = (pnl?: number) =>
    pnl == null ? 'text-gray-400' : pnl >= 0 ? 'text-green-400' : 'text-red-400';

  const formatPnL = (pnl: number) =>
    `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Session History</h1>
        <HistorySkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold">Session History</h1>
          <Badge variant="outline" className="text-gray-400 border-gray-700">
            {trades.length} trades
          </Badge>
        </div>
        <Button
          variant="outline"
          className="border-gray-700 text-gray-300 hover:bg-gray-800"
          onClick={fetchHistory}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-xs text-gray-500">Total P&L</p>
              <p className={`text-lg font-bold ${pnlClass(totalPnL)}`}>{formatPnL(totalPnL)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-xs text-gray-500">Win Rate</p>
              <p className="text-lg font-bold text-white">{winRate}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-xs text-gray-500">Best Trade</p>
              <p className="text-lg font-bold text-green-400">{formatPnL(bestTrade)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingDown className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-xs text-gray-500">Worst Trade</p>
              <p className="text-lg font-bold text-red-400">{formatPnL(worstTrade)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trade Table */}
      {trades.length === 0 ? (
        <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl">
          <CardContent className="p-12 text-center">
            <History className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-300 mb-2">No Trade History</h2>
            <p className="text-gray-400 max-w-md mx-auto">
              Your trade history will appear here once you start trading. Go to the Signals page to generate and execute your first trade.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-7 gap-4 px-4 py-3 border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <span>Symbol</span>
            <span>Side</span>
            <span>Type</span>
            <span>Quantity</span>
            <span>Price</span>
            <span>P&L</span>
            <span className="text-right">Closed</span>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-gray-800/50">
            {trades.map((trade) => (
              <div
                key={trade.id}
                className="grid grid-cols-7 gap-4 px-4 py-3 items-center text-sm hover:bg-gray-800/30 transition-colors"
              >
                <span className="font-medium text-white">{trade.symbol}</span>
                <div>
                  <Badge
                    variant="outline"
                    className={
                      trade.side === 'BUY'
                        ? 'bg-green-500/20 text-green-400 border-green-500/30'
                        : 'bg-red-500/20 text-red-400 border-red-500/30'
                    }
                  >
                    {trade.side}
                  </Badge>
                </div>
                <span className="text-gray-400">{trade.type}</span>
                <span className="text-gray-300">{trade.quantity}</span>
                <span className="text-gray-300">${trade.price.toFixed(2)}</span>
                <div>
                  {trade.pnl != null ? (
                    <span className={pnlClass(trade.pnl)}>{formatPnL(trade.pnl)}</span>
                  ) : (
                    <span className="text-gray-500">--</span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-gray-500 text-xs">
                    {trade.closedAt
                      ? new Date(trade.closedAt).toLocaleDateString()
                      : trade.filledAt
                        ? new Date(trade.filledAt).toLocaleDateString()
                        : 'N/A'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
