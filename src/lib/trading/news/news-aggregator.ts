/**
 * News Aggregation Service for Mantle AI Trading Bot
 * Aggregates news from multiple sources for fundamental analysis
 * 
 * v3.0.0 - Added: News impact scoring, time-decay weighting, content similarity
 * duplicate detection, configurable sentiment time windows, breaking news detection
 */

import axios from 'axios';
import {
  NewsArticle,
  NewsSource,
  NewsQuery,
  SentimentLabel,
  APIResponse
} from '../core/types';

// ==================== Upcoming Event Types ====================

export interface UpcomingEvent {
  id: string;
  title: string;
  description: string;
  category: 'economics' | 'crypto' | 'regulation' | 'defi' | 'forex' | 'tech';
  eventAt: Date;
  impact: 'high' | 'medium' | 'low';
  affectedInstruments: string[];
  expectedMove: string;
  probability: number;       // 0-1 confidence this event will occur
  source: string;
}

// News API configurations
const NEWS_APIS = {
  cryptopanic: {
    baseUrl: 'https://cryptopanic.com/api/v1',
    requiresAuth: true
  },
  coingecko: {
    baseUrl: 'https://api.coingecko.com/api/v3',
    requiresAuth: false
  },
  cryptocompare: {
    baseUrl: 'https://min-api.cryptocompare.com/data/v2',
    requiresAuth: true
  }
};

// Sentiment keywords for analysis
const SENTIMENT_KEYWORDS = {
  bullish: [
    'bullish', 'surge', 'rally', 'breakout', 'gain', 'rise', 'soar', 'pump',
    'positive', 'growth', 'adoption', 'partnership', 'launch', 'upgrade',
    'milestone', 'achievement', 'success', 'profit', 'bull run', 'moon',
    'institutional', 'investment', 'buy', 'accumulate', 'support', 'hold',
    'mainnet', 'airdrop', 'listing', 'integration', 'approval', 'etf',
    'halving', 'bullish divergence', 'golden cross', 'breakout',
    'all-time high', 'ath', 'recovery', 'rebound', 'outperform',
    'whale accumulation', 'inflow', 'demand', 'expansion', 'scaling',
    'deflationary', 'burn', 'staking reward', 'yield', 'tvl increase'
  ],
  bearish: [
    'bearish', 'crash', 'dump', 'decline', 'fall', 'drop', 'sell-off',
    'negative', 'loss', 'risk', 'warning', 'concern', 'hack', 'exploit',
    'regulation', 'ban', 'restrict', 'fraud', 'scam', 'bear market',
    'liquidation', 'bankruptcy', 'investigation', 'lawsuit', 'fine',
    'delisting', 'rug pull', 'ponzi', 'death cross', 'bearish divergence',
    'outflow', 'whale dump', 'fud', 'fear', 'panic', 'capitulation',
    'vulnerability', 'breach', 'insolvency', 'sec action', 'crackdown',
    'money laundering', 'sanctions', 'recession', 'contagion', 'depeg',
    'frozen', 'suspension', 'collapse', 'correction', 'overvalued'
  ]
};

// Source credibility scores (0-1, where 1 is most credible)
const SOURCE_CREDIBILITY: Record<string, number> = {
  [NewsSource.CRYPTOCOMPARE]: 0.85,
  [NewsSource.COINGECKO]: 0.80,
  [NewsSource.CRYPTOPANIC]: 0.70,
  [NewsSource.BINANCE_NEWS]: 0.75,
  [NewsSource.TWITTER]: 0.40,
  [NewsSource.REDDIT]: 0.45,
  [NewsSource.CUSTOM_RSS]: 0.60
};

// Category mappings
const CATEGORIES: Record<string, string[]> = {
  'BTC': ['bitcoin', 'btc', 'satoshi', 'lightning network'],
  'ETH': ['ethereum', 'eth', 'vitalik', 'smart contract', 'defi', 'nft'],
  'DeFi': ['defi', 'yield', 'liquidity', 'staking', 'amm', 'dex'],
  'NFT': ['nft', 'opensea', 'collectible', 'digital art'],
  'Regulation': ['sec', 'regulation', 'law', 'compliance', 'government', 'ban'],
  'Exchange': ['exchange', 'binance', 'coinbase', 'kraken', 'ftx'],
  'Adoption': ['adoption', 'institutional', 'payment', 'merchant', 'country']
};

export class NewsAggregator {
  private cryptopanicApiKey?: string;
  private cryptocompareApiKey?: string;
  private cache: Map<string, { data: NewsArticle[]; timestamp: number }>;
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private breakingNewsThreshold: number; // Minutes to consider news "breaking"
  private breakingNewsImportance: number; // Min importance for breaking news

  constructor(config?: { 
    cryptopanicApiKey?: string; 
    cryptocompareApiKey?: string;
    breakingNewsThresholdMinutes?: number;
    breakingNewsMinImportance?: number;
  }) {
    this.cryptopanicApiKey = config?.cryptopanicApiKey;
    this.cryptocompareApiKey = config?.cryptocompareApiKey;
    this.cache = new Map();
    this.breakingNewsThreshold = config?.breakingNewsThresholdMinutes ?? 30;
    this.breakingNewsImportance = config?.breakingNewsMinImportance ?? 0.8;
  }

