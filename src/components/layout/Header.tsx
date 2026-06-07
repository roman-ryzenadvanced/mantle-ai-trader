'use client';

import { Brain, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

interface HeaderProps {
  mode: 'demo' | 'live';
  userName: string;
  onSignOut: () => void;
}

export function Header({ mode, userName, onSignOut }: HeaderProps) {
  const isLive = mode === 'live';

  return (
    <header className="bg-background/80 backdrop-blur-md border-b px-4 py-3 flex items-center justify-between sticky top-0 z-50">
      {/* Left: Logo + Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/10">
          <Brain className="w-5 h-5 text-blue-600" />
        </div>
        <span className="text-lg font-semibold tracking-tight">
          Mantle AI Trader
        </span>
      </div>

      {/* Center: Mode Badge */}
      <div className="flex items-center gap-2">
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className={`w-2 h-2 rounded-full ${isLive ? 'bg-red-500' : 'bg-green-500'}`}
        />
        <Badge
          variant="outline"
          className={`${isLive ? 'border-red-500/50 text-red-600' : 'border-green-500/50 text-green-600'} bg-green-500/5`}
        >
          {isLive ? 'LIVE' : 'DEMO'}
        </Badge>
      </div>

      {/* Right: User + Sign Out */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <User className="w-4 h-4" />
          <span className="text-sm hidden sm:inline">{userName}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSignOut}
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline ml-1">Sign Out</span>
        </Button>
      </div>
    </header>
  );
}
