'use client';

import { useState } from 'react';
import {
  LayoutDashboard,
  Terminal,
  Target,
  Layers,
  BarChart3,
  FlaskConical,
  Newspaper,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Brain,
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// ─── Organized Navigation Groups ──────────────────────────────────────

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Trading',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'terminal', label: 'Terminal', icon: Terminal },
      { id: 'signals', label: 'Signals', icon: Target },
      { id: 'positions', label: 'Positions', icon: Layers },
      { id: 'trades', label: 'Trades', icon: BarChart3 },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { id: 'backtest', label: 'Backtest', icon: FlaskConical },
      { id: 'news', label: 'News', icon: Newspaper },
      { id: 'history', label: 'History', icon: History },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

// Flat list for quick lookup (preserves original IDs for route mapping)
export const navItemsFlat: NavItem[] = navGroups.flatMap((g) => g.items);

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const renderButton = (item: NavItem) => {
    const isActive = activeTab === item.id;
    const Icon = item.icon;

    const button = (
      <button
        key={item.id}
        onClick={() => onTabChange(item.id)}
        className={cn(
          'flex items-center gap-3 w-full px-3 py-2 text-sm font-medium transition-colors rounded-lg mx-1',
          isActive
            ? 'bg-blue-600/10 text-blue-600 border-l-2 border-blue-600'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent'
        )}
      >
        <Icon className="w-[18px] h-[18px] shrink-0" />
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
  };

  return (
    <aside
      className={cn(
        'bg-background/80 backdrop-blur-md border-r flex flex-col transition-all duration-300 h-full',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* ═══ Brand / Logo Section ═══ */}
      <div className={cn('flex items-center gap-2.5 px-4 py-4 border-b', collapsed ? 'justify-center' : '')}>
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/10 shrink-0">
          <Brain className="w-5 h-5 text-blue-600" />
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight text-foreground truncate">
            Mantle AI Trader
          </span>
        )}
      </div>

      {/* ═══ Navigation Groups ═══ */}
      <nav className="flex-1 py-3 space-y-4 overflow-y-auto overflow-x-hidden">
        {navGroups.map((group) => (
          <div key={group.label}>
            {/* Section Label (hidden when collapsed) */}
            {!collapsed && (
              <p className="px-5 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {group.label}
              </p>
            )}

            {/* Group items */}
            <div className="space-y-0.5">
              {group.items.map((item) => renderButton(item))}
            </div>

            {/* Separator between groups (hidden when collapsed) */}
            {!collapsed && group.label !== navGroups[navGroups.length - 1].label && (
              <Separator className="mt-3 mx-3" />
            )}
          </div>
        ))}
      </nav>

      {/* ═══ Collapse Toggle ═══ */}
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