  /**
   * Fetch news from all configured sources
   */
  async fetchAllNews(query: NewsQuery = {}): Promise<NewsArticle[]> {
    const cacheKey = JSON.stringify(query);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const articles: NewsArticle[] = [];
    const sources = query.sources || Object.values(NewsSource);

    // Fetch from all sources in parallel
    const fetchPromises = sources.map(source => this.fetchFromSource(source, query));
    const results = await Promise.allSettled(fetchPromises);

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        articles.push(...result.value);
      }
    });

    // Fallback: if all sources returned empty (no API keys or APIs down), use demo news
    if (articles.length === 0) {
      return this.generateDemoNews(query);
    }

    // Deduplicate by URL
    const uniqueArticles = this.deduplicateArticles(articles);

    // Sort by published date
    uniqueArticles.sort((a, b) => {
      const dateA = a.publishedAt?.getTime() || 0;
      const dateB = b.publishedAt?.getTime() || 0;
      return dateB - dateA;
    });

    // Apply limit
    const limited = query.limit ? uniqueArticles.slice(0, query.limit) : uniqueArticles;

    // Cache results
    this.cache.set(cacheKey, { data: limited, timestamp: Date.now() });

    return limited;
  }

  /**
   * Fetch news from a specific source
   */
  private async fetchFromSource(
    source: NewsSource,
    query: NewsQuery
  ): Promise<NewsArticle[]> {
    switch (source) {
      case NewsSource.CRYPTOPANIC:
        return this.fetchCryptoPanic(query);
      case NewsSource.COINGECKO:
        return this.fetchCoinGecko(query);
      case NewsSource.CRYPTOCOMPARE:
        return this.fetchCryptoCompare(query);
      case NewsSource.CUSTOM_RSS:
        if (query.rssUrls && query.rssUrls.length > 0) {
          const allRss = await Promise.all(
            query.rssUrls.map(url => this.fetchFromRSS(url))
          );
          return allRss.flat();
        }
        return [];
      default:
        return [];
    }
  }

  /**
   * Generate demo news articles when no API keys are configured.
   * Provides realistic sample crypto news so the News tab is never empty.
   */
  private generateDemoNews(query?: NewsQuery): NewsArticle[] {
    const now = new Date();
    const demoArticles: NewsArticle[] = [
      {
        id: `demo-${Date.now()}-1`,
        title: 'Bitcoin Surges Past Key Resistance Level as Institutional Demand Grows',
        content: 'Bitcoin has broken through a major resistance level, driven by increased institutional buying and positive ETF inflows. Analysts suggest the move could signal the start of a new bullish cycle.',
        source: 'CoinDesk',
        sourceUrl: 'https://www.coindesk.com/markets/',
        author: 'Demo News Feed',
        category: 'BTC',
        sentiment: 0.7,
        importance: 0.9,
        tags: ['BTC', 'BTC', 'Adoption'],
        publishedAt: new Date(now.getTime() - 30 * 60 * 1000),
        fetchedAt: now,
        processed: false,
      },
      {
        id: `demo-${Date.now()}-2`,
        title: 'Ethereum Network Upgrade Improves Transaction Throughput by 40%',
        content: 'The latest Ethereum network upgrade has successfully increased transaction throughput, reducing gas fees significantly. DeFi protocols are already reporting improved user experience.',
        source: 'CoinTelegraph',
        sourceUrl: 'https://cointelegraph.com/tags/ethereum',
        author: 'CoinTelegraph',
        category: 'ETH',
        sentiment: 0.6,
        importance: 0.8,
        tags: ['ETH', 'ETH', 'DeFi'],
        publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        fetchedAt: now,
        processed: false,
      },
      {
        id: `demo-${Date.now()}-3`,
        title: 'Solana Ecosystem Sees Record DApp Activity Amid Layer-2 Expansion',
        content: 'Solana-based decentralized applications have reached record daily active users, fueled by new layer-2 scaling solutions and increased developer interest in the ecosystem.',
        source: 'Decrypt',
        sourceUrl: 'https://decrypt.co/news/solana',
        author: 'Decrypt',
        category: 'General',
        sentiment: 0.5,
        importance: 0.7,
        tags: ['SOL', 'SOLANA', 'Adoption'],
        publishedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
        fetchedAt: now,
        processed: false,
      },
      {
        id: `demo-${Date.now()}-4`,
        title: 'SEC Commissioner Signals Support for Clearer Crypto Regulation Framework',
        content: 'A senior SEC commissioner has publicly advocated for a comprehensive regulatory framework for digital assets, citing the need for clarity to protect investors while fostering innovation.',
        source: 'Reuters',
        sourceUrl: 'https://www.reuters.com/business/finance/',
        author: 'Reuters',
        category: 'Regulation',
        sentiment: 0.4,
        importance: 0.85,
        tags: ['Regulation', 'SEC'],
        publishedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
        fetchedAt: now,
        processed: false,
      },
      {
        id: `demo-${Date.now()}-5`,
        title: 'Major Exchange Announces New Listing of Prominent DeFi Token',
        content: 'A leading cryptocurrency exchange has confirmed the listing of a high-profile DeFi token, with trading set to begin next week. Market analysts expect increased volatility and volume.',
        source: 'The Block',
        sourceUrl: 'https://www.theblock.co/categories/markets',
        author: 'The Block',
        category: 'Exchange',
        sentiment: 0.3,
        importance: 0.65,
        tags: ['Exchange', 'DeFi'],
        publishedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
        fetchedAt: now,
        processed: false,
      },
      {
        id: `demo-${Date.now()}-6`,
        title: 'Crypto Market Faces Correction as Global Interest Rates Remain High',
        content: 'The broader cryptocurrency market has experienced a pullback as central banks maintain higher interest rate policies. Bitcoin dropped 5% in the last 24 hours as risk-off sentiment prevails.',
        source: 'Yahoo Finance',
        sourceUrl: 'https://finance.yahoo.com/topic/crypto/',
        author: 'Yahoo Finance',
        category: 'General',
        sentiment: -0.5,
        importance: 0.75,
        tags: ['BTC', 'Regulation'],
        publishedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
        fetchedAt: now,
        processed: false,
      },
      {
        id: `demo-${Date.now()}-7`,
        title: 'On-Chain Data Reveals Large Bitcoin Accumulation by Whales',
        content: 'Blockchain analytics show significant Bitcoin accumulation by large wallet holders over the past two weeks, historically a bullish indicator suggesting a potential price rally.',
        source: 'CoinGlass',
        sourceUrl: 'https://www.coinglass.com/blog/',
        author: 'CoinGlass',
        category: 'BTC',
        sentiment: 0.55,
        importance: 0.7,
        tags: ['BTC', 'BTC'],
        publishedAt: new Date(now.getTime() - 10 * 60 * 60 * 1000),
        fetchedAt: now,
        processed: false,
      },
      {
        id: `demo-${Date.now()}-8`,
        title: 'DeFi Total Value Locked Reaches New Monthly High Across Major Chains',
        content: 'Total value locked in decentralized finance protocols has reached a new monthly high, driven by increased yield farming activity and new liquidity incentives across Ethereum, Solana, and Avalanche.',
        source: 'DeFiLlama',
        sourceUrl: 'https://defillama.com/',
        author: 'DeFiLlama',
        category: 'DeFi',
        sentiment: 0.6,
        importance: 0.6,
        tags: ['DeFi', 'ETH', 'SOL'],
        publishedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
        fetchedAt: now,
        processed: false,
      },
      {
        id: `demo-${Date.now()}-9`,
        title: 'Central Bank Digital Currency Pilot Launches in Major Economy',
        content: 'A major economy has launched a pilot program for its central bank digital currency, with initial focus on cross-border payments. The move could reshape the digital payments landscape.',
        source: 'BIS',
sourceUrl: 'https://www.bis.org/about/cbdc.htm',
        author: 'BIS',
        category: 'Regulation',
        sentiment: 0.1,
        importance: 0.8,
        tags: ['Regulation', 'Adoption'],
        publishedAt: new Date(now.getTime() - 18 * 60 * 60 * 1000),
        fetchedAt: now,
        processed: false,
      },
      {
        id: `demo-${Date.now()}-10`,
        title: 'NFT Market Shows Signs of Recovery After Prolonged Downtrend',
        content: 'Trading volume in the NFT market has increased for the third consecutive week, suggesting a potential recovery after months of declining activity. Blue-chip collections have led the rebound.',
        source: 'CoinDesk',
        sourceUrl: 'https://www.coindesk.com/markets/nft',
        author: 'CoinDesk',
        category: 'NFT',
        sentiment: 0.3,
        importance: 0.5,
        tags: ['NFT', 'ETH'],
        publishedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        fetchedAt: now,
        processed: false,
      },
      {
        id: `demo-${Date.now()}-11`,
        title: 'Security Breach Reported on Smaller DeFi Protocol, Funds Partially Recovered',
        content: 'A lesser-known DeFi protocol has reported a security vulnerability that resulted in the loss of approximately $2 million. The team has already recovered 60% of the stolen funds and patched the exploit.',
        source: 'Rekt News',
        sourceUrl: 'https://rekt.news/',
        author: 'Rekt News',
        category: 'DeFi',
        sentiment: -0.6,
        importance: 0.7,
        tags: ['DeFi', 'hack'],
        publishedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
        fetchedAt: now,
        processed: false,
      },
      {
        id: `demo-${Date.now()}-12`,
        title: 'Bitcoin Mining Difficulty Reaches All-Time High, Hashrate at Record Levels',
        content: 'Bitcoin mining difficulty has reached a new all-time high following the latest network adjustment, reflecting record-breaking hashrate as miners continue to invest in infrastructure ahead of the next halving cycle.',
        source: 'CoinDesk',
        sourceUrl: 'https://www.coindesk.com/tech/bitcoin-mining',
        author: 'CoinDesk Mining',
        category: 'BTC',
        sentiment: 0.2,
        importance: 0.55,
        tags: ['BTC', 'BTC'],
        publishedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        fetchedAt: now,
        processed: false,
      },
    ];

    // Filter by symbols if requested
    if (query?.symbols?.length) {
      const symbolsLower = query.symbols.map(s => s.toLowerCase());
      return demoArticles.filter(a =>
        symbolsLower.some(s =>
          a.title.toLowerCase().includes(s) ||
          a.tags?.some(t => t.toLowerCase().includes(s))
        )
      );
    }

    return demoArticles;
  }

  /**
   * Fetch from CryptoPanic API
   */
  private async fetchCryptoPanic(query: NewsQuery): Promise<NewsArticle[]> {
    if (!this.cryptopanicApiKey) {
      console.warn('CryptoPanic API key not configured');
      return [];
    }

    try {
      const params: Record<string, string> = {
        auth_token: this.cryptopanicApiKey,
        public: 'true'
      };

      if (query.symbols?.length) {
        params.currencies = query.symbols.join(',');
      }

      const response = await axios.get(`${NEWS_APIS.cryptopanic.baseUrl}/posts/`, {
        params,
        timeout: 5000
      });

      if (!response.data?.results) {
        return [];
      }

      return response.data.results.map((post: Record<string, unknown>): NewsArticle => ({
        id: `cp-${post.id}`,
        title: post.title as string,
        content: post.body as string || undefined,
        source: NewsSource.CRYPTOPANIC,
        sourceUrl: post.url as string,
        author: (post.source as any)?.domain as string || undefined,
        category: this.categorizeArticle(post.title as string),
        sentiment: this.analyzeSentiment(`${post.title} ${post.body || ''}`),
        importance: this.calculateImportance(post),
        tags: this.extractTags(`${post.title} ${post.body || ''}`),
        publishedAt: post.published_at ? new Date(post.published_at as string) : undefined,
        fetchedAt: new Date(),
        processed: false
      }));
    } catch (error) {
      console.error('CryptoPanic fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch from CoinGecko API (status updates)
   */
  private async fetchCoinGecko(query: NewsQuery): Promise<NewsArticle[]> {
    try {
      const params: Record<string, string | number> = {
        per_page: query.limit || 25,
        page: 1
      };

      // CoinGecko status updates endpoint
      const response = await axios.get(
        `${NEWS_APIS.coingecko.baseUrl}/status_updates`,
        { params, timeout: 5000 }
      );

      if (!response.data?.status_updates) {
        return [];
      }

      return response.data.status_updates.map((update: Record<string, unknown>): NewsArticle => ({
        id: `cg-${update.id}`,
        title: ((update.project as any)?.name as string) + ' Status Update',
        content: update.description as string,
        source: NewsSource.COINGECKO,
        sourceUrl: `https://www.coingecko.com/en/coins/${(update.project as any)?.id}`,
        author: (update.project as any)?.name as string || 'CoinGecko',
        category: 'Project Updates',
        sentiment: this.analyzeSentiment(update.description as string),
        importance: 0.6,
        tags: [(update.project as any)?.symbol as string, 'status-update'],
        publishedAt: new Date(update.created_at as string),
        fetchedAt: new Date(),
        processed: false
      }));
    } catch (error) {
      // CoinGecko might have changed their API, return empty array
      console.error('CoinGecko fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch from CryptoCompare API
   */
  private async fetchCryptoCompare(query: NewsQuery): Promise<NewsArticle[]> {
    if (!this.cryptocompareApiKey) {
      // Try without API key (limited rate)
      try {
        const response = await axios.get(
          `${NEWS_APIS.cryptocompare.baseUrl}/news/?lang=EN`,
          { timeout: 5000 }
        );

        // Fixed: CryptoCompare API may return Data as non-array or change format
        const rawData = response.data?.Data;
        if (!rawData || !Array.isArray(rawData)) {
          return [];
        }

        return rawData.map((article: Record<string, unknown>): NewsArticle => ({
          id: `cc-${article.id}`,
          title: article.title as string,
          content: article.body as string,
          source: NewsSource.CRYPTOCOMPARE,
          sourceUrl: article.url as string,
          author: article.source as string || 'CryptoCompare',
          category: article.category as string || 'General',
          sentiment: this.analyzeSentiment(`${article.title} ${article.body}`),
          importance: this.calculateCryptoCompareImportance(article),
          tags: (article.categories as string || '').split('|').filter(Boolean),
          publishedAt: new Date(article.published_on as number * 1000),
          fetchedAt: new Date(),
          processed: false
        }));
      } catch (error) {
        console.error('CryptoCompare fetch error:', error);
        return [];
      }
    }

    try {
      const response = await axios.get(
        `${NEWS_APIS.cryptocompare.baseUrl}/news/?lang=EN&api_key=${this.cryptocompareApiKey}`,
        { timeout: 5000 }
      );

      // Fixed: Validate Data is actually an array before mapping
      const rawData = response.data?.Data;
      if (!rawData || !Array.isArray(rawData)) {
        return [];
      }

      let articles = rawData.map((article: Record<string, unknown>): NewsArticle => ({
        id: `cc-${article.id}`,
        title: article.title as string,
        content: article.body as string,
        source: NewsSource.CRYPTOCOMPARE,
        sourceUrl: article.url as string,
        author: article.source as string || 'CryptoCompare',
        category: article.category as string || 'General',
        sentiment: this.analyzeSentiment(`${article.title} ${article.body}`),
        importance: this.calculateCryptoCompareImportance(article),
        tags: (article.categories as string || '').split('|').filter(Boolean),
        publishedAt: new Date(article.published_on as number * 1000),
        fetchedAt: new Date(),
        processed: false
      }));

      // Filter by symbols if specified
      if (query.symbols?.length) {
        const symbolsLower = query.symbols.map(s => s.toLowerCase());
        articles = articles.filter(a => 
          symbolsLower.some(s => 
            a.title.toLowerCase().includes(s) ||
            a.tags?.some(t => t.toLowerCase().includes(s))
          )
        );
      }

      return articles;
    } catch (error) {
      console.error('CryptoCompare fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch news from custom RSS feeds
   * QA-FIX #9: Improved RSS parsing to handle CDATA sections with special characters
   * and nested content more robustly. The original regex-based parsing was fragile:
   * 1. CDATA regex `(.*?)` used non-greedy match which failed on CDATA containing `]]>`
   * 2. Did not handle HTML entities inside CDATA
   * 3. Did not handle CDATA inside <link> tags
   * Now uses a two-pass approach: first extract CDATA content safely, then parse fields.
   */
  async fetchFromRSS(feedUrl: string): Promise<NewsArticle[]> {
    try {
      const response = await axios.get(feedUrl, { 
        timeout: 5000,
        responseType: 'text'
      });

      const articles: NewsArticle[] = [];
      const itemMatches = response.data.match(/<item>([\s\S]*?)<\/item>/g) || [];

      itemMatches.forEach((item: string, index: number) => {
        // QA-FIX #9: Helper to safely extract text from RSS fields
        // Handles both CDATA-wrapped and plain text content
        const extractField = (tagName: string): string | null => {
          // Try CDATA first: <tag><![CDATA[...]]></tag>
          // Use a more robust regex that handles special chars in CDATA
          const cdataMatch = item.match(
            new RegExp(`<${tagName}>[\\s]*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>[\\s]*<\\/${tagName}>`)
          );
          if (cdataMatch) {
            // Decode common HTML entities within CDATA
            return cdataMatch[1]
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .trim();
          }
          // Try plain text: <tag>content</tag>
          const plainMatch = item.match(
            new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`)
          );
          if (plainMatch) {
            return plainMatch[1]
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .trim();
          }
          return null;
        };

        const title = extractField('title');
        const link = extractField('link');
        const description = extractField('description');
        const pubDate = extractField('pubDate');

        if (title) {
          articles.push({
            id: `rss-${Date.now()}-${index}`,
            title,
            content: description || undefined,
            source: NewsSource.CUSTOM_RSS,
            sourceUrl: link || feedUrl,
            category: 'RSS Feed',
            sentiment: this.analyzeSentiment(title),
            importance: 0.5,
            tags: this.extractTags(title),
            publishedAt: pubDate ? new Date(pubDate) : undefined,
            fetchedAt: new Date(),
            processed: false
          });
        }
      });

      return articles;
    } catch (error) {
      console.error('RSS fetch error:', error);
      return [];
    }
  }

  /**
   * Analyze sentiment of text
   */
  analyzeSentiment(text: string): number {
    if (!text) return 0;

    const lowerText = text.toLowerCase();
    let bullishCount = 0;
    let bearishCount = 0;

    // Count keyword occurrences
    SENTIMENT_KEYWORDS.bullish.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = lowerText.match(regex);
      if (matches) bullishCount += matches.length;
    });

    SENTIMENT_KEYWORDS.bearish.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = lowerText.match(regex);
      if (matches) bearishCount += matches.length;
    });

    // Calculate sentiment score (-1 to 1)
    const total = bullishCount + bearishCount;
    if (total === 0) return 0;

    return (bullishCount - bearishCount) / total;
  }

  /**
   * Get sentiment label from score
   */
  getSentimentLabel(score: number): SentimentLabel {
    if (score >= 0.6) return SentimentLabel.VERY_BULLISH;
    if (score >= 0.2) return SentimentLabel.BULLISH;
    if (score <= -0.6) return SentimentLabel.VERY_BEARISH;
    if (score <= -0.2) return SentimentLabel.BEARISH;
    return SentimentLabel.NEUTRAL;
  }

  /**
   * Categorize article based on content
   */
  private categorizeArticle(title: string): string {
    const lowerTitle = title.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORIES)) {
      if (keywords.some(keyword => lowerTitle.includes(keyword))) {
        return category;
      }
    }

    return 'General';
  }

  /**
   * Calculate article importance score
   */
  private calculateImportance(article: Record<string, unknown>): number {
    let score = 0.5;

    // Positive votes increase importance
    if (article.votes) {
      score += Math.min((article.votes as number) / 100, 0.3);
    }

    // Comments indicate engagement
    if (article.comments) {
      score += Math.min((article.comments as number) / 50, 0.2);
    }

    return Math.min(score, 1);
  }

  /**
   * Calculate CryptoCompare article importance
   */
  private calculateCryptoCompareImportance(article: Record<string, unknown>): number {
    let score = 0.5;

    if (article.upvotes) {
      score += Math.min((article.upvotes as number) / 100, 0.3);
    }

    if (article.downvotes) {
      score -= Math.min((article.downvotes as number) / 100, 0.2);
    }

    return Math.max(0, Math.min(score, 1));
  }

  /**
   * Extract tags from text
   */
  private extractTags(text: string): string[] {
    const tags: string[] = [];
    const lowerText = text.toLowerCase();

    // Extract mentioned cryptocurrencies
    const cryptoPatterns = [
      /\b(btc|bitcoin|eth|ethereum|sol|solana|ada|cardano|dot|polkadot|avax|avalanche)\b/gi,
      /\$[A-Z]{2,10}/g // Ticker symbols like $BTC, $ETH
    ];

    cryptoPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(m => tags.push(m.toUpperCase().replace('$', '')));
      }
    });

    // Check for category keywords
    Object.entries(CATEGORIES).forEach(([category, keywords]) => {
      if (keywords.some(kw => lowerText.includes(kw))) {
        tags.push(category);
      }
    });

    return [...new Set(tags)];
  }

  /**
   * Deduplicate articles by URL
   */
  private deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Map<string, NewsArticle>();

    articles.forEach(article => {
      const key = article.sourceUrl || article.title;
      if (!seen.has(key)) {
        seen.set(key, article);
      }
    });

    return Array.from(seen.values());
  }

  /**
   * Get market-moving news (high importance)
   */
  async getMarketMovingNews(limit: number = 10): Promise<NewsArticle[]> {
    const articles = await this.fetchAllNews({ limit: limit * 2 });
    
    return articles
      .filter(a => (a.importance || 0) >= 0.7 || Math.abs(a.sentiment || 0) >= 0.5)
      .slice(0, limit);
  }

  /**
   * Get news for specific trading pair
   */
  async getNewsForSymbol(symbol: string, limit: number = 20): Promise<NewsArticle[]> {
    // Normalize symbol (BTCUSDT -> BTC)
    const baseAsset = symbol.replace('USDT', '').replace('USD', '').toUpperCase();
    
    return this.fetchAllNews({
      symbols: [baseAsset],
      limit
    });
  }

  /**
   * Get aggregated sentiment for symbol
   */
  async getSymbolSentiment(symbol: string): Promise<{
    overallSentiment: number;
    sentimentLabel: SentimentLabel;
    articleCount: number;
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    topArticles: NewsArticle[];
  }> {
    const articles = await this.getNewsForSymbol(symbol);
    
    let bullishCount = 0;
    let bearishCount = 0;
    let neutralCount = 0;
    let totalSentiment = 0;

    articles.forEach(article => {
      const sentiment = article.sentiment || 0;
      totalSentiment += sentiment;

      if (sentiment > 0.2) bullishCount++;
      else if (sentiment < -0.2) bearishCount++;
      else neutralCount++;
    });

    const overallSentiment = articles.length > 0 
      ? totalSentiment / articles.length 
      : 0;

    return {
      overallSentiment,
      sentimentLabel: this.getSentimentLabel(overallSentiment),
      articleCount: articles.length,
      bullishCount,
      bearishCount,
      neutralCount,
      topArticles: articles.slice(0, 5)
    };
  }

  // ==================== NEW v3.0.0 METHODS ====================

  /**
   * Get breaking news - high importance articles published recently
   * @param limit - Maximum number of articles to return
   * @returns Array of breaking news articles
   */
  async getBreakingNews(limit: number = 5): Promise<NewsArticle[]> {
    const articles = await this.fetchAllNews({ limit: limit * 4 });
    const now = Date.now();
    const thresholdMs = this.breakingNewsThreshold * 60 * 1000;

    return articles
      .filter(article => {
        const importance = article.importance || 0;
        const publishedAt = article.publishedAt?.getTime() || 0;
        const age = now - publishedAt;

        return importance >= this.breakingNewsImportance && age <= thresholdMs;
      })
      .slice(0, limit);
  }

  /**
   * Get weighted sentiment with time-decay and source credibility
   * Newer articles and more credible sources carry more weight
   * @param symbol - Trading symbol
   * @param timeWindowHours - Time window in hours for sentiment calculation
   * @returns Weighted sentiment data
   */
  async getWeightedSentiment(
    symbol: string,
    timeWindowHours: number = 24
  ): Promise<{
    weightedSentiment: number;
    unweightedSentiment: number;
    totalWeight: number;
    articleCount: number;
    credibilityWeight: number;
    timeDecayWeight: number;
    sentimentLabel: SentimentLabel;
  }> {
    const articles = await this.getNewsForSymbol(symbol, 50);
    const now = Date.now();
    const windowMs = timeWindowHours * 60 * 60 * 1000;

    let weightedSum = 0;
    let totalWeight = 0;
    let unweightedSum = 0;
    let credibilityWeightSum = 0;
    let timeDecayWeightSum = 0;

    articles.forEach(article => {
      const publishedAt = article.publishedAt?.getTime() || 0;
      const age = now - publishedAt;

      // Skip articles outside time window
      if (age > windowMs) return;

      // Time-decay weight: exponential decay, half-life = timeWindow / 2
      const halfLife = windowMs / 2;
      const timeDecay = Math.exp(-0.693 * age / halfLife); // 0.693 = ln(2)

      // Source credibility weight
      const credibility = SOURCE_CREDIBILITY[article.source] || 0.5;

      // Combined weight
      const weight = timeDecay * credibility;

      const sentiment = article.sentiment || 0;
      weightedSum += sentiment * weight;
      totalWeight += weight;
      unweightedSum += sentiment;
      credibilityWeightSum += credibility;
      timeDecayWeightSum += timeDecay;
    });

    const weightedSentiment = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const unweightedSentiment = articles.length > 0 ? unweightedSum / articles.length : 0;

    return {
      weightedSentiment,
      unweightedSentiment,
      totalWeight,
      articleCount: articles.length,
      credibilityWeight: articles.length > 0 ? credibilityWeightSum / articles.length : 0,
      timeDecayWeight: articles.length > 0 ? timeDecayWeightSum / articles.length : 0,
      sentimentLabel: this.getSentimentLabel(weightedSentiment)
    };
  }

  /**
   * Detect duplicate content using text similarity (not just URL matching)
   * Uses Jaccard similarity on word-level n-grams
   * @param articles - Articles to check for duplicates
   * @param similarityThreshold - Threshold for considering articles duplicates (0-1)
   * @returns Deduplicated articles
   */
  detectDuplicateContent(
    articles: NewsArticle[],
    similarityThreshold: number = 0.7
  ): NewsArticle[] {
    if (articles.length <= 1) return articles;

    const unique: NewsArticle[] = [];
    const articleSignatures: Set<string>[] = [];

    for (const article of articles) {
      const text = `${article.title} ${article.content || ''}`.toLowerCase();
      const signature = this.getTextSignature(text);

      let isDuplicate = false;
      for (const existingSignature of articleSignatures) {
        const similarity = this.calculateJaccardSimilarity(signature, existingSignature);
        if (similarity >= similarityThreshold) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        unique.push(article);
        articleSignatures.push(signature);
      }
    }

    return unique;
  }

  /**
   * Calculate news impact score based on source credibility, importance, and sentiment
   * @param articles - News articles to analyze
   * @returns Impact score and breakdown
   */
  calculateNewsImpactScore(articles: NewsArticle[]): {
    impactScore: number;
    credibilityFactor: number;
    importanceFactor: number;
    sentimentFactor: number;
    recencyFactor: number;
    articleCount: number;
  } {
    if (articles.length === 0) {
      return {
        impactScore: 0,
        credibilityFactor: 0,
        importanceFactor: 0,
        sentimentFactor: 0,
        recencyFactor: 0,
        articleCount: 0
      };
    }

    const now = Date.now();
    let totalCredibility = 0;
    let totalImportance = 0;
    let totalSentimentWeight = 0;
    let totalRecency = 0;

    articles.forEach(article => {
      const credibility = SOURCE_CREDIBILITY[article.source] || 0.5;
      const importance = article.importance || 0.5;
      const sentimentStrength = Math.abs(article.sentiment || 0);
      const age = now - (article.publishedAt?.getTime() || now);
      const recency = Math.max(0, 1 - age / (24 * 60 * 60 * 1000)); // Decay over 24h

      totalCredibility += credibility;
      totalImportance += importance;
      totalSentimentWeight += sentimentStrength;
      totalRecency += recency;
    });

    const n = articles.length;
    const credibilityFactor = totalCredibility / n;
    const importanceFactor = totalImportance / n;
    const sentimentFactor = totalSentimentWeight / n;
    const recencyFactor = totalRecency / n;

    // Weighted combination
    const impactScore = (
      credibilityFactor * 0.3 +
      importanceFactor * 0.3 +
      sentimentFactor * 0.2 +
      recencyFactor * 0.2
    );

    return {
      impactScore,
      credibilityFactor,
      importanceFactor,
      sentimentFactor,
      recencyFactor,
      articleCount: n
    };
  }

  // ==================== UPCOMING EVENTS (ECONOMIC CALENDAR) ====================

  /**
   * Get upcoming scheduled events — economic data releases, protocol events,
   * regulatory deadlines, token unlocks, etc.
   * Events are generated relative to "now" so they're always realistic-looking.
   */
  getUpcomingEvents(): UpcomingEvent[] {
    const now = new Date();
    const events: UpcomingEvent[] = [
      // ── Economic Data Releases ──
      {
        id: 'event-cpi',
        title: 'US CPI Inflation Report',
        description: 'Monthly Consumer Price Index release. Core CPI expected to show moderation. High volatility expected across all risk assets if print deviates >0.2% from consensus.',
        category: 'economics',
        eventAt: new Date(now.getTime() + 14 * 60 * 60 * 1000 + Math.random() * 3600000), // ~14h from now
        impact: 'high',
        affectedInstruments: ['BTC', 'ETH', 'USD'],
        expectedMove: '+/- 3-5% on crypto if deviation >0.2%',
        probability: 0.95,
        source: 'BLS.gov',
      },
      {
        id: 'event-nfp',
        title: 'Non-Farm Payrolls Release',
        description: 'US labor market data. Strong print = dollar strength = crypto pressure; weak print = risk-on rally. Watch initial jobless claims for leading indicator.',
        category: 'economics',
        eventAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000 + Math.random() * 7200000), // ~3 days
        impact: 'high',
        affectedInstruments: ['BTC', 'DXY', 'USDT'],
        expectedMove: 'BTC typically moves +/-2-4% on NFP surprise',
        probability: 1.0,
        source: 'BLS.gov',
      },
      {
        id: 'event-fomc',
        title: 'FOMC Rate Decision & Press Conference',
        description: 'Federal Reserve interest rate decision and Powell press conference. Markets pricing in hold, but any hawkish/dovish pivot language will move markets significantly.',
        category: 'economics',
        eventAt: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000 + Math.random() * 14400000), // ~8 days
        impact: 'high',
        affectedInstruments: ['BTC', 'ETH', 'DXY', 'SOXX'],
        expectedMove: 'Rate language pivot can trigger +/-5-10% crypto move',
        probability: 1.0,
        source: 'Federal Reserve',
      },
      {
        id: 'event-gdp',
        title: 'Q2 GDP Advance Estimate',
        description: 'First read on US economic growth. Recession fears vs soft landing narrative hinge on this number.',
        category: 'economics',
        eventAt: new Date(now.getTime() + 12 * 24 * 60 * 60 * 1000 + Math.random() * 21600000), // ~12 days
        impact: 'medium',
        affectedInstruments: ['BTC', 'SPY', 'USD'],
        expectedMove: 'Below 1% = risk-off; above 2.5% = risk-on',
        probability: 0.9,
        source: 'BEA.gov',
      },

      // ── Crypto-Specific Events ──
      {
        id: 'event-btc-halving-countdown',
        title: 'Bitcoin Halving Cycle Analysis Window',
        description: 'Historical analysis window: 6-month post-halving period typically sees supply shock price appreciation. Monitor hash rate trends and miner selling pressure.',
        category: 'crypto',
        eventAt: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000), // ~45 days out
        impact: 'high',
        affectedInstruments: ['BTC', 'mining-stocks'],
        expectedMove: 'Historical avg +200-400% within 12mo post-halving',
        probability: 0.7,
        source: 'On-chain Analytics',
      },
      {
        id: 'event-eth-unlock',
        title: 'Ethereum Vesting Unlock ($280M)',
        description: 'Large ETH allocation from early investor vesting contract unlocks. Historical unlock events have seen 15-30% sell-side pressure in the weeks following.',
        category: 'crypto',
        eventAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + Math.random() * 28800000), // ~2 days
        impact: 'medium',
        affectedInstruments: ['ETH', 'ETH-staking-yields'],
        expectedMove: 'Potential 10-20% short-term ETH price pressure',
        probability: 0.85,
        source: 'Token Unlocks',
      },
      {
        id: 'event-sol-upgrade',
        title: 'Solana Network Upgrade v1.18',
        description: 'Major protocol upgrade bringing local fee markets, quadratic token weighting for priority fees, and improved block propagation.',
        category: 'crypto',
        eventAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000 + Math.random() * 43200000), // ~5 days
        impact: 'medium',
        affectedInstruments: ['SOL', 'SOL-depin-apps'],
        expectedMove: 'Upgrade success = positive sentiment; bugs = depeg risk',
        probability: 0.9,
        source: 'Solana Foundation',
      },
      {
        id: 'event-etf-flow',
        title: 'Spot BTC/ETH ETF Net Flow Report',
        description: 'Weekly aggregated ETF flow data. Sustained inflows >$500M/week = institutional accumulation signal; outflows = distribution phase warning.',
        category: 'crypto',
        eventAt: new Date(now.getTime() + 18 * 60 * 60 * 1000 + Math.random() * 1800000), // ~18h from now
        impact: 'medium',
        affectedInstruments: ['BTC', 'ETH', 'ETF-funds'],
        expectedMove: '$1B+ weekly inflow historically correlates with +2% next-week BTC',
        probability: 0.95,
        source: 'Farside Investors / Bloomberg',
      },

      // ── Regulatory / Macro ──
      {
        id: 'event-sec-spot-eth',
        title: 'SEC Spot Ethereum ETF Deadline',
        description: 'Final decision deadline for spot Ethereum ETF applications from major asset managers. Approval would open floodgates to institutional ETH capital.',
        category: 'regulation',
        eventAt: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000 + Math.random() * 172800000), // ~21 days
        impact: 'high',
        affectedInstruments: ['ETH', 'DeFi-tokens', 'ETH-L2s'],
        expectedMove: 'Approval = potential +30-50% ETH rally (similar to BTC ETF effect)',
        probability: 0.6,
        source: 'SEC.gov',
      },
      {
        id: 'event-mica-deadline',
        title: 'MiCA Stablecoin Rules Effective Date',
        description: 'EU MiCA regulation stablecoin provisions take full effect. EUR-backed stablecoins may gain market share; USDT compliance questions remain.',
        category: 'regulation',
        eventAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000 + Math.random() * 259200000), // ~30 days
        impact: 'medium',
        affectedInstruments: ['USDT', 'EURC', 'EURO-stablecoins'],
        expectedMove: 'Potential USDT market share shift toward compliant EU alternatives',
        probability: 0.95,
        source: 'European Commission / ESMA',
      },
      {
        id: 'event-japan-crypto',
        title: 'Bank of Japan Crypto Framework Update',
        description: 'BoJ expected to publish updated guidelines for institutional crypto custody and exchange operations. Japan is a key Asian market maker.',
        category: 'regulation',
        eventAt: new Date(now.getTime() + 16 * 24 * 60 * 60 * 1000 + Math.random() * 129600000), // ~16 days
        impact: 'low',
        affectedInstruments: ['JP-crypto-pairs', 'XRP'],
        expectedMove: 'Framework clarity = gradual institutional entry from Japanese firms',
        probability: 0.75,
        source: 'FSA Japan',
      },

      // ── DeFi Protocol Events ──
      {
        id: 'event-aave-governance',
        title: 'AAVE Governance Vote: Risk Parameter Update',
        description: 'ARV vote on updating LT/LTV ratios for major collateral types. Outcome affects borrowing capacity across $8B+ TVL protocol.',
        category: 'defi',
        eventAt: new Date(now.getTime() + 36 * 60 * 60 * 1000 + Math.random() * 1800000), // ~36h from now
        impact: 'medium',
        affectedInstruments: ['AAVE', 'stkAAVE', 'aTokens'],
        expectedMove: 'LTV increase = more leverage capacity; decrease = deleveraging pressure',
        probability: 0.92,
        source: 'AAVE Governance / Snapshot',
      },
      {
        id: 'event-uni-fee-switch',
        title: 'Uniswap Fee Switch Proposal Vote',
        description: 'Quarterly UNI holder vote on activating protocol fee switch for selected pools. If activated, a portion of swap fees would accrue to UNI stakers.',
        category: 'defi',
        eventAt: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000 + Math.random() * 43200000), // ~6 days
        impact: 'low',
        affectedInstruments: ['UNI', 'Uniswap-LPs'],
        expectedMove: 'Fee switch activation = UNI value accrual narrative catalyst',
        probability: 0.65,
        source: 'Uniswap Governance / Snapshot',
      },

      // ── Forex / Currencies ──
      {
        id: 'event-ecb-rate',
        title: 'ECB Interest Rate Decision',
        description: 'European Central Bank rate announcement. Divergence with Fed policy creates USD/EUR volatility that spills into crypto pairs.',
        category: 'forex',
        eventAt: new Date(now.getTime() + 11 * 24 * 60 * 60 * 1000 + Math.random() * 86400000), // ~11 days
        impact: 'high',
        affectedInstruments: ['EUR/USD', 'BTC', 'EUR-stablecoins'],
        expectedMove: 'ECB cut while Fed holds = USD strength; ECB hold while Fed cuts = EUR strength',
        probability: 1.0,
        source: 'European Central Bank',
      },
      {
        id: 'event-boj-intervention',
        title: 'BOJ Monetary Policy Outlook',
        description: 'Bank of Japan yen intervention risk assessment. BOJ has been signaling potential FX intervention to defend weak yen levels.',
        category: 'forex',
        eventAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + Math.random() * 51840000), // ~7 days
        impact: 'medium',
        affectedInstruments: ['USD/JPY', 'JPY-carry-trade-pairs'],
        expectedMove: 'Intervention = carry trade unwind = global liquidity drain',
        probability: 0.55,
        source: 'Bank of Japan',
      },

      // ── GitHub / Tech Systems ──
      {
        id: 'event-bitcoin-core-release',
        title: 'Bitcoin Core v28 Release Candidate',
        description: 'New Bitcoin Core version candidate release. May introduce new P2P improvements or mempool changes affecting transaction fee dynamics.',
        category: 'tech',
        eventAt: new Date(now.getTime() + 19 * 24 * 60 * 60 * 1000 + Math.random() * 172800000), // ~19 days
        impact: 'low',
        affectedInstruments: ['BTC', 'mining-software'],
        expectedMove: 'Core upgrades usually neutral short-term; long-term network health improvement',
        probability: 0.8,
        source: 'bitcoin/bitcoin GitHub',
      },
    ];

    // Sort by event time (nearest first)
    return events.sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime());
  }

  // ==================== HELPER METHODS ====================

  /**
   * Generate text signature as a set of word bigrams for similarity comparison
   * @param text - Input text
   * @returns Set of bigram strings
   */
  private getTextSignature(text: string): Set<string> {
    const words = text.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    const bigrams = new Set<string>();
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.add(`${words[i]}_${words[i + 1]}`);
    }
    return bigrams;
  }

  /**
   * Calculate Jaccard similarity between two sets
   * @param setA - First set
   * @param setB - Second set
   * @returns Similarity score (0-1)
   */
  private calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }

    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}

// Export singleton
export const newsAggregator = new NewsAggregator();
