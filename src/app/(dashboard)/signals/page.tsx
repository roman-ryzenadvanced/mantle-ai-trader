'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Target, RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface Signal {
  id: string;
  symbol: string;
  action: string;
  confidence: number;
  reasoning: string;
  status: string;
  createdAt: string;
}

const actionColors: Record<string, string> = {
  BUY: 'bg-green-500/20 text-green-400 border-green-500/30',
  SELL: 'bg-red-500/20 text-red-400 border-red-500/30',
  HOLD: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const confidenceColor = (value: number) => {
  if (value > 70) return 'bg-green-500';
  if (value >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
};

const confidenceTrackColor = (value: number) => {
  if (value > 70) return 'bg-green-500/20';
  if (value >= 40) return 'bg-yellow-500/20';
  return 'bg-red-500/20';
};

function SignalCardSkeleton() {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24 bg-gray-800" />
        <Skeleton className="h-6 w-16 bg-gray-800" />
      </div>
      <Skeleton className="h-2 w-full bg-gray-800" />
      <Skeleton className="h-16 w-full bg-gray-800" />
      <Skeleton className="h-4 w-32 bg-gray-800" />
    </div>
  );
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/signals');
      if (res.ok) {
        const data = await res.json();
        setSignals(data.data || data.signals || []);
      }
    } catch {
      toast.error('Failed to fetch signals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  const handleExecute = async (signalId: string, symbol: string) => {
    try {
      toast.info(`Executing ${symbol} signal...`);
      const res = await fetch('/api/trading/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'place_order',
          symbol,
          side: 'BUY',
          type: 'MARKET',
          quantity: 0.001,
        }),
      });
      if (res.ok) {
        toast.success(`Signal ${symbol} executed`);
        fetchSignals();
      } else {
        toast.error('Failed to execute signal');
      }
    } catch {
      toast.error('Failed to execute signal');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Trading Signals</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SignalCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Target className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold">Trading Signals</h1>
          <Badge variant="outline" className="text-gray-400 border-gray-700">
            {signals.length} signals
          </Badge>
        </div>
        <Button
          variant="outline"
          className="border-gray-700 text-gray-300 hover:bg-gray-800"
          onClick={fetchSignals}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {signals.length === 0 ? (
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-12 text-center">
          <Zap className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">No signals yet</h3>
          <p className="text-sm text-gray-500">
            Trading signals will appear here once generated. Use the scan feature to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {signals.map((signal) => (
            <Card
              key={signal.id}
              className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-0 overflow-hidden"
            >
              <CardContent className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{signal.symbol}</span>
                  <Badge
                    variant="outline"
                    className={actionColors[signal.action] || actionColors.HOLD}
                  >
                    {signal.action}
                  </Badge>
                </div>

                {/* Confidence Meter */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Confidence</span>
                    <span className="text-gray-300 font-medium">{Math.round(signal.confidence)}%</span>
                  </div>
                  <div className={`h-2 w-full rounded-full ${confidenceTrackColor(signal.confidence)}`}>
                    <div
                      className={`h-full rounded-full transition-all ${confidenceColor(signal.confidence)}`}
                      style={{ width: `${Math.min(signal.confidence, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Reasoning */}
                <p className="text-sm text-gray-400 line-clamp-3">{signal.reasoning}</p>

                {/* Footer */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-gray-500">
                    {new Date(signal.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs text-gray-400 border-gray-700">
                      {signal.status}
                    </Badge>
                    {signal.status === 'PENDING' && (
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                        onClick={() => handleExecute(signal.id, signal.symbol)}
                      >
                        Execute
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
