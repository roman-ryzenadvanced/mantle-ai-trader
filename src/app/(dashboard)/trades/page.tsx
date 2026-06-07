'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Trade {
  id: string;
  symbol: string;
  side: string;
  orderType: string;
  quantity: number;
  price: number;
  leverage: number;
  pnl?: number;
  status: string;
  closedAt?: string | Date;
}

type FilterTab = 'ALL' | 'OPEN' | 'CLOSED';

const FILTER_TABS: FilterTab[] = ['ALL', 'OPEN', 'CLOSED'];

function TradesSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full rounded-lg" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/demo?action=history');
      if (res.ok) {
        const json = await res.json();
        const rawTrades = json.data || [];
        setTrades(rawTrades.map((t: Record<string, unknown>) => ({
          ...t,
          orderType: t.orderType || t.type || 'MARKET',
          closedAt: t.closedAt || t.filledAt || null,
        })));
      }
    } catch {
      toast.error('Failed to fetch trade history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const filteredTrades = trades.filter((trade) => {
    if (activeTab === 'OPEN') return trade.status === 'OPEN' || trade.status === 'PENDING';
    if (activeTab === 'CLOSED')
      return trade.status === 'FILLED' || trade.status === 'CANCELLED' || trade.status === 'CLOSED';
    return true;
  });

  const pnlClass = (pnl?: number) => {
    if (pnl == null) return 'text-muted-foreground';
    return pnl >= 0 ? 'text-green-600' : 'text-red-600';
  };

  const statusColors: Record<string, string> = {
    OPEN: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
    PENDING: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
    FILLED: 'bg-green-500/15 text-green-600 border-green-500/30',
    CLOSED: 'bg-muted text-muted-foreground border-border',
    CANCELLED: 'bg-red-500/15 text-red-600 border-red-500/30',
  };

  const sideBadgeClass = (side: string) =>
    side === 'BUY'
      ? 'bg-green-500/15 text-green-600 border-green-500/30'
      : 'bg-red-500/15 text-red-600 border-red-500/30';

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Trade History</h1>
        <TradesSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-blue-600" />
          <h1 className="text-2xl font-bold">Trade History</h1>
          <Badge variant="outline" className="text-muted-foreground">
            {filteredTrades.length} trades
          </Badge>
        </div>
        <Button
          variant="outline"
          onClick={fetchTrades}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {filteredTrades.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No trades found</h3>
          <p className="text-sm text-muted-foreground">
            {activeTab === 'ALL'
              ? 'Your trade history will appear here once you start trading.'
              : `No ${activeTab.toLowerCase()} trades to display.`}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-9 gap-3 px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>Symbol</span>
            <span>Side</span>
            <span>Type</span>
            <span>Qty</span>
            <span>Price</span>
            <span>Leverage</span>
            <span>P&L</span>
            <span>Status</span>
            <span>Time</span>
          </div>

          <div className="divide-y divide-border">
            {filteredTrades.map((trade) => (
              <div
                key={trade.id}
                className="grid grid-cols-9 gap-3 px-4 py-3 items-center text-sm hover:bg-accent transition-colors"
              >
                <span className="font-medium text-foreground">{trade.symbol}</span>
                <div>
                  <Badge variant="outline" className={sideBadgeClass(trade.side)}>
                    {trade.side}
                  </Badge>
                </div>
                <span className="text-muted-foreground">{trade.orderType}</span>
                <span className="text-foreground/80">{trade.quantity}</span>
                <span className="text-foreground/80">${trade.price.toFixed(2)}</span>
                <span className="text-muted-foreground">{trade.leverage}x</span>
                <div>
                  {trade.pnl != null ? (
                    <span className={pnlClass(trade.pnl)}>
                      ${trade.pnl.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </div>
                <div>
                  <Badge variant="outline" className={statusColors[trade.status] || ''}>
                    {trade.status}
                  </Badge>
                </div>
                <span className="text-muted-foreground text-xs">
                  {trade.closedAt
                    ? new Date(trade.closedAt).toLocaleDateString()
                    : 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
