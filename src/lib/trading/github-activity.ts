/**
 * GitHub Activity Analyzer — TypeScript port of last30days GitHub module.
 *
 * Fetches live repo info (stars, forks, issues), recent commits, open PRs,
 * releases, and top issues for tracked crypto project repos. Provides an
 * activity score and developer sentiment signal for use as a trading signal.
 *
 * Uses the public GitHub REST API. Optionally authenticated via GITHUB_TOKEN
 * for higher rate limits.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubRepoInfo {
  repo: string;
  fullName: string;
  description: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string;
  updatedAt: string;
  stargazersDelta7d: number; // approximate weekly star change
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GitHubIssue {
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

export interface GitHubRelease {
  tag: string;
  name: string;
  date: string;
  body: string;
  url: string;
}

export interface GitHubActivitySummary {
  repo: string;
  repoInfo: GitHubRepoInfo;
  recentCommits: GitHubCommit[];
  recentIssues: GitHubIssue[];
  recentReleases: GitHubRelease[];
  activityScore: number;        // 0-100 composite score
  developerSentiment: 'bullish' | 'neutral' | 'bearish';
  sentimentScore: number;       // -1 to 1
  topFeatureRequest: string | null;
  topComplaint: string | null;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Default tracked crypto repos
// ---------------------------------------------------------------------------

// Repo categories for display and filtering
export type RepoCategory = 'crypto' | 'trading' | 'defi' | 'forex' | 'economics' | 'ai-tools' | 'infra';

export interface RepoMeta {
  repo: string;
  category: RepoCategory;
}

export const DEFAULT_CRYPTO_REPOS: string[] = [
  // ── Crypto Core (blockchains & protocols) ──
  'bitcoin/bitcoin',
  'ethereum/go-ethereum',
  'solana-labs/solana',
  'cardano-foundation/cardano-node',
  'MoneroProject/monero',

  // ── DeFi Protocols ──
  'Uniswap/uniswapx',
  'Uniswap/v3-core',
  'aave/aave-v3-core',
  'makerdao/dss',
  'compound-finance/compound-protocol',
  'curvefi/curve-contract',
  'sushiswap/sushiswap',

  // ── Trading Systems & Bots ──
  'freqtrade/freqtrade',           // Python crypto trading bot
  'hummingbot/humblingbot',        // Market-making bot (exchange-agnostic)
  'ccxt/ccxt',                     // Unified crypto exchange API
  'jesse-ai/jesse',                // AI crypto trading framework
  'vnpy/vnpy',                     // Python trading framework (futures, forex)
  'tensortrade-org/tensortrade',   // RL-based trading framework

  // ── AI / ML for Finance ──
  'AI4Finance-Foundation/FinRL',   // Deep reinforcement learning for finance
  'openai/whisper',                // Speech-to-text (news sentiment analysis)
  'huggingface/transformers',      // NLP for news/text analysis
  'pytorch/pytorch',               // ML backbone for models

  // ── Forex / Macro Systems ──
  'datasets/currency-exchange-rates', // Open forex data
  'QuantLib/quantlib',              // Quantitative finance library (FX, rates)
  'ta-lib/ta-lib',                  // Technical analysis library (all markets)

  // ── Infrastructure & Tooling ──
  'maticnetwork/bor',              // Polygon PoS client
  'ArbitrumFoundation/arbitrum-tutorials',
  'prometheus/prometheus',         // Monitoring infrastructure
  'grafana/grafana',               // Dashboards for trading metrics
];

// Category metadata for each tracked repo
export const REPO_CATEGORIES: Record<string, RepoCategory> = {
  'bitcoin/bitcoin': 'crypto',
  'ethereum/go-ethereum': 'crypto',
  'solana-labs/solana': 'crypto',
  'cardano-foundation/cardano-node': 'crypto',
  'MoneroProject/monero': 'crypto',
  'Uniswap/uniswapx': 'defi',
  'Uniswap/v3-core': 'defi',
  'aave/aave-v3-core': 'defi',
  'makerdao/dss': 'defi',
  'compound-finance/compound-protocol': 'defi',
  'curvefi/curve-contract': 'defi',
  'sushiswap/sushiswap': 'defi',
  'freqtrade/freqtrade': 'trading',
  'hummingbot/hummingbot': 'trading',
  'ccxt/ccxt': 'trading',
  'jesse-ai/jesse': 'trading',
  'vnpy/vnpy': 'trading',
  'tensortrade-org/tensortrade': 'trading',
  'AI4Finance-Foundation/FinRL': 'ai-tools',
  'openai/whisper': 'ai-tools',
  'huggingface/transformers': 'ai-tools',
  'pytorch/pytorch': 'ai-tools',
  'datasets/currency-exchange-rates': 'forex',
  'QuantLib/quantlib': 'economics',
  'ta-lib/ta-lib': 'trading',
  'maticnetwork/bor': 'crypto',
  'ArbitrumFoundation/arbitrum-tutorials': 'crypto',
  'prometheus/prometheus': 'infra',
  'grafana/grafana': 'infra',
};

// Human-readable labels for categories
export const CATEGORY_LABELS: Record<RepoCategory, { label: string; color: string; icon: string }> = {
  crypto:     { label: 'Blockchain', color: 'bg-orange-500/15 text-orange-600 border-orange-500/30', icon: '⛓️' },
  defi:       { label: 'DeFi',       color: 'bg-purple-500/15 text-purple-600 border-purple-500/30', icon: '🏦' },
  trading:    { label: 'Trading',    color: 'bg-green-500/15 text-green-600 border-green-500/30', icon: '📈' },
  forex:      { label: 'Forex/FX',   color: 'bg-blue-500/15 text-blue-600 border-blue-500/30', icon: '💱' },
  economics:  { label: 'Economics',  color: 'bg-amber-500/15 text-amber-600 border-amber-500/30', icon: '📊' },
  'ai-tools': { label: 'AI/ML',      color: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30', icon: '🤖' },
  infra:      { label: 'Infra',      color: 'bg-gray-500/15 text-gray-600 border-gray-500/30', icon: '🔧' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GITHUB_API = 'https://api.github.com';

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mantle-ai-trader/3.7',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function fetchJSON(url: string, timeout = 15000): Promise<any> {
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(timeout) });
  if (!res.ok) {
    if (res.status === 403) throw new Error('GitHub API rate limit exceeded');
    if (res.status === 404) throw new Error(`GitHub resource not found: ${url}`);
    throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

function parseDate(iso?: string): string {
  if (!iso) return '';
  try { return new Date(iso).toISOString().split('T')[0]; }
  catch { return ''; }
}

function formatStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Core fetch functions
// ---------------------------------------------------------------------------

async function fetchRepoInfo(repo: string): Promise<GitHubRepoInfo> {
  const data = await fetchJSON(`${GITHUB_API}/repos/${repo}`);
  return {
    repo,
    fullName: data.full_name || repo,
    description: (data.description || '').slice(0, 200),
    stars: data.stargazers_count || 0,
    forks: data.forks_count || 0,
    openIssues: data.open_issues_count || 0,
    language: data.language || '',
    updatedAt: data.updated_at || '',
    stargazersDelta7d: 0, // computed separately
  };
}

async function fetchRecentCommits(repo: string, count = 10): Promise<GitHubCommit[]> {
  const data = await fetchJSON(
    `${GITHUB_API}/repos/${repo}/commits?per_page=${count}`,
  );
  return (Array.isArray(data) ? data : []).map((c: any) => ({
    sha: c.sha?.slice(0, 7) || '',
    message: (c.commit?.message || '').split('\n')[0].slice(0, 120),
    author: c.commit?.author?.name || c.author?.login || '',
    date: parseDate(c.commit?.author?.date),
    url: c.html_url || '',
  }));
}

async function fetchRecentIssues(repo: string, since: string, count = 15): Promise<GitHubIssue[]> {
  const q = encodeURIComponent(`repo:${repo} created:>${since}`);
  const data = await fetchJSON(
    `${GITHUB_API}/search/issues?q=${q}&sort=reactions&order=desc&per_page=${count}`,
  );
  return (data.items || []).map((item: any) => ({
    id: item.number || item.id,
    title: item.title || '',
    url: item.html_url || '',
    state: item.state || '',
    author: item.user?.login || '',
    createdAt: parseDate(item.created_at),
    labels: (item.labels || []).map((l: any) => l.name || ''),
    comments: item.comments || 0,
    reactions: item.reactions?.total_count || 0,
    isPR: 'pull_request' in item,
  }));
}

async function fetchReleases(repo: string, count = 3): Promise<GitHubRelease[]> {
  const data = await fetchJSON(
    `${GITHUB_API}/repos/${repo}/releases?per_page=${count}`,
  );
  return (Array.isArray(data) ? data : []).map((r: any) => ({
    tag: r.tag_name || '',
    name: r.name || r.tag_name || '',
    date: parseDate(r.published_at),
    body: (r.body || '').slice(0, 300),
    url: r.html_url || '',
  }));
}

async function fetchTopIssue(
  repo: string,
  label: string,
  sortBy: string,
): Promise<{ title: string; reactions: number; comments: number; url: string } | null> {
  const q = encodeURIComponent(`repo:${repo} is:issue is:open label:${label}`);
  const url = `${GITHUB_API}/search/issues?q=${q}&sort=${sortBy}&order=desc&per_page=1`;
  try {
    const data = await fetchJSON(url);
    if (data.items?.length > 0) {
      const item = data.items[0];
      return {
        title: item.title || '',
        reactions: item.reactions?.total_count || 0,
        comments: item.comments || 0,
        url: item.html_url || '',
      };
    }
  } catch { /* skip */ }
  return null;
}

