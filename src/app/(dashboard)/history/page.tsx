'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History, TrendingUp, TrendingDown, Clock } from 'lucide-react';

const placeholderStats = {
  totalSessions: 24,
  bestSession: '+$3,241.50',
  worstSession: '-$892.30',
  avgSessionDuration: '2h 14m',
};

export default function HistoryPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <History className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold">Session History</h1>
      </div>

      {/* Placeholder Message */}
      <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl">
        <CardContent className="p-12 text-center">
          <History className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-300 mb-2">Coming Soon</h2>
          <p className="text-gray-400 max-w-md mx-auto">
            Session history tracking will be available in the next update. This will include
            detailed session logs, performance breakdowns, and trade-by-trade analysis.
          </p>
        </CardContent>
      </Card>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-xs text-gray-500">Total Sessions</p>
              <p className="text-lg font-bold text-white">{placeholderStats.totalSessions}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-xs text-gray-500">Best Session</p>
              <p className="text-lg font-bold text-green-400">{placeholderStats.bestSession}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingDown className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-xs text-gray-500">Worst Session</p>
              <p className="text-lg font-bold text-red-400">{placeholderStats.worstSession}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <History className="w-5 h-5 text-purple-400" />
            <div>
              <p className="text-xs text-gray-500">Avg Duration</p>
              <p className="text-lg font-bold text-white">{placeholderStats.avgSessionDuration}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
