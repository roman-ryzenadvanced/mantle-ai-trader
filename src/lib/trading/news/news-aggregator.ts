/**
 * News Aggregation Service for Mantle AI Trading Bot
 * Aggregates news from multiple sources for fundamental analysis
 */

import axios from 'axios';
import { 
  NewsArticle, 
  NewsSource, 
  NewsQuery,
  SentimentLabel,
  APIResponse 
} from '../core/types';

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
    'institutional', 'investment', 'buy', 'accumulate', 'support', 'hold'
  ],
  bearish: [
    'bearish', 'crash', 'dump', 'decline', 'fall', 'drop', 'sell-off',
    'negative', 'loss', 'risk', 'warning', 'concern', 'hack', 'exploit',
    'regulation', 'ban', 'restrict', 'fraud', 'scam', 'bear market',
    'liquidation', 'bankruptcy', 'investigation', 'lawsuit', 'fine'
  ]
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

  constructor(config?: { 
    cryptopanicApiKey?: string; 
    cryptocompareApiKey?: string;
  }) {
    this.cryptopanicApiKey = config?.cryptopanicApiKey;
    this.cryptocompareApiKey = config?.cryptocompareApiKey;
    this.cache = new Map();
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
      default:
        return [];
    }
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
        timeout: 10000
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
        author: post.source?.domain as string || undefined,
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
        { params, timeout: 10000 }
      );

      if (!response.data?.status_updates) {
        return [];
      }

      return response.data.status_updates.map((update: Record<string, unknown>): NewsArticle => ({
        id: `cg-${update.id}`,
        title: (update.project?.name as string) + ' Status Update',
        content: update.description as string,
        source: NewsSource.COINGECKO,
        sourceUrl: `https://www.coingecko.com/en/coins/${update.project?.id}`,
        author: update.project?.name as string || 'CoinGecko',
        category: 'Project Updates',
        sentiment: this.analyzeSentiment(update.description as string),
        importance: 0.6,
        tags: [update.project?.symbol as string, 'status-update'],
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
          { timeout: 10000 }
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
        { timeout: 10000 }
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
   */
  async fetchFromRSS(feedUrl: string): Promise<NewsArticle[]> {
    try {
      // Use a simple RSS parser approach
      const response = await axios.get(feedUrl, { 
        timeout: 10000,
        responseType: 'text'
      });

      // Parse RSS XML (simplified - in production use a proper RSS parser)
      const articles: NewsArticle[] = [];
      const itemMatches = response.data.match(/<item>([\s\S]*?)<\/item>/g) || [];

      itemMatches.forEach((item: string, index: number) => {
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
        const linkMatch = item.match(/<link>(.*?)<\/link>/);
        const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/);
        const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

        if (titleMatch) {
          const title = titleMatch[1] || titleMatch[2];
          articles.push({
            id: `rss-${Date.now()}-${index}`,
            title,
            content: descMatch?.[1] || descMatch?.[2] || undefined,
            source: NewsSource.CUSTOM_RSS,
            sourceUrl: linkMatch?.[1] || feedUrl,
            category: 'RSS Feed',
            sentiment: this.analyzeSentiment(title),
            importance: 0.5,
            tags: this.extractTags(title),
            publishedAt: dateMatch ? new Date(dateMatch[1]) : undefined,
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
}

// Export singleton
export const newsAggregator = new NewsAggregator();
