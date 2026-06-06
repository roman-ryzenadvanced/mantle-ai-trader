'use client';

import { DollarSign, TrendingUp, TrendingDown, Activity, Target } from 'lucide-react';
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { cn } from '@/lib/utils';

interface StatsRowProps {
  portfolioValue: number;
  dailyPnL: number;
  totalTrades: number;
  winRate: number;
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: [0.0, 0.0, 0.2, 1] as const },
  }),
};

export function StatsRow({ portfolioValue, dailyPnL, totalTrades, winRate }: StatsRowProps) {
  const isPositive = dailyPnL >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Portfolio Value */}
      <motion.div
        custom={0}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4"
      >
        <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
          <DollarSign className="w-4 h-4" />
          <span>Portfolio Value</span>
        </div>
        <div className="text-2xl font-bold text-white">
          <AnimatedCounter value={portfolioValue} prefix="$" decimals={2} />
        </div>
      </motion.div>

      {/* Today's P&L */}
      <motion.div
        custom={1}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4"
      >
        <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
          {isPositive ? (
            <TrendingUp className="w-4 h-4 text-green-400" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-400" />
          )}
          <span>Today&apos;s P&amp;L</span>
        </div>
        <div
          className={cn(
            'text-2xl font-bold',
            isPositive
              ? 'text-green-400 [text-shadow:0_0_12px_rgba(74,222,128,0.4)]'
              : 'text-red-400 [text-shadow:0_0_12px_rgba(248,113,113,0.4)]'
          )}
        >
          <AnimatedCounter
            value={Math.abs(dailyPnL)}
            prefix={isPositive ? '+$' : '-$'}
            decimals={2}
          />
        </div>
      </motion.div>

      {/* Total Trades */}
      <motion.div
        custom={2}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4"
      >
        <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
          <Activity className="w-4 h-4" />
          <span>Total Trades</span>
        </div>
        <div className="text-2xl font-bold text-white">
          <AnimatedCounter value={totalTrades} decimals={0} />
        </div>
      </motion.div>

      {/* Win Rate */}
      <motion.div
        custom={3}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4"
      >
        <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
          <Target className="w-4 h-4" />
          <span>Win Rate</span>
        </div>
        <div className="text-2xl font-bold text-white mb-2">
          <AnimatedCounter value={winRate} suffix="%" decimals={1} />
        </div>
        <Progress value={winRate} className="h-1.5" />
      </motion.div>
    </div>
  );
}
