'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  data?: unknown;
}

interface ActivityLogProps {
  logs: LogEntry[];
  maxItems?: number;
}

const LOG_CONFIG: Record<string, { emoji: string; color: string; bg: string }> = {
  TRADE: { emoji: '💰', color: 'text-green-600', bg: 'bg-green-500/10' },
  SIGNAL: { emoji: '🎯', color: 'text-blue-600', bg: 'bg-blue-500/10' },
  ERROR: { emoji: '❌', color: 'text-red-600', bg: 'bg-red-500/10' },
  WARN: { emoji: '⚠️', color: 'text-yellow-600', bg: 'bg-yellow-500/10' },
  INFO: { emoji: '📋', color: 'text-muted-foreground', bg: 'bg-muted' },
};

const ALL_LEVELS = ['TRADE', 'SIGNAL', 'ERROR', 'WARN', 'INFO'];

export function ActivityLog({ logs, maxItems = 100 }: ActivityLogProps) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  const filteredLogs = useMemo(() => {
    const items = activeFilter ? logs.filter((l) => l.level === activeFilter) : logs;
    return items.slice(-maxItems);
  }, [logs, activeFilter, maxItems]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredLogs.length]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleFilter = (level: string) => {
    setActiveFilter((prev) => (prev === level ? null : level));
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-foreground font-semibold text-sm">Activity Log</h3>
      </div>

      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {ALL_LEVELS.map((level) => {
          const config = LOG_CONFIG[level] ?? LOG_CONFIG.INFO;
          const isActive = activeFilter === level;
          return (
            <button
              key={level}
              onClick={() => toggleFilter(level)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors border',
                isActive
                  ? cn(config.bg, config.color, 'border-current/30')
                  : 'text-muted-foreground border-border hover:bg-accent hover:text-foreground'
              )}
            >
              <span>{config.emoji}</span>
              {level}
            </button>
          );
        })}
        {activeFilter && (
          <button
            onClick={() => setActiveFilter(null)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground border border-border hover:bg-accent hover:text-foreground transition-colors"
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Log Entries */}
      <div className="max-h-80 overflow-y-auto rounded-lg bg-muted/50 border border-border">
        <ScrollArea className="h-full max-h-80">
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              No log entries
            </div>
          ) : (
            <div className="space-y-px">
              {filteredLogs.map((entry) => {
                const config = LOG_CONFIG[entry.level] ?? LOG_CONFIG.INFO;
                const isExpanded = expandedIds.has(entry.id);
                const hasData = entry.data !== undefined && entry.data !== null;

                return (
                  <div
                    key={entry.id}
                    className={cn(
                      'px-3 py-2 border-b border-border/50 last:border-0 transition-colors',
                      config.bg,
                      isExpanded && 'bg-opacity-20'
                    )}
                  >
                    <div
                      className="flex items-start gap-2 cursor-pointer"
                      onClick={() => hasData && toggleExpand(entry.id)}
                    >
                      <span className="text-sm mt-0.5 shrink-0">{config.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-1.5 py-0 border-current/20',
                              config.color
                            )}
                          >
                            {entry.level}
                          </Badge>
                          <span className="text-muted-foreground text-xs font-mono">
                            {entry.timestamp}
                          </span>
                        </div>
                        <p className={cn('text-sm mt-0.5 break-words', config.color)}>
                          {entry.message}
                        </p>
                        {isExpanded && hasData && (
                          <pre className="mt-2 p-2 bg-muted rounded-md text-xs text-muted-foreground overflow-x-auto font-mono">
                            {typeof entry.data === 'string'
                              ? entry.data
                              : JSON.stringify(entry.data, null, 2)}
                          </pre>
                        )}
                      </div>
                      {hasData && (
                        <span className="text-muted-foreground text-xs shrink-0 mt-1">
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div ref={bottomRef} />
        </ScrollArea>
      </div>
    </div>
  );
}
