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
    <div className="bg-white border border-border rounded-lg px-3 py-2 shadow-lg">
      <div className="text-muted-foreground text-xs mb-1">{label}</div>
      <div className={cn('text-sm font-bold', isPositive ? 'text-green-600' : 'text-red-600')}>
        ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}

export function PnLChart({ data, height = 300 }: PnLChartProps) {
  const hasData = data.length > 0;

  const latestValue = hasData ? data[data.length - 1].value : 0;
  const gradientId = 'pnlGradient';
  const gradientColor = latestValue >= 0 ? '#16a34a' : '#dc2626';
  const gradientFade = latestValue >= 0 ? 'rgba(22, 163, 74, 0.05)' : 'rgba(220, 38, 38, 0.05)';

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-foreground font-semibold text-sm mb-3">P&L Chart</h3>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="timestamp"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={{ stroke: '#e5e7eb' }}
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
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No P&L data available
          </div>
        )}
      </div>
    </div>
  );
}
