'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Newspaper, RefreshCw, ExternalLink, AlertTriangle,
  Github, GitPullRequest, GitCommit, Star,
  TrendingUp, TrendingDown, Minus, Package, MessageSquare,
  Activity, BarChart3, Clock, ArrowRight, Zap
} from 'lucide-react';
import { toast } from 'sonner';

// ==================== Types ====================

// Known trading instruments and their keyword aliases for impact detection
const INSTRUMENT_MAP: Record<string, string[]> = {
  BTCUSDT: ['btc', 'bitcoin', 'bitcoin (btc)', '₿'],
  ETHUSDT: ['eth', 'ethereum', 'ether', 'etherum', 'Ξ'],
  SOLUSDT: ['sol', 'solana'],
  BNBUSDT: ['bnb', 'binance coin'],
  XRPUSDT: ['xrp', 'ripple'],
  ADAUSDT: ['ada', 'cardano'],
  DOGEUSDT: ['doge', 'dogecoin'],
  AVAXUSDT: ['avax', 'avalanche'],
  DOTUSDT: ['dot', 'polkadot'],
};

// Reverse lookup: keyword → instrument symbol
const KEYWORD_TO_SYMBOL: Record<string, string> = {};
for (const [sym, keywords] of Object.entries(INSTRUMENT_MAP)) {
  for (const kw of keywords) {
    KEYWORD_TO_SYMBOL[kw.toLowerCase()] = sym;
  }
}

interface NewsArticle {
  id: string;
  title: string;
  source: string;
  summary?: string;
  sentiment?: number;
  importance?: number;
  publishedAt?: string;
  sourceUrl?: string;
  tags?: string[];
  content?: string;
}

interface InstrumentImpact {
  symbol: string;        // e.g., "BTCUSDT"
  label: string;         // e.g., "BTC"
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;      // 0-1 estimated impact strength
}

interface GitHubRepoInfo {
  repo: string;
  fullName: string;
  description: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string;
  updatedAt: string;
  stargazersDelta7d: number;
}

interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

interface GitHubIssue {
  id: number;
  title: string;
  url: string;
  state: string;
  author: string;
  createdAt: string;
  labels: string[];
  comments: number;
  reactions: number;
  isPR: boolean;
}

interface GitHubRelease {
  tag: string;
  name: string;
  date: string;
  body: string;
  url: string;
}

interface GitHubActivitySummary {
  repo: string;
  repoInfo: GitHubRepoInfo;
  recentCommits: GitHubCommit[];
  recentIssues: GitHubIssue[];
  recentReleases: GitHubRelease[];
  activityScore: number;
  developerSentiment: 'bullish' | 'neutral' | 'bearish';
  sentimentScore: number;
  topFeatureRequest: string | null;
  topComplaint: string | null;
  lastUpdated: string;
}

interface MarketIntelligence {
  totalReposAnalyzed: number;
  avgActivityScore: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  topMovers: { repo: string; score: number; delta: number }[];
  recentReleasesAcrossRepos: { repo: string; release: GitHubRelease }[];
  hotIssues: { repo: string; issue: GitHubIssue }[];
  timestamp: string;
}

type Tab = 'news' | 'github';

// ==================== Helpers ====================

// ── Time Ago (live updating) ────────────────────────────────

function TimeAgo({ dateStr, className }: { dateStr?: string; className?: string }) {
  const [text, setText] = useState<string>('--');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const format = useCallback((d: Date): string => {
    const now = Date.now();
    const diff = now - d.getTime();
    const abs = Math.abs(diff);

    // Future date
    if (diff < 0) {
      if (abs < 60_000) return `in ${Math.ceil(abs / 1000)}s`;
      if (abs < 3_600_000) return `in ${Math.ceil(abs / 60_000)}m`;
      if (abs < 86_400_000) return `in ${Math.ceil(abs / 3_600_000)}h`;
      return `in ${Math.ceil(abs / 86_400_000)}d`;
    }

    // Past date
    if (abs < 60_000) return `${Math.floor(abs / 1000)}s ago`;
    if (abs < 3_600_000) return `${Math.floor(abs / 60_000)}m ago`;
    if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)}h ago`;
    return `${Math.floor(abs / 86_400_000)}d ago`;
  }, []);

  useEffect(() => {
    if (!dateStr) { setText('unknown'); return; }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) { setText('invalid'); return; }

    setText(format(d));
    // Update every 10s for recent events, every 60s for older
    const rate = Math.abs(Date.now() - d.getTime()) < 3_600_000 ? 10_000 : 60_000;
    intervalRef.current = setInterval(() => setText(format(d)), rate);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [dateStr, format]);

  const isFuture = dateStr ? new Date(dateStr).getTime() > Date.now() : false;

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${className || ''}`}>
      <Clock className="w-3 h-3" />
      <span className={isFuture ? 'text-blue-600 font-medium' : 'text-muted-foreground'}>
        {text}
      </span>
    </span>
  );
}

