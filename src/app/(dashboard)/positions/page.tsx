'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Layers, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Position {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  leverage: number;
}

function PositionsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full bg-gray-800 rounded-lg" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full bg-gray-800 rounded-lg" />
      ))}
    </div>
  );
}

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/demo?action=positions');
      if (res.ok) {
        const data = await res.json();
        setPositions(data.data || []);
      }
    } catch {
      toast.error('Failed to fetch positions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const handleClosePosition = async (symbol: string) => {
    try {
      toast.info(`Closing ${symbol} position...`);
      const res = await fetch('/api/trading/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close_position', symbol }),
      });
      if (res.ok) {
        toast.success(`${symbol} position closed`);
        fetchPositions();
      } else {
        toast.error('Failed to close position');
      }
    } catch {
      toast.error('Failed to close position');
    }
  };

  const pnlClass = (pnl: number) =>
    pnl >= 0 ? 'text-green-400' : 'text-red-400';

  const sideBadgeClass = (side: string) =>
    side === 'LONG'
      ? 'bg-green-500/20 text-green-400 border-green-500/30'
      : 'bg-red-500/20 text-red-400 border-red-500/30';

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Positions</h1>
        <PositionsSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold">Positions</h1>
          <Badge variant="outline" className="text-gray-400 border-gray-700">
            {positions.length} open
          </Badge>
        </div>
        <Button
          variant="outline"
          className="border-gray-700 text-gray-300 hover:bg-gray-800"
          onClick={fetchPositions}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {positions.length === 0 ? (
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-12 text-center">
          <Layers className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">No open positions</h3>
          <p className="text-sm text-gray-500">
            Your open positions will appear here. Start trading to see them.
          </p>
        </div>
      ) : (
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-7 gap-4 px-4 py-3 border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <span>Symbol</span>
            <span>Side</span>
            <span>Quantity</span>
            <span>Entry Price</span>
            <span>Current Price</span>
            <span>Unrealized P&L</span>
            <span className="text-right">Actions</span>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-gray-800/50">
            {positions.map((pos) => (
              <div
                key={pos.id}
                className="grid grid-cols-7 gap-4 px-4 py-3 items-center text-sm hover:bg-gray-800/30 transition-colors"
              >
                <span className="font-medium text-white">{pos.symbol}</span>
                <div>
                  <Badge variant="outline" className={sideBadgeClass(pos.side)}>
                    {pos.side}
                  </Badge>
                </div>
                <span className="text-gray-300">{pos.quantity}</span>
                <span className="text-gray-300">${pos.avgEntryPrice.toFixed(2)}</span>
                <span className="text-gray-300">${pos.currentPrice.toFixed(2)}</span>
                <div>
                  <span className={pnlClass(pos.unrealizedPnL)}>
                    ${pos.unrealizedPnL.toFixed(2)} ({pos.unrealizedPnLPercent >= 0 ? '+' : ''}
                    {pos.unrealizedPnLPercent.toFixed(2)}%)
                  </span>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    onClick={() => handleClosePosition(pos.symbol)}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Close
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
