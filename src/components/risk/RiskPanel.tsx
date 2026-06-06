'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface RiskPanelProps {
  state: {
    dailyPnL: number;
    monthlyPnL: number;
    totalPnL: number;
    consecutiveWins: number;
    consecutiveLosses: number;
    drawdown: number;
    isPaused: boolean;
    pauseUntil?: number;
    permanentlyHalted: boolean;
  };
}

function formatPnL(value: number): string {
  const prefix = value >= 0 ? '+$' : '-$';
  return `${prefix}${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pnlColor(value: number): string {
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-400';
}

function PauseCountdown({ pauseUntil }: { pauseUntil?: number }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!pauseUntil) return;

    const tick = () => {
      const diff = pauseUntil - Date.now();
      if (diff <= 0) {
        setRemaining('Resuming...');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(`${mins}m ${secs}s`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pauseUntil]);

  if (!pauseUntil) return null;

  return (
    <div className="text-yellow-400 text-sm font-mono mt-1">
      Resumes in: {remaining}
    </div>
  );
}

function MetricCard({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4', className)}>
      <div className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

export function RiskPanel({ state }: RiskPanelProps) {
  const circuitStatus = state.permanentlyHalted
    ? 'HALTED'
    : state.isPaused
      ? 'PAUSED'
      : 'OK';

  const statusColor = {
    OK: 'text-green-400',
    PAUSED: 'text-yellow-400',
    HALTED: 'text-red-400',
  }[circuitStatus];

  const statusBg = {
    OK: 'bg-green-500/20 border-green-500/30',
    PAUSED: 'bg-yellow-500/20 border-yellow-500/30',
    HALTED: 'bg-red-500/20 border-red-500/30',
  }[circuitStatus];

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4">
      <h3 className="text-white font-semibold text-sm mb-3">Risk Management</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Daily P&L */}
        <MetricCard label="Daily P&L">
          <span className={cn('text-lg font-bold', pnlColor(state.dailyPnL))}>
            {formatPnL(state.dailyPnL)}
          </span>
        </MetricCard>

        {/* Monthly P&L */}
        <MetricCard label="Monthly P&L">
          <span className={cn('text-lg font-bold', pnlColor(state.monthlyPnL))}>
            {formatPnL(state.monthlyPnL)}
          </span>
        </MetricCard>

        {/* Total P&L */}
        <MetricCard label="Total P&L">
          <span className={cn('text-lg font-bold', pnlColor(state.totalPnL))}>
            {formatPnL(state.totalPnL)}
          </span>
        </MetricCard>

        {/* Consecutive Wins/Losses */}
        <MetricCard label="Consecutive W/L">
          <div className="flex items-center gap-2">
            <span className="text-green-400 text-lg font-bold">W: {state.consecutiveWins}</span>
            <span className="text-gray-600">/</span>
            <span className="text-red-400 text-lg font-bold">L: {state.consecutiveLosses}</span>
          </div>
        </MetricCard>

        {/* Drawdown */}
        <MetricCard label="Drawdown">
          <div className="flex items-center justify-between mb-1">
            <span className={cn('text-lg font-bold', state.drawdown > 15 ? 'text-red-400' : 'text-yellow-400')}>
              {state.drawdown.toFixed(1)}%
            </span>
          </div>
          <Progress
            value={state.drawdown}
            className={cn(
              'h-1.5',
              state.drawdown > 15
                ? '[&>div]:bg-red-500'
                : '[&>div]:bg-yellow-500'
            )}
          />
        </MetricCard>

        {/* Circuit Breaker Status */}
        <MetricCard label="Circuit Breaker">
          <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm font-medium', statusBg, statusColor)}>
            <div className={cn('w-2 h-2 rounded-full', circuitStatus === 'OK' ? 'bg-green-400' : circuitStatus === 'PAUSED' ? 'bg-yellow-400' : 'bg-red-400')} />
            {circuitStatus}
          </div>
          {state.isPaused && state.pauseUntil && (
            <PauseCountdown pauseUntil={state.pauseUntil} />
          )}
        </MetricCard>
      </div>
    </div>
  );
}
