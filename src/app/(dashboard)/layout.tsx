'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';

const TAB_TO_ROUTE: Record<string, string> = {
  dashboard: '/dashboard',
  terminal: '/terminal',
  signals: '/signals',
  positions: '/positions',
  trades: '/trades',
  backtest: '/backtest',
  settings: '/settings',
  news: '/news',
  history: '/history',
};

const ROUTE_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_TO_ROUTE).map(([k, v]) => [v, k])
);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = ROUTE_TO_TAB[pathname] || 'dashboard';

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  const handleTabChange = (tab: string) => {
    const route = TAB_TO_ROUTE[tab] || '/dashboard';
    router.push(route);
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading' || !session) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const tradingMode = 'demo';

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          mode={tradingMode}
          userName={session.user?.name || 'Trader'}
          onSignOut={handleSignOut}
        />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