// ── Instrument Impact Extraction ────────────────────────────

function extractInstruments(article: NewsArticle): InstrumentImpact[] {
  const text = [
    article.title || '',
    article.summary || '',
    ...(article.tags || []),
    ...(article.content ? article.content.slice(0, 500).split(/\s+/) : [])
  ].join(' ').toLowerCase();

  const found = new Map<string, { count: number; sentimentSum: number }>();

  for (const [keyword, symbol] of Object.entries(KEYWORD_TO_SYMBOL)) {
    // Count occurrences using word-boundary-like matching
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      const existing = found.get(symbol) || { count: 0, sentimentSum: 0 };
      found.set(symbol, { count: existing.count + matches.length, sentimentSum: existing.sentimentSum });
    }
  }

  const articleSentiment = article.sentiment ?? 0;

  return Array.from(found.entries()).map(([symbol, data]) => ({
    symbol,
    label: symbol.replace('USDT', ''),
    direction: (
      data.sentimentSum > 0 || (data.sentimentSum === 0 && articleSentiment > 0.15)
        ? 'bullish'
        : data.sentimentSum < 0 || (data.sentimentSum === 0 && articleSentiment < -0.15)
          ? 'bearish'
          : 'neutral'
    ) as 'bullish' | 'bearish' | 'neutral',
    strength: Math.min(1, Math.max(0.2, data.count * 0.25 + Math.abs(articleSentiment) * 0.3)),
  })).sort((a, b) => b.strength - a.strength);
}

