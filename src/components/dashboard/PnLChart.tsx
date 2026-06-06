'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';

interface PnLDataPoint {
  timestamp: string;
  value: number;
}

interface PnLChartProps {
  data: PnLDataPoint[];
  height?: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;

  const value = payload[0].value;
  const isPositive = value >= 0;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-lg">
      <div className="text-gray-400 text-xs mb-1">{label}</div>
      <div className={cn('text-sm font-bold', isPositive ? 'text-green-400' : 'text-red-400')}>
        ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}

export function PnLChart({ data, height = 300 }: PnLChartProps) {
  const hasData = data.length > 0;

  // Determine the dominant color based on latest value
  const latestValue = hasData ? data[data.length - 1].value : 0;
  const gradientId = 'pnlGradient';
  const gradientColor = latestValue >= 0 ? '#22c55e' : '#ef4444';
  const gradientFade = latestValue >= 0 ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)';

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4">
      <h3 className="text-white font-semibold text-sm mb-3">P&L Chart</h3>
      <div style={{ height }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={gradientColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={gradientFade} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis
                dataKey="timestamp"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                axisLine={{ stroke: '#374151' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                axisLine={{ stroke: '#374151' }}
                tickLine={false}
                tickFormatter={(v: number) => `$${v.toLocaleString()}`}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={gradientColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No P&L data available
          </div>
        )}
      </div>
    </div>
  );
}
