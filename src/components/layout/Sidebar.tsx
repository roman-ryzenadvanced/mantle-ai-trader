'use client';

import { useState } from 'react';
import {
  LayoutDashboard,
  Target,
  Layers,
  BarChart3,
  FlaskConical,
  Settings,
  Newspaper,
  History,
  Terminal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'signals', label: 'Signals', icon: Target },
  { id: 'positions', label: 'Positions', icon: Layers },
  { id: 'trades', label: 'Trades', icon: BarChart3 },
  { id: 'backtest', label: 'Backtest', icon: FlaskConical },
  { id: 'news', label: 'News', icon: Newspaper },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'bg-background/80 backdrop-blur-md border-r flex flex-col transition-all duration-300 h-full',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Nav Items */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          const button = (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium transition-colors rounded-lg mx-1',
                isActive
                  ? 'bg-blue-600/10 text-blue-600 border-l-2 border-blue-600'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent'
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.id} delayDuration={0}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return button;
        })}
      </nav>

      {/* Toggle Button */}
      <div className="p-3 border-t">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