// ---------------------------------------------------------------------------
// Activity scoring (inspired by last30days relevance computation)
// ---------------------------------------------------------------------------

function computeActivityScore(
  repoInfo: GitHubRepoInfo,
  commits: GitHubCommit[],
  issues: GitHubIssue[],
  releases: GitHubRelease[],
): number {
  // Commit velocity (commits in last 7 days)
  const commitScore = Math.min(30, commits.length * 3);

  // Issue/PR activity
  const prs = issues.filter(i => i.isPR);
  const issueScore = Math.min(20, issues.length * 2 + prs.length * 3);

  // Engagement on issues (reactions + comments)
  const totalEngagement = issues.reduce((sum, i) => sum + i.reactions + i.comments, 0);
  const engagementScore = Math.min(15, Math.log1p(totalEngagement) * 3);

  // Release freshness
  const releaseScore = releases.length > 0
    ? Math.min(15, 5 + releases.length * 5)
    : 0;

  // Star momentum (higher stars = bigger community)
  const starScore = Math.min(10, Math.log1p(repoInfo.stars) / 2);

  // Fork activity
  const forkScore = Math.min(10, Math.log1p(repoInfo.forks) / 2);

  return Math.round(commitScore + issueScore + engagementScore + releaseScore + starScore + forkScore);
}

