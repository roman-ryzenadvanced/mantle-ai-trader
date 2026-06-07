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
      <Skeleton className="h-10 w-full rounded-lg" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default function HistoryPage() {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);

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
    pnl == null ? 'text-muted-foreground' : pnl >= 0 ? 'text-green-600' : 'text-red-600';

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
          <History className="w-7 h-7 text-blue-600" />
          <h1 className="text-2xl font-bold">Session History</h1>
          <Badge variant="outline" className="text-muted-foreground">
            {trades.length} trades
          </Badge>
        </div>
        <Button
          variant="outline"
          onClick={fetchHistory}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border border-border rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-xs text-muted-foreground">Total P&L</p>
              <p className={`text-lg font-bold ${pnlClass(totalPnL)}`}>{formatPnL(totalPnL)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className="text-lg font-bold text-foreground">{winRate}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-xs text-muted-foreground">Best Trade</p>
              <p className="text-lg font-bold text-green-600">{formatPnL(bestTrade)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingDown className="w-5 h-5 text-red-600" />
            <div>
              <p className="text-xs text-muted-foreground">Worst Trade</p>
              <p className="text-lg font-bold text-red-600">{formatPnL(worstTrade)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trade Table */}
      {trades.length === 0 ? (
        <Card className="bg-card border border-border rounded-xl">
          <CardContent className="p-12 text-center">
            <History className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No Trade History</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your trade history will appear here once you start trading. Go to the Signals page to generate and execute your first trade.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 gap-4 px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>Symbol</span>
            <span>Side</span>
            <span>Type</span>
            <span>Quantity</span>
            <span>Price</span>
            <span>P&L</span>
            <span className="text-right">Closed</span>
          </div>

          <div className="divide-y divide-border">
            {trades.map((trade) => (
              <div
                key={trade.id}
                className="grid grid-cols-7 gap-4 px-4 py-3 items-center text-sm hover:bg-accent transition-colors"
              >
                <span className="font-medium text-foreground">{trade.symbol}</span>
                <div>
                  <Badge
                    variant="outline"
                    className={
                      trade.side === 'BUY'
                        ? 'bg-green-500/15 text-green-600 border-green-500/30'
                        : 'bg-red-500/15 text-red-600 border-red-500/30'
                    }
                  >
                    {trade.side}
                  </Badge>
                </div>
                <span className="text-muted-foreground">{trade.type}</span>
                <span className="text-foreground/80">{trade.quantity}</span>
                <span className="text-foreground/80">${trade.price.toFixed(2)}</span>
                <div>
                  {trade.pnl != null ? (
                    <span className={pnlClass(trade.pnl)}>{formatPnL(trade.pnl)}</span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground text-xs">
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
