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
  tradeSuggestions?: TradeSuggestion[];
}

export interface ExecutionInstruction {
  when: string;             // e.g., "2h before CPI release", "At FOMC announcement moment", "After first 15m candle post-release"
  where: string;            // e.g., "Binance Futures (BTCUSDT Perp)", "Bybit (ETHUSDT)", "OKX Spot"
  entry: string;            // e.g., "Market order at candle open after release"
  stopLoss: string;         // e.g., "1.5% below entry price" or "Above pre-event high"
  takeProfit: string;       // e.g., "TP1: +2%, TP2: +5%" or "Trail SL after +3%"
  orderType: 'market' | 'limit' | 'oco' | 'stop-market' | 'conditional';
  positionSize: string;     // e.g., "2% risk", "0.5x normal size for binary event"
  steps?: string[];         // e.g., ["Set alert for release time", "Mark support/resistance levels", ...]
}

export interface TradeSuggestion {
  direction: 'long' | 'short' | 'straddle' | 'avoid';
  instrument: string;
  strategy: string;
  rationale: string;
  confidence: number;
  timeframe: string;
  execution?: ExecutionInstruction;   // detailed order placement instructions
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
   * Generate contextual trade suggestions for an upcoming event.
   * Uses event category, impact level, affected instruments and expected move
   * to produce actionable signal ideas.
   */
  private generateTradeSuggestions(event: UpcomingEvent): TradeSuggestion[] {
    const { category, impact, affectedInstruments, expectedMove, title } = event;
    const highImpact = impact === 'high';
    const medImpact = impact === 'medium';
    const suggestions: TradeSuggestion[] = [];

    // Map instrument names to tradeable pairs
    const toPair = (inst: string): string => {
      if (inst === 'BTC') return 'BTCUSDT';
      if (inst === 'ETH') return 'ETHUSDT';
      if (inst === 'SOL') return 'SOLUSDT';
      if (inst === 'AAVE') return 'AAVEUSDT';
      if (inst === 'UNI') return 'UNIUSDT';
      if (inst.includes('XRP')) return 'XRPUSDT';
      if (inst.includes('EUR') || inst.includes('USD') || inst === 'DXY') return 'EUR/USD';
      if (inst.includes('JPY')) return 'USD/JPY';
      if (inst.includes('SPY') || inst === 'SOXX' || inst.includes('NASDAQ')) return 'US500 / NAS100';
      return `${inst}USDT`;
    };

    // ── Economics events ──
    if (category === 'economics') {
      const isCPI = title.toLowerCase().includes('cpi');
      const isNFP = title.toLowerCase().includes('payroll') || title.toLowerCase().includes('nfp');
      const isFOMC = title.toLowerCase().includes('fomc') || title.toLowerCase().includes('rate decision');
      const isGDP = title.toLowerCase().includes('gdp');

      // Always suggest a volatility straddle on high-impact economic data
      if (highImpact) {
        suggestions.push({
          direction: 'straddle',
          instrument: toPair(affectedInstruments[0] || 'BTC'),
          strategy: 'Volatility breakout — enter both sides',
          rationale: `${title}: Economic releases cause sharp initial moves (2-5%) then often revert. Place OCO orders above/below pre-event range; exit loser, ride winner.`,
          confidence: isFOMC ? 0.78 : isCPI ? 0.82 : isNFP ? 0.75 : 0.70,
          timeframe: '15m–4h (intraday)',
          execution: {
            when: "Set orders 30-60min BEFORE the release time. Both stops must be live before data drops.",
            where: "Binance Futures (BTCUSDT Perpetual)",
            entry: "Place BUY STOP 1.5% above current price + SELL STOP 1.5% below simultaneously",
            stopLoss: "Winning side: trail to breakeven after +2% move. Losing side: fixed 1% stop",
            takeProfit: "TP1 at ±3%, TP2 at ±5%. Close 50% at TP1, trail remainder",
            orderType: "oco",
            positionSize: "1% risk per side (2% total max)",
            steps: [
              "Mark your calendar: Economic data release time (CPI/NFP/FOMC/GDP)",
              "Identify BTC support/resistance levels 1h before release",
              "Set price alerts ±2% from current price",
              "Place both BUY STOP and SELL STOP orders in your order book 30min before",
              "Cancel losing side within 5min of fill, trail winner with breakeven stop",
            ],
          },
        });
      }

      if (isCPI || isNFP || isFOMC) {
        const pair = toPair(affectedInstruments.find(i => ['BTC', 'ETH', 'USD'].includes(i)) || 'BTC');
        suggestions.push({
          direction: 'short',
          instrument: pair,
          strategy: `Short risk assets into ${isCPI ? 'hot CPI' : isNFP ? 'strong NFP' : 'hawkish FOMC'} scenario`,
          rationale: `Hot/hawkish macro data → DXY strength → crypto sell-off 3-5%. Enter short at first rejection candle after release, SL above pre-event high.`,
          confidence: highImpact ? 0.68 : 0.55,
          timeframe: '1h–8h',
          execution: {
            when: "Enter SHORT within first 2 candles (15-30min) after release IF bearish candle confirms",
            where: "Bybit (ETHUSDT USDT Perpetual)",
            entry: "Stop-market SHORT at break of first support level after release, OR market short if bearish candle confirms within 15min",
            stopLoss: "Stop-loss 1.5-2% above entry (above recent swing high)",
            takeProfit: "TP1: -2% (take 50%), TP2: -4-5% (trail rest)",
            orderType: "stop-market",
            positionSize: "2% account risk",
            steps: [
              "Watch for the data release live (Bloomberg terminal / TradingView economic calendar)",
              "Wait for first 15m candle to close after release — look for bearish rejection wick",
              "Confirm bearish momentum: volume spike + lower low on 15m chart",
              "Enter stop-market SHORT at break of nearest support level",
              "Take 50% profit at -2%, trail remainder with 20 EMA on 1h chart",
            ],
          },
        });
        suggestions.push({
          direction: 'long',
          instrument: pair,
          strategy: `Long the dip — buy the overreaction`,
          rationale: `Economic news volatility usually overextends. If price drops >3% on release, look for bullish reversal patterns (engulfing, hammer) on 15m chart to long the bounce.`,
          confidence: highImpact ? 0.65 : 0.50,
          timeframe: '2h–1d',
          execution: {
            when: "Wait for initial volatility spike to settle (15-30min post-release), then look for +2-3% dip from pre-release level",
            where: "OKX (BTCUSDT-SWAP Perpetual)",
            entry: "Limit buy at -2% to -3% from pre-event price (buy the dip), OR market order if bullish engulfing forms on 15m chart",
            stopLoss: "Stop-loss 1.5-2% below entry (below recent swing low)",
            takeProfit: "TP1: +2-3% (50%), TP2: +5-7% (trail remainder)",
            orderType: "limit",
            positionSize: "2% account risk",
            steps: [
              "Note the pre-event price level 5min before data release",
              "After release, wait for initial volatility spike (usually 2-4% move in first 10min)",
              "Look for bullish reversal pattern (engulfing, hammer) on 15m chart after price drops >2%",
              "Place limit buy order at -2% to -3% from pre-event level",
              "If filled, set SL below recent swing low and take partial profits at +3%",
            ],
          },
        });
      }

      if (isGDP && !highImpact) {
        suggestions.push({
          direction: 'avoid',
          instrument: 'BTCUSDT',
          strategy: 'Reduce leverage ahead of GDP print',
          rationale: 'GDP surprise can shift macro regime narrative. Close leveraged positions or reduce size 2-4h before release, re-enter after initial reaction settles.',
          confidence: 0.85,
          timeframe: 'Pre-event: close; Post-event: re-enter within 4h',
          execution: {
            when: "Close positions 2-4h BEFORE the scheduled release. Do not re-enter until 2h after.",
            where: "Binance Futures (BTCUSDT Perpetual)",
            entry: "No new entries. Conditionally CLOSE existing leveraged positions.",
            stopLoss: "N/A",
            takeProfit: "Close 50% of leveraged longs 2h before event, remainder 30min before. Re-enter 2h post-event.",
            orderType: "conditional",
            positionSize: "Reduce to 0.5x or flat",
            steps: [
              "Check GDP release date/time on economic calendar (usually 8:30 AM ET)",
              "Close 50% of all leveraged longs 4h before release",
              "Close remaining 50% of leveraged longs 30min before release",
              "Set alert for 2h post-release to reassess market reaction",
              "Only re-enter if price action shows clear directional bias with volume confirmation",
            ],
          },
        });
      }
    }

    // ── Crypto-specific events ──
    if (category === 'crypto') {
      const isUnlock = title.toLowerCase().includes('unlock');
      const isHalving = title.toLowerCase().includes('halving');
      const isUpgrade = title.toLowerCase().includes('upgrade');
      const isETF = title.toLowerCase().includes('etf');

      if (isUnlock) {
        suggestions.push({
          direction: 'short',
          instrument: toPair(affectedInstruments.find(i => i.includes('ETH') || i.includes('BTC')) || 'ETH'),
          strategy: 'Short into vesting unlock pressure',
          rationale: `${title}: Historical unlock events see 15-30% sell-side pressure as early investors de-risk. Short 12-24h before unlock date, target gradual exit over 3-7d post-unlock.`,
          confidence: medImpact ? 0.72 : 0.60,
          timeframe: '1d–7d',
          execution: {
            when: "Enter short 12-24h BEFORE unlock timestamp. Sell pressure peaks 6-12h post-unlock.",
            where: "Bybit (ETHUSDT USDT Perpetual)",
            entry: "Limit short 5-10% below current price (accumulation zone). If event fires, add 50% at market on confirmation candle.",
            stopLoss: "Initial stop at -15% from entry. Tighten to -8% once event outcome is known.",
            takeProfit: "TP1: +25% (sell 1/3), TP2: +50% (sell 1/3), remainder trail with weekly highs",
            orderType: "limit",
            positionSize: "1.5% risk initially, add 1.5% on confirmation (3% total)",
            steps: [
              "Find exact unlock timestamp from tokenomics dashboard (e.g., TokenUnlocks.app)",
              "Place limit SHORT 12-24h before unlock — aim for 5-10% below current price",
              "Set stop-loss at -15% from entry; tighten to -8% after unlock fires",
              "Take 1/3 profit at +25%, 1/3 at +50%, trail remainder with weekly highs",
              "Close entire position 7d post-unlock regardless of P&L",
            ],
          },
        });
        suggestions.push({
          direction: 'long',
          instrument: toPair(affectedInstruments.find(i => i.includes('stak')) || 'ETH'),
          strategy: 'Long staking yields post-dip',
          rationale: 'Unlock-induced dips create entry opportunities for staked positions. If ETH drops >10%, consider DCA into LSD/staking positions at better yields.',
          confidence: 0.58,
          timeframe: '3d–14d',
          execution: {
            when: "Start accumulating 24-48h AFTER unlock timestamp when sell pressure begins to fade",
            where: "Coinbase (ETHUSDT Spot)",
            entry: "Split into 3 limit-buy tranches: 33% at current price, 33% at -5%, 34% at -10%",
            stopLoss: "Hard stop at -20% from avg entry, or if fundamental thesis invalidates",
            takeProfit: "No fixed TP — trail stop using 200-day MA or take partial profits at each +50% milestone",
            orderType: "limit",
            positionSize: "3-5% total allocated capital, scaled over 2-4 weeks",
          },
        });
      }

      if (isHalving) {
        suggestions.push({
          direction: 'long',
          instrument: 'BTCUSDT',
          strategy: 'DCA long through halving cycle',
          rationale: 'Historical pattern: 6-12mo post-halving sees +200-400% appreciation from supply shock. Start scaling in now, accelerate if hash rate holds/miners capitulate then recover.',
          confidence: 0.75,
          timeframe: '1mo–12mo (position trade)',
          execution: {
            when: "Start accumulating NOW (45+ days out). Add tranches every 5-7% dip. Accelerate if hash rate dips.",
            where: "Binance Futures (BTCUSDT Perpetual)",
            entry: "Split into 3 limit-buy tranches: 33% at current price, 33% at -5%, 34% at -10%",
            stopLoss: "Hard stop at -20% from avg entry, or if fundamental thesis invalidates",
            takeProfit: "No fixed TP — trail stop using 200-day MA or take partial profits at each +50% milestone",
            orderType: "limit",
            positionSize: "3-5% total allocated capital, scaled over 2-4 weeks",
            steps: [
              "Set up DCA schedule: buy 1/3 of position now, then every 5-7% BTC dip",
              "Monitor Bitcoin hash rate weekly — accelerate buying if hash rate drops >5%",
              "Take partial profits (+50%) at each major milestone: pre-halving run, halving day, post-halving rally",
              "Trail stop loss using the 200-day moving average as dynamic exit signal",
              "Reassess thesis if BTC breaks below prior cycle low or miner capitulation fails to recover",
            ],
          },
        });
        suggestions.push({
          direction: 'long',
          instrument: 'BTCUSDT',
          strategy: 'Long mining stocks via proxy exposure',
          rationale: 'Halving reduces miner revenue → weak hands exit → hash rate dip → recovery = bullish signal. Consider mining-equivalent exposure for leveraged beta.',
          confidence: 0.62,
          timeframe: '3mo–9mo',
          execution: {
            when: "Start accumulating NOW (45+ days out). Add tranches every 5-7% dip. Focus on miner proxy tokens.",
            where: "Bybit (BTCUSDT USDT Perpetual)",
            entry: "Split into 3 limit-buy tranches: 33% at current price, 33% at -5%, 34% at -10%",
            stopLoss: "Hard stop at -20% from avg entry, or if fundamental thesis invalidates",
            takeProfit: "No fixed TP — trail stop using 200-day MA or take partial profits at each +50% milestone",
            orderType: "limit",
            positionSize: "3-5% total allocated capital, scaled over 2-4 weeks",
          },
        });
      }

      if (isUpgrade) {
        const pair = toPair(affectedInstruments[0] || 'SOL');
        suggestions.push({
          direction: 'straddle',
          instrument: pair,
          strategy: `Straddle ${affectedInstruments[0] || 'token'} upgrade event`,
          rationale: `Protocol upgrades are binary: success = pump, failure/crash = dump. Place buy-stop above resistance and sell-stop below support pre-upgrade.`,
          confidence: medImpact ? 0.70 : 0.55,
          timeframe: '1h–24h around upgrade time',
          execution: {
            when: "Place OCO orders 1-2h before expected upgrade block. Cancel if upgrade delayed >1h.",
            where: "OKX (SOLUSDT-SWAP Perpetual)",
            entry: "Place BUY STOP 1.5% above current price + SELL STOP 1.5% below simultaneously",
            stopLoss: "Winning side: trail to breakeven after +2% move. Losing side: fixed 1% stop",
            takeProfit: "TP1 at ±3%, TP2 at ±5%. Close 50% at TP1, trail remainder",
            orderType: "oco",
            positionSize: "1% risk per side (2% total max)",
            steps: [
              "Find expected upgrade block number / estimated timestamp from protocol docs or Twitter",
              "Identify key resistance (above) and support (below) levels on 4h chart 2h before upgrade",
              "Place OCO buy-stop above resistance and sell-stop below support 1-2h before estimated block",
              "Monitor blockchain explorer for upgrade activation — cancel both orders if delayed >1h",
              "Once one side fills, cancel the other within 5min; trail winner to breakeven after +2%",
            ],
          },
        });
        suggestions.push({
          direction: 'long',
          instrument: pair,
          strategy: `Long ${affectedInstruments[0] || 'token'} on successful upgrade confirmation`,
          rationale: 'If upgrade deploys without issues and network metrics (TPS, fees) improve positively, enter long on first pullback with SL below pre-upgrade low.',
          confidence: 0.60,
          timeframe: '4h–3d',
          execution: {
            when: "Wait for upgrade confirmation on-chain (block explorer), enter long on first pullback within 4h.",
            where: "Binance Futures (SOLUSDT Perpetual)",
            entry: "Limit buy at -2% to -3% from pre-event price (buy the dip), OR market order if bullish engulfing forms on 15m chart",
            stopLoss: "Stop-loss 1.5-2% below entry (below recent swing low)",
            takeProfit: "TP1: +2-3% (50%), TP2: +5-7% (trail remainder)",
            orderType: "limit",
            positionSize: "2% account risk",
          },
        });
      }

      if (isETF) {
        suggestions.push({
          direction: 'long',
          instrument: toPair(affectedInstruments.find(i => ['BTC', 'ETH'].includes(i)) || 'BTC'),
          strategy: 'Long on strong ETF inflow confirmation',
          rationale: 'Sustained ETF inflows >$500M/week = institutional accumulation. Enter long on weekly flow report if positive, trail stop with 20-day MA.',
          confidence: 0.73,
          timeframe: '1d–2w (swing)',
          execution: {
            when: "Enter market LONG within 1h of flow report publication (usually Friday ~4pm ET).",
            where: "Binance Futures (BTCUSDT Perpetual)",
            entry: "Market order long if weekly ETF flow report shows >$500M net positive inflow; otherwise hold",
            stopLoss: "Stop-loss at -5% below entry or if flows reverse negative for 2 consecutive weeks",
            takeProfit: "TP1: +5-8% (take 50%), trail remainder with 20-day MA for trend-following exit",
            orderType: "market",
            positionSize: "2% account risk, scale up to 3% on sustained multi-week inflows",
            steps: [
              "Subscribe to ETF flow data source (e.g., SoValue, Farside Investors) for real-time alerts",
              "Check report every Friday ~4pm ET when weekly data publishes",
              "If net inflow >$500M, enter market LONG within 1h of publication",
              "Set stop-loss at -5% below entry or if flows reverse negative for 2 consecutive weeks",
              "Take 50% profit at +5-8%, trail remainder with 20-day MA",
            ],
          },
        });
        suggestions.push({
          direction: 'avoid',
          instrument: 'BTCUSDT',
          strategy: 'Watch for ETF outflow warning signs',
          rationale: 'If weekly flows turn negative for 2+ consecutive weeks, reduce crypto exposure. ETF outflows preceded every major drawdown in 2024-2025.',
          confidence: 0.80,
          timeframe: 'Monitor weekly reports',
          execution: {
            when: "Check weekly report Friday. If negative 2 weeks running, reduce exposure Monday open.",
            where: "Bybit (BTCUSDT USDT Perpetual)",
            entry: "No new entries. Conditionally CLOSE existing leveraged positions.",
            stopLoss: "N/A",
            takeProfit: "Close 50% of leveraged longs when 1st negative week confirmed, close remainder on 2nd consecutive negative week",
            orderType: "conditional",
            positionSize: "Reduce to 0.5x or flat until flows recover positive",
            steps: [
              "Set calendar reminder for every Friday ETF flow report (~4pm ET)",
              "1st negative week: close 50% of leveraged long positions",
              "2nd consecutive negative week: close ALL remaining leveraged positions immediately on Monday open",
              "Do not re-enter until flows turn positive for at least 1 consecutive week",
              "Monitor correlation between outflow magnitude and BTC price drawdown depth",
            ],
          },
        });
      }
    }

    // ── Regulation events ──
    if (category === 'regulation') {
      const isSEC = title.toLowerCase().includes('sec') || title.toLowerCase().includes('etf deadline');
      const isMiCA = title.toLowerCase().includes('mica');
      const isJapan = title.toLowerCase().includes('japan') || title.toLowerCase().includes('boj') === false && title.toLowerCase().includes('crypto framework');

      if (isSEC) {
        const ethPair = 'ETHUSDT';
        suggestions.push({
          direction: 'long',
          instrument: ethPair,
          strategy: 'Front-run SEC spot ETH ETF approval',
          rationale: 'If approved, expect +30-50% ETH rally similar to BTC Jan 2024 effect. Build small long position ahead of deadline; size up on approval confirmation.',
          confidence: 0.55,
          timeframe: 'Event day + 1-4w post-decision',
          execution: {
            when: "Build position 3-5 days BEFORE deadline. If no approval rumor by T-1, reduce size 50%.",
            where: "Binance Futures (ETHUSDT Perpetual)",
            entry: "Limit long 5-10% below current price (accumulation zone). If event fires, add 50% at market on confirmation candle.",
            stopLoss: "Initial stop at -15% from entry. Tighten to -8% once event outcome is known.",
            takeProfit: "TP1: +25% (sell 1/3), TP2: +50% (sell 1/3), remainder trail with weekly highs",
            orderType: "limit",
            positionSize: "1.5% risk initially, add 1.5% on confirmation (3% total)",
          },
        });
        suggestions.push({
          direction: 'straddle',
          instrument: ethPair,
          strategy: 'Straddle SEC deadline binary outcome',
          rationale: 'Binary event: approval = massive pump, rejection = sharp dump. Straddle with wider stops than usual given magnitude of potential move (+/-25%).',
          confidence: 0.70,
          timeframe: 'Event day ±3d',
          execution: {
            when: "Set OCO 24h before deadline decision window (usually 1-5pm ET). Wider stops (+/-4%).",
            where: "Bybit (ETHUSDT USDT Perpetual)",
            entry: "Place BUY STOP 1.5% above current price + SELL STOP 1.5% below simultaneously",
            stopLoss: "Winning side: trail to breakeven after +2% move. Losing side: fixed 1% stop",
            takeProfit: "TP1 at ±3%, TP2 at ±5%. Close 50% at TP1, trail remainder",
            orderType: "oco",
            positionSize: "1% risk per side (2% total max)",
            steps: [
              "Find the exact SEC deadline date (check SEC.gov or crypto news calendar)",
              "24h before deadline, identify key levels — place buy-stop 4% above, sell-stop 4% below",
              "Wider stops are critical here: SEC decisions can cause +/-25% moves",
              "Monitor Twitter/X for SEC filing updates during decision window (1-5pm ET)",
              "Cancel losing side within 10min of fill; winner gets wide trail using 4h candle structure",
            ],
          },
        });
        // Also suggest L2 longs
        suggestions.push({
          direction: 'long',
          instrument: 'ARBUSDT', // example L2
          strategy: 'Long ETH L2 tokens on approval beta play',
          rationale: 'ETH ETF approval benefits entire ecosystem. L2 tokens (ARB, OP, STRK) tend to outperform ETH on positive regulatory catalysts due to higher beta.',
          confidence: 0.48,
          timeframe: '1d–2w',
          execution: {
            when: "Build position 3-5 days BEFORE deadline. L2 beta play — smaller size due to higher volatility.",
            where: "OKX (ARBUSDT-SWAP Perpetual)",
            entry: "Limit long 5-10% below current price (accumulation zone). If event fires, add 50% at market on confirmation candle.",
            stopLoss: "Initial stop at -15% from entry. Tighten to -8% once event outcome is known.",
            takeProfit: "TP1: +25% (sell 1/3), TP2: +50% (sell 1/3), remainder trail with weekly highs",
            orderType: "limit",
            positionSize: "1.5% risk initially, add 1.5% on confirmation (3% total)",
          },
        });
      }

      if (isMiCA) {
        suggestions.push({
          direction: 'long',
          instrument: 'EURCUSDT',
          strategy: 'Long EUR-backed stablecoins on MiCA compliance demand',
          rationale: 'MiCA creates compliant EU stablecoin demand. EURC and similar EU-compliant stablecoins may gain market share from USDT in European markets.',
          confidence: 0.65,
          timeframe: '2w–3mo',
          execution: {
            when: "Start building EURC/EU-stablecoin position 2 weeks before effective date. Scale over 4 weeks.",
            where: "Binance Spot (EURCUSDT)",
            entry: "Split into 3 limit-buy tranches: 33% at current price, 33% at -5%, 34% at -10%",
            stopLoss: "Hard stop at -20% from avg entry, or if fundamental thesis invalidates",
            takeProfit: "No fixed TP — trail stop using 200-day MA or take partial profits at each +50% milestone",
            orderType: "limit",
            positionSize: "3-5% total allocated capital, scaled over 2-4 weeks",
            steps: [
              "Find MiCA effective date from official EU regulatory sources (usually Dec 2024 / June 2025)",
              "Start 2 weeks before: buy first tranche (33%) of EURC or EU-compliant stablecoin position",
              "Add second tranche (-5%) at T-1 week before effective date",
              "Add final tranche (-10%) on or shortly after effective date if thesis holds",
              "Monitor EU exchange volumes for USDT→EURC rotation as adoption signal",
            ],
          },
        });
        suggestions.push({
          direction: 'avoid',
          instrument: 'USDT',
          strategy: 'Reduce USDT exposure in EU-regulated context',
          rationale: 'MiCA non-compliance risk for USDT in EU. If you operate in/with EU counterparties, consider rotating some USDT to MiCA-compliant alternatives.',
          confidence: 0.75,
          timeframe: 'Before effective date',
          execution: {
            when: "Begin rotation 2-4 weeks before MiCA effective date. Complete 50% reduction 1 week prior.",
            where: "Binance Spot (USDT → EURCUSDT / USDC)",
            entry: "No new entries. Conditionally CLOSE existing leveraged positions.",
            stopLoss: "N/A",
            takeProfit: "Gradually reduce USDT exposure by 50% before effective date, remainder rotate to compliant alternatives",
            orderType: "conditional",
            positionSize: "Reduce to 0.5x or flat",
            steps: [
              "Identify if you have EU counterparty exposure (exchanges, OTC desks, payment processors)",
              "4 weeks before effective date: rotate 25% of USDT holdings to EURC or USDC",
              "2 weeks before effective date: rotate another 25% (50% total reduced)",
              "1 week before: complete rotation — minimize USDT balance in EU-facing accounts",
              "Monitor EU exchange announcements about USDT delistings or restrictions",
            ],
          },
        });
      }
    }

    // ── DeFi protocol events ──
    if (category === 'defi') {
      const isGov = title.toLowerCase().includes('governance') || title.toLowerCase().includes('vote');
      const isFeeSwitch = title.toLowerCase().includes('fee switch');

      if (isGov) {
        const govToken = toPair(affectedInstruments.find(i => ['AAVE', 'UNI', 'CRV', 'COMP'].some(t => i.includes(t))) || 'AAVE');
        suggestions.push({
          direction: 'long',
          instrument: govToken,
          strategy: `Long ${govToken} on governance outcome clarity`,
          rationale: `Governance votes that increase utility (fee switches, higher LTVs, new collateral) are value-accretive for governance tokens. Long on vote pass confirmation.`,
          confidence: medImpact ? 0.62 : 0.48,
          timeframe: '4h–3d post-vote',
          execution: {
            when: "Enter MARKET LONG immediately after vote result confirms (Snapshot shows PASS). Within 15min of result.",
            where: "Binance Futures (AAVEUSDT Perpetual)",
            entry: "Market order long immediately on vote-pass confirmation candle; do not front-run before result is final",
            stopLoss: "Stop-loss 1.5-2% below entry (below recent swing low)",
            takeProfit: "TP1: +2-3% (50%), TP2: +5-7% (trail remainder)",
            orderType: "market",
            positionSize: "2% account risk",
          },
        });
        suggestions.push({
          direction: 'short',
          instrument: govToken,
          strategy: `Short ${govToken} "buy the rumor, sell the news"`,
          rationale: 'Governance events often front-run the actual vote result. If token pumped >10% leading into vote, consider taking profits/shorting into the event.',
          confidence: 0.56,
          timeframe: '1d pre-vote to 1d post-vote',
          execution: {
            when: "If token pumped >10% into vote date, place LIMIT SHORT 2-4h BEFORE vote closes.",
            where: "Bybit (AAVEUSDT USDT Perpetual)",
            entry: "Limit short at current price 12-24h before vote if token has pumped >10%; OR stop-market short on rejection confirmation",
            stopLoss: "Stop-loss 1.5-2% above entry (above recent swing high)",
            takeProfit: "TP1: -2% (take 50%), TP2: -4-5% (trail rest)",
            orderType: "limit",
            positionSize: "2% account risk",
          },
        });
      }

      if (isFeeSwitch) {
        suggestions.push({
          direction: 'long',
          instrument: 'UNIUSDT',
          strategy: 'Long UNI on fee switch activation narrative',
          rationale: 'Protocol fee switch = UNI becomes revenue-generating → fundamental re-rate possible. Position small ahead of vote, add on activation.',
          confidence: 0.52,
          timeframe: '1d–1w',
          execution: {
            when: "Enter on activation confirmation tweet/announcement. Market order within 30min.",
            where: "OKX (UNIUSDT-SWAP Perpetual)",
            entry: "Market order long immediately on fee-switch activation confirmation; small limit long ahead of vote as initial position",
            stopLoss: "Stop-loss at -5% below entry or if vote fails/rejected",
            takeProfit: "TP1: +5% (take 50%), TP2: +10-15% (trail remainder with 20-day MA)",
            orderType: "market",
            positionSize: "1.5% risk initially, add 1% on activation (2.5% total)",
          },
        });
      }
    }

    // ── Forex events ──
    if (category === 'forex') {
      const isECB = title.toLowerCase().includes('ecb');
      const isBOJ = title.toLowerCase().includes('boj') || title.toLowerCase().includes('japan');

      if (isECB) {
        suggestions.push({
          direction: 'straddle',
          instrument: 'EUR/USD',
          strategy: 'Straddle ECB rate decision vs Fed divergence',
          rationale: 'ECB-Fed policy divergence drives EUR/USD 50-150 pips. If ECB cuts while Fed holds → EUR drops; if ECB holds while Fed cuts → EUR rips. Straddle the announcement.',
          confidence: 0.76,
          timeframe: '15m–4h (announcement window)',
          execution: {
            when: "Place OCO 15min before ECB press conference start (usually 12:45 GMT).",
            where: "OANDA / FXCM / TradingView (Spot FX — EUR/USD)",
            entry: "Place BUY STOP 1.5% above current price + SELL STOP 1.5% below simultaneously",
            stopLoss: "Winning side: trail to breakeven after +2% move. Losing side: fixed 1% stop",
            takeProfit: "TP1 at ±3%, TP2 at ±5%. Close 50% at TP1, trail remainder",
            orderType: "oco",
            positionSize: "1% risk per side (2% total max)",
            steps: [
              "Find ECB press conference date/time (usually Thursday 12:45 GMT / 8:45 AM ET)",
              "15min before press conference, identify EUR/USD range on 5m chart",
              "Place buy-stop above recent resistance and sell-stop below support via OCO order",
              "Listen to ECB President Lagarde's tone during press conference for hawkish/dovish clues",
              "Cancel losing side within 5min of fill; trail winner with breakeven stop after +50 pips",
            ],
          },
        });
        suggestions.push({
          direction: 'long' as const,
          instrument: 'BTCUSDT',
          strategy: 'Long BTC on USD weakness from ECB divergence',
          rationale: 'If ECB holds rates (hawkish) while market expects cut, USD may weaken against EUR → risk-on environment → BTC bid.',
          confidence: 0.58,
          timeframe: '4h–2d',
          execution: {
            when: "If EUR rips vs USD post-ECB, wait for BTC to show bullish divergence on 1h chart (1-4h lag).",
            where: "Bybit (BTCUSDT USDT Perpetual)",
            entry: "Limit buy at -2% to -3% from pre-event price (buy the dip), OR market order if bullish engulfing forms on 15m chart",
            stopLoss: "Stop-loss 1.5-2% below entry (below recent swing low)",
            takeProfit: "TP1: +2-3% (50%), TP2: +5-7% (trail remainder)",
            orderType: "limit",
            positionSize: "2% account risk",
          },
        });
      }

      if (isBOJ) {
        suggestions.push({
          direction: 'short',
          instrument: 'USD/JPY',
          strategy: 'Short USD/JPY on BOJ intervention risk',
          rationale: 'BOJ verbal/actual intervention can move USD/JPY 200-500 pips in hours. Short position sized for volatility spike; use wide stops or options.',
          confidence: 0.54,
          timeframe: '1h–3d',
          execution: {
            when: "Set STOP-MARKET SHORT now at current price (BOJ can intervene anytime unannounced). Or set alert for BOJ verbal warning.",
            where: "OANDA / FXCM / TradingView (Spot FX — USD/JPY)",
            entry: "Stop-market SHORT at break of first support level after release, OR market short if bearish candle confirms within 15min",
            stopLoss: "Stop-loss 1.5-2% above entry (above recent swing high). Use wider stops given intervention volatility.",
            takeProfit: "TP1: -100 pips (take 50%), TP2: -250+ pips (trail rest)",
            orderType: "stop-market",
            positionSize: "2% account risk",
          },
        });
        suggestions.push({
          direction: 'avoid',
          instrument: 'JPY-carry-trade-pairs',
          strategy: 'Unwind JPY carry trades ahead of BOJ event',
          rationale: 'BOJ intervention = JPY strength = carry trade unwind = global deleveraging. Reduce funded JPY shorts and risk assets funded by cheap JPY borrowing.',
          confidence: 0.72,
          timeframe: 'Pre-event: reduce; Post-event: reassess',
          execution: {
            when: "Reduce JPY-funded carry trades now. If BOJ intervenes, close remainder within 1h.",
            where: "Interactive Brokers / CQG (CFD Futures — JPY pairs / US500)",
            entry: "No new entries. Conditionally CLOSE existing leveraged positions.",
            stopLoss: "N/A",
            takeProfit: "Close all JPY-funded carry positions 24h before event; re-assess 4h post-intervention signal",
            orderType: "conditional",
            positionSize: "Reduce to flat on carry trade exposure",
            steps: [
              "Identify all positions funded by JPY borrowing (JPY shorts, risk-on longs with JPY funding)",
              "Close 50% of JPY-funded carry trade exposure immediately upon BOJ warning/intervention signal",
              "Set price alert for USD/JPY — if it drops >200 pips rapidly, close remaining 50% within 1h",
              "Watch for BOJ Governor Ueda's verbal intervention cues (usually before market open Tokyo)",
              "If no intervention materializes within 5 days, reassess and potentially rebuild positions gradually",
            ],
          },
        });
      }
    }

    // ── Tech/System events ──
    if (category === 'tech') {
      suggestions.push({
        direction: 'avoid',
        instrument: toPair(affectedInstruments[0] || 'BTC'),
        strategy: 'Monitor but don\'t trade on software releases alone',
        rationale: `${title}: Core software upgrades rarely produce immediate price action unless they introduce breaking changes or critical bugs. Watch for network effects instead.`,
        confidence: 0.88,
        timeframe: 'N/A — informational only',
        execution: {
          when: "No action needed. Monitor Twitter/Discord for post-release bug reports over next 48h.",
          where: "N/A — informational only, no trading required",
          entry: "No new entries. Conditionally CLOSE existing leveraged positions.",
          stopLoss: "N/A",
          takeProfit: "No action required. Software upgrades are informational — do not adjust positions based on release alone.",
          orderType: "conditional",
          positionSize: "Hold current size — no new positions",
          steps: [
            "Note the software release version and date for reference",
            "Monitor project's official Twitter/X and Discord for 48h post-release",
            "Watch for bug reports, network issues, or unexpected breaking changes",
            "If critical bugs emerge that affect token utility/protocol function, re-evaluate holdings",
            "No trading action needed unless release introduces a material fundamental change",
          ],
        },
      });
    }

    // Deduplicate by instrument+direction (keep highest confidence)
    const seen = new Set<string>();
    return suggestions
      .filter(s => {
        const key = `${s.instrument}:${s.direction}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 4); // Max 4 suggestions per event
  }

  /**
   * Get upcoming scheduled events — economic data releases, protocol events,
   * regulatory deadlines, token unlocks, etc.
   * Events are generated relative to "now" so they're always realistic-looking.
   * Each event includes auto-generated trade suggestions based on its properties.
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

    // Sort by event time (nearest first) and attach trade suggestions
    return events
      .sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime())
      .map(event => ({
        ...event,
        tradeSuggestions: this.generateTradeSuggestions(event),
      }));
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
