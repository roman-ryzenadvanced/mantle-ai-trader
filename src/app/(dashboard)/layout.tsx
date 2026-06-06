'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('dashboard');

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  // Map sidebar tabs to routes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const routeMap: Record<string, string> = {
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
    router.push(routeMap[tab] || '/');
  };

  if (!session) {
    router.push('/login');
    return null;
  }

  const tradingMode = 'demo'; // Default, will be updated client-side

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
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