function impactColor(dir: InstrumentImpact['direction']): string {
  switch (dir) {
    case 'bullish': return 'bg-green-500/15 text-green-600 border-green-500/30';
    case 'bearish': return 'bg-red-500/15 text-red-600 border-red-500/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

function impactIcon(dir: InstrumentImpact['direction']) {
  switch (dir) {
    case 'bullish': return <TrendingUp className="w-3 h-3" />;
    case 'bearish': return <TrendingDown className="w-3 h-3" />;
    default: return <Minus className="w-3 h-3" />;
  }
}

function expectedOutcomeLabel(sentiment?: number, importance?: number): { label: string; color: string } {
  const imp = importance ?? 0.5;
  const sent = sentiment ?? 0;

  if (sent >= 0.4 && imp >= 0.7) return { label: 'Strong bullish catalyst expected', color: 'text-green-600 bg-green-500/10 border-green-500/20' };
  if (sent <= -0.4 && imp >= 0.7) return { label: 'Strong bearish risk detected', color: 'text-red-600 bg-red-500/10 border-red-500/20' };
  if (sent >= 0.15) return { label: 'Mildly positive outlook', color: 'text-green-700 bg-green-500/5 border-green-500/15' };
  if (sent <= -0.15) return { label: 'Mildly negative pressure', color: 'text-red-700 bg-red-500/5 border-red-500/15' };
  if (imp >= 0.7) return { label: 'High-impact event — volatility likely', color: 'text-amber-600 bg-amber-500/10 border-amber-500/20' };
  return { label: 'Monitoring for directional cues', color: 'text-muted-foreground bg-muted border-border' };
}

// ── Sentiment helpers ───────────────────────────────────────

const sentimentLabel = (score?: number) => {
  if (score == null) return 'neutral';
  if (score > 0.3) return 'positive';
  if (score < -0.3) return 'negative';
  return 'neutral';
};

const sentimentBadgeClass: Record<string, string> = {
  positive: 'bg-green-500/15 text-green-600 border-green-500/30',
  negative: 'bg-red-500/15 text-red-600 border-red-500/30',
  neutral: 'bg-muted text-muted-foreground border-border',
};

function formatStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function SentimentIcon({ sentiment }: { sentiment: 'bullish' | 'neutral' | 'bearish' }) {
  switch (sentiment) {
    case 'bullish': return <TrendingUp className="w-4 h-4 text-green-600" />;
    case 'bearish': return <TrendingDown className="w-4 h-4 text-red-600" />;
    default: return <Minus className="w-4 h-4 text-yellow-600" />;
  }
}

function SentimentBadge({ sentiment }: { sentiment: 'bullish' | 'neutral' | 'bearish' }) {
  const cls = {
    bullish: 'bg-green-500/15 text-green-600 border-green-500/30',
    neutral: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30',
    bearish: 'bg-red-500/15 text-red-600 border-red-500/30',
  };
  return (
    <Badge variant="outline" className={cls[sentiment]}>
      <SentimentIcon sentiment={sentiment} />
      <span className="ml-1 capitalize">{sentiment}</span>
    </Badge>
  );
}

// ==================== Skeletons ====================

function NewsCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

function GitHubCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-5 w-14 ml-auto" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

// ==================== Tab Bar ====================

function TabBar({ activeTab, onTabChange }: { activeTab: Tab; onTabChange: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit mb-6">
      <button
        onClick={() => onTabChange('news')}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          activeTab === 'news'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Newspaper className="w-4 h-4" />
        News Feed
      </button>
      <button
        onClick={() => onTabChange('github')}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          activeTab === 'github'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Github className="w-4 h-4" />
        GitHub Activity
        <span className="text-xs text-blue-500">last30days</span>
      </button>
    </div>
  );
}

// ==================== Market Intelligence Bar ====================

function IntelligenceBar({
  intel,
}: {
  intel: MarketIntelligence | null;
}) {
  if (!intel) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-foreground">Market Intelligence</h3>
        <Badge variant="outline" className="text-muted-foreground ml-auto">
          {intel.totalReposAnalyzed} repos analyzed
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{intel.avgActivityScore}</p>
          <p className="text-xs text-muted-foreground">Avg Activity</p>
        </div>
        <div className="bg-green-500/10 rounded-lg p-3 text-center border border-green-500/20">
          <p className="text-2xl font-bold text-green-600">{intel.bullishCount}</p>
          <p className="text-xs text-muted-foreground">Bullish</p>
        </div>
        <div className="bg-yellow-500/10 rounded-lg p-3 text-center border border-yellow-500/20">
          <p className="text-2xl font-bold text-yellow-700">{intel.neutralCount}</p>
          <p className="text-xs text-muted-foreground">Neutral</p>
        </div>
        <div className="bg-red-500/10 rounded-lg p-3 text-center border border-red-500/20">
          <p className="text-2xl font-bold text-red-600">{intel.bearishCount}</p>
          <p className="text-xs text-muted-foreground">Bearish</p>
        </div>
        <div className="bg-blue-500/10 rounded-lg p-3 text-center border border-blue-500/20 col-span-2 md:col-span-1">
          <p className="text-2xl font-bold text-blue-600">{intel.hotIssues.length}</p>
          <p className="text-xs text-muted-foreground">Hot Issues</p>
        </div>
      </div>
    </div>
  );
}

// ==================== GitHub Repo Card ====================

function RepoCard({ summary }: { summary: GitHubActivitySummary }) {
  const { repoInfo, activityScore, developerSentiment, recentCommits, recentReleases, recentIssues, topFeatureRequest, topComplaint } = summary;

  const prs = recentIssues.filter(i => i.isPR);
  const openIssues = recentIssues.filter(i => !i.isPR && i.state === 'open');

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 transition-colors hover:bg-accent/50">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Github className="w-5 h-5 text-foreground flex-shrink-0" />
          <a
            href={summary.repo ? `https://github.com/${summary.repo}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-foreground hover:text-blue-600 truncate"
          >
            {repoInfo.fullName}
          </a>
          {repoInfo.language && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
              {repoInfo.language}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SentimentBadge sentiment={developerSentiment} />
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 font-medium">
            Score: {activityScore}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <div className="flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-yellow-500" />
          <span className="text-sm font-medium text-foreground">{formatStars(repoInfo.stars)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <GitCommit className="w-3.5 h-3.5 text-purple-500" />
          <span className="text-sm text-muted-foreground">{recentCommits.length} commits</span>
        </div>
        <div className="flex items-center gap-1.5">
          <GitPullRequest className="w-3.5 h-3.5 text-green-600" />
          <span className="text-sm text-muted-foreground">{prs.length} PRs</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-orange-500" />
          <span className="text-sm text-muted-foreground">{openIssues.length} issues</span>
        </div>
      </div>

      {/* Description */}
      {repoInfo.description && (
        <p className="text-sm text-muted-foreground line-clamp-1">{repoInfo.description}</p>
      )}

      {/* Releases */}
      {recentReleases.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Package className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <span className="text-xs text-muted-foreground">
            Latest:{' '}
            <a
              href={recentReleases[0].url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-blue-600 font-medium"
            >
              {recentReleases[0].name || recentReleases[0].tag}
            </a>
            {' '}<span className="text-muted-foreground">{recentReleases[0].date}</span>
          </span>
        </div>
      )}

      {/* Top feature request */}
      {topFeatureRequest && (
        <div className="flex items-center gap-1.5 pt-1 text-xs">
          <TrendingUp className="w-3 h-3 text-green-500 flex-shrink-0" />
          <span className="text-green-700 dark:text-green-400 line-clamp-1">
            Feature request: {topFeatureRequest.slice(0, 80)}
          </span>
        </div>
      )}

      {/* Top complaint */}
      {topComplaint && (
        <div className="flex items-center gap-1.5 pt-1 text-xs">
          <AlertTriangle className="w-3 h-3 text-orange-500 flex-shrink-0" />
          <span className="text-orange-700 dark:text-orange-400 line-clamp-1">
            Issue: {topComplaint.slice(0, 80)}
          </span>
        </div>
      )}
    </div>
  );
}

// ==================== Hot Issues Section ====================

function HotIssuesList({
  issues,
}: {
  issues: { repo: string; issue: GitHubIssue }[] | undefined;
}) {
  if (!issues || issues.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        <Activity className="w-5 h-5 text-orange-500" />
        Hot Issues & PRs
      </h3>
      <div className="space-y-2">
        {issues.map(({ repo, issue }, idx) => (
          <a
            key={`${repo}-${issue.id}`}
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-2.5 rounded-lg bg-muted/50 hover:bg-accent/50 transition-colors group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 group-hover:text-blue-600">
                  {idx + 1}. {issue.title}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {repo} · {issue.author} · {issue.createdAt}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <MessageSquare className="w-3 h-3" />{issue.comments}
                </span>
                {issue.reactions > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-600 font-medium">
                    {issue.reactions}
                  </span>
                )}
                {issue.isPR && (
                  <span className="flex items-center gap-0.5 text-xs text-green-600">
                    <GitPullRequest className="w-3 h-3" />PR
                  </span>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ==================== Recent Releases Section ====================

function RecentReleasesList({
  releases,
}: {
  releases: { repo: string; release: GitHubRelease }[] | undefined;
}) {
  if (!releases || releases.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        <Package className="w-5 h-5 text-blue-500" />
        Recent Releases
      </h3>
      <div className="space-y-2">
        {releases.map(({ repo, release }, idx) => (
          <a
            key={`${repo}-${release.tag}`}
            href={release.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-2.5 rounded-lg bg-muted/50 hover:bg-accent/50 transition-colors group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-blue-600 line-clamp-1">
                  {release.name || release.tag}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {repo} · {release.date}
                </p>
              </div>
              <span className="text-xs text-blue-600 font-mono flex-shrink-0">{release.tag}</span>
            </div>
            {release.body && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{release.body}</p>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

// ==================== Main Page Component ====================

export default function NewsPage() {
  // State
  const [activeTab, setActiveTab] = useState<Tab>('news');
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [githubData, setGithubData] = useState<{
    summaries: GitHubActivitySummary[];
    intelligence: MarketIntelligence | null;
  } | null>(null);
  const [loadingGithub, setLoadingGithub] = useState(false);

  // Fetch news
  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/news');
      if (res.ok) {
        const data = await res.json();
        setNews(data.data || []);
      }
    } catch {
      toast.error('Failed to fetch news');
    } finally {
      setLoadingNews(false);
    }
  }, []);

  // Fetch GitHub activity (powered by last30days)
  const fetchGitHub = useCallback(async () => {
    setLoadingGithub(true);
    try {
      const res = await fetch('/api/trading/github-activity?endpoint=intelligence');
      if (res.ok) {
        const data = await res.json();
        setGithubData(data.data || null);
      }
    } catch {
      toast.error('Failed to fetch GitHub activity');
    } finally {
      setLoadingGithub(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  // Auto-fetch GitHub when switching to tab
  useEffect(() => {
    if (activeTab === 'github' && !githubData) {
      fetchGitHub();
    }
  }, [activeTab, githubData, fetchGitHub]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Newspaper className="w-7 h-7 text-blue-600" />
          <h1 className="text-2xl font-bold">News Analytics</h1>
          <Badge variant="outline" className="text-muted-foreground">
            {news.length} articles
          </Badge>
        </div>
        <Button variant="outline" onClick={() => {
          fetchNews();
          if (activeTab === 'github') fetchGitHub();
        }}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ==================== NEWS TAB ==================== */}
      {activeTab === 'news' && (
        <>
          {loadingNews ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <NewsCardSkeleton key={i} />
              ))}
            </div>
          ) : news.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Newspaper className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No news available</h3>
              <p className="text-sm text-muted-foreground">
                News articles will appear here as they are fetched from configured sources.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {news.map((article) => {
                const isBreaking = (article.importance || 0) >= 0.8;
                const sentiment = sentimentLabel(article.sentiment);
                const impacts = extractInstruments(article);
                const expected = expectedOutcomeLabel(article.sentiment, article.importance);

                return (
                  <div
                    key={article.id}
                    className={`bg-card border rounded-xl p-4 space-y-3 transition-colors hover:bg-accent/50 ${
                      isBreaking ? 'border-red-500/50 border-l-4 border-l-red-500' : 'border-border'
                    }`}
                  >
                    {/* ── Header row: source + breaking badge + time ago + sentiment ── */}
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">{article.source}</span>
                        {isBreaking && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-red-600 font-bold uppercase bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20 animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            Breaking
                          </span>
                        )}
                        {(article.importance ?? 0) >= 0.5 && !isBreaking && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            <Zap className="w-3 h-3" />
                            High Impact
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <TimeAgo dateStr={article.publishedAt} />
                        <Badge variant="outline" className={`${sentimentBadgeClass[sentiment]} text-[10px] px-1.5 py-0`}>
                          {sentiment.toUpperCase()}
                        </Badge>
                      </div>
                    </div>

                    {/* ── Title ── */}
                    <h3 className="font-semibold text-foreground leading-snug text-sm">{article.title}</h3>

                    {/* ── Summary ── */}
                    {article.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{article.summary}</p>
                    )}

                    {/* ── Expected Outcome / Trading Implication ── */}
                    <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${expected.color}`}>
                      <ArrowRight className="w-3 h-3" />
                      {expected.label}
                    </div>

                    {/* ── Instrument Impacts ── */}
                    {impacts.length > 0 && (
                      <div className="space-y-1.5 pt-0.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Expected Impact</p>
                        <div className="flex flex-wrap gap-1.5">
                          {impacts.map((imp) => (
                            <Badge key={imp.symbol} variant="outline" className={`${impactColor(imp.direction)} text-[11px] gap-1 py-0.5`}>
                              {impactIcon(imp.direction)}
                              {imp.label}
                              <span className="opacity-60">
                                {imp.direction === 'bullish' ? '+' : imp.direction === 'bearish' ? '' : '~'}
                                {Math.round(imp.strength * 100)}%
                              </span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Footer: tags + read more ── */}
                    <div className="flex items-center justify-between pt-1 border-t border-border/50 mt-1">
                      <div className="flex items-center gap-1 min-w-0 flex-1 mr-3">
                        {article.tags?.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground truncate max-w-[100px]">
                            {tag}
                          </span>
                        ))}
                      </div>
                      {article.sourceUrl && (
                        <a
                          href={article.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 shrink-0 font-medium"
                        >
                          Read
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ==================== GITHUB TAB (last30days integration) ==================== */}
      {activeTab === 'github' && (
        <div className="space-y-6">
          {/* Powered by badge */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Powered by</span>
            <Badge variant="outline" className="text-blue-600 border-blue-500/30">
              last30days v3.3.2 - GitHub Analysis Module
            </Badge>
            <a
              href="https://github.com/mvanhorn/last30days-skill"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 flex items-center gap-0.5"
            >
              <ExternalLink className="w-3 h-3" />
              Learn more
            </a>
          </div>

          {loadingGithub ? (
            <>
              <IntelligenceBar intel={null} />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 9 }).map((_, i) => (
                  <GitHubCardSkeleton key={i} />
                ))}
              </div>
              <HotIssuesList issues={undefined} />
              <RecentReleasesList releases={undefined} />
            </>
          ) : !githubData ? (
            /* Empty state — click refresh */
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Github className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">GitHub Activity Not Loaded</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Click Refresh to analyze crypto project repositories for trading signals.
              </p>
              <Button onClick={fetchGitHub}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Analyze Repositories
              </Button>
            </div>
          ) : (
            <>
              {/* Market Intelligence Summary */}
              <IntelligenceBar intel={githubData.intelligence} />

              {/* Repo Cards Grid */}
              {githubData.summaries.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-8 text-center">
                  <p className="text-muted-foreground">No repository data returned. Check your GITHUB_TOKEN in .env.local.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {githubData.summaries.map((summary) => (
                    <RepoCard key={summary.repo} summary={summary} />
                  ))}
                </div>
              )}

              {/* Two-column bottom section: Hot Issues + Recent Releases */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
                <HotIssuesList issues={githubData.intelligence?.hotIssues} />
                <RecentReleasesList releases={githubData.intelligence?.recentReleasesAcrossRepos} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