function computeDeveloperSentiment(
  issues: GitHubIssue[],
  releases: GitHubRelease[],
  repoInfo: GitHubRepoInfo,
): { sentiment: 'bullish' | 'neutral' | 'bearish'; score: number } {
  let bullish = 0;
  let bearish = 0;

  // Recent releases are bullish (active development)
  if (releases.length > 0) bullish += 0.3;

  // High star count = strong community
  if (repoInfo.stars > 10000) bullish += 0.1;
  if (repoInfo.stars > 50000) bullish += 0.1;

  // Many merged PRs = bullish
  const mergedPRs = issues.filter(i => i.isPR && i.state === 'closed');
  if (mergedPRs.length > 5) bullish += 0.2;
  if (mergedPRs.length > 10) bullish += 0.1;

  // Many open bugs = bearish
  const bugLabels = ['bug', 'crash', 'error', 'critical', 'regression', 'vulnerability'];
  const bugIssues = issues.filter(i =>
    i.labels.some(l => bugLabels.includes(l.toLowerCase())) && i.state === 'open',
  );
  if (bugIssues.length > 5) bearish += 0.2;
  if (bugIssues.length > 10) bearish += 0.1;

  // High issue-to-PR ratio suggests maintenance burden
  const openIssues = issues.filter(i => !i.isPR && i.state === 'open');
  if (openIssues.length > 20) bearish += 0.1;

  const score = bullish - bearish;
  const sentiment: 'bullish' | 'neutral' | 'bearish' =
    score > 0.2 ? 'bullish' : score < -0.2 ? 'bearish' : 'neutral';

  return { sentiment, score: Math.max(-1, Math.min(1, score)) };
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

export async function analyzeRepo(repo: string): Promise<GitHubActivitySummary> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const [repoInfo, commits, issues, releases] = await Promise.allSettled([
    fetchRepoInfo(repo),
    fetchRecentCommits(repo, 10),
    fetchRecentIssues(repo, sevenDaysAgo, 15),
    fetchReleases(repo, 3),
  ]);

  const safeRepoInfo = repoInfo.status === 'fulfilled'
    ? repoInfo.value
    : { repo, fullName: repo, description: '', stars: 0, forks: 0, openIssues: 0, language: '', updatedAt: '', stargazersDelta7d: 0 };

  const safeCommits = commits.status === 'fulfilled' ? commits.value : [];
  const safeIssues = issues.status === 'fulfilled' ? issues.value : [];
  const safeReleases = releases.status === 'fulfilled' ? releases.value : [];

  const activityScore = computeActivityScore(safeRepoInfo, safeCommits, safeIssues, safeReleases);
  const { sentiment, score } = computeDeveloperSentiment(safeIssues, safeReleases, safeRepoInfo);

  // Fetch top feature request and complaint in parallel
  const [topFeature, topComplaint] = await Promise.allSettled([
    fetchTopIssue(repo, 'enhancement', 'reactions'),
    fetchTopIssue(repo, 'bug', 'comments'),
  ]);

  return {
    repo,
    repoInfo: safeRepoInfo,
    recentCommits: safeCommits,
    recentIssues: safeIssues,
    recentReleases: safeReleases,
    activityScore,
    developerSentiment: sentiment,
    sentimentScore: score,
    topFeatureRequest: topFeature.status === 'fulfilled' ? topFeature.value?.title || null : null,
    topComplaint: topComplaint.status === 'fulfilled' ? topComplaint.value?.title || null : null,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Analyze multiple repos in parallel (max 5 concurrent to respect rate limits).
 */
export async function analyzeRepos(
  repos: string[],
  concurrency = 5,
): Promise<GitHubActivitySummary[]> {
  const results: GitHubActivitySummary[] = [];

  for (let i = 0; i < repos.length; i += concurrency) {
    const batch = repos.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(repo => analyzeRepo(repo)),
    );
    for (const result of batchResults) {
      if (result.status === 'fulfilled') results.push(result.value);
    }
  }

  return results.sort((a, b) => b.activityScore - a.activityScore);
}

/**
 * Compute a cross-repo market intelligence summary.
 */
export interface MarketIntelligence {
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

export async function computeMarketIntelligence(
  summaries: GitHubActivitySummary[],
): Promise<MarketIntelligence> {
  const bullishCount = summaries.filter(s => s.developerSentiment === 'bullish').length;
  const bearishCount = summaries.filter(s => s.developerSentiment === 'bearish').length;
  const neutralCount = summaries.filter(s => s.developerSentiment === 'neutral').length;
  const avgActivityScore = summaries.length > 0
    ? Math.round(summaries.reduce((sum, s) => sum + s.activityScore, 0) / summaries.length)
    : 0;

  // Top movers: repos with highest activity
  const topMovers = summaries
    .slice(0, 5)
    .map(s => ({ repo: s.repo, score: s.activityScore, delta: s.repoInfo.stargazersDelta7d }));

  // Recent releases across all repos
  const recentReleases = summaries.flatMap(s =>
    s.recentReleases.map(r => ({ repo: s.repo, release: r })),
  ).sort((a, b) => b.release.date.localeCompare(a.release.date)).slice(0, 10);

  // Hot issues (highest engagement)
  const hotIssues = summaries.flatMap(s =>
    s.recentIssues.map(i => ({ repo: s.repo, issue: i })),
  ).sort((a, b) => (b.issue.reactions + b.issue.comments) - (a.issue.reactions + a.issue.comments))
    .slice(0, 10);

  return {
    totalReposAnalyzed: summaries.length,
    avgActivityScore,
    bullishCount,
    bearishCount,
    neutralCount,
    topMovers,
    recentReleasesAcrossRepos: recentReleases,
    hotIssues,
    timestamp: new Date().toISOString(),
  };
}

export { formatStars, parseDate };
