/**
 * Vector Database Service for Mantle AI Trading Bot
 * ChromaDB integration for semantic search of news and analysis
 */

import { ChromaClient, Collection, IncludeEnum } from 'chromadb-client';
import { NewsArticle, Signal, SignalAnalysis, SentimentLabel } from '../trading/core/types';

// Collection names
const COLLECTIONS = {
  NEWS: 'trading_news',
  SIGNALS: 'trading_signals',
  ANALYSIS: 'signal_analysis'
};

// Embedding dimension (for typical embedding models)
const EMBEDDING_DIMENSION = 384;

export class VectorStore {
  private client: ChromaClient | null = null;
  private newsCollection: Collection | null = null;
  private signalsCollection: Collection | null = null;
  private analysisCollection: Collection | null = null;
  private connected = false;

  constructor() {
    this.init();
  }

  /**
   * Initialize ChromaDB connection
   */
  private async init(): Promise<void> {
    try {
      // Try to connect to ChromaDB server
      this.client = new ChromaClient({
        path: process.env.CHROMADB_URL || 'http://localhost:8000'
      });

      // Create or get collections
      await this.createCollections();
      this.connected = true;
      console.log('VectorStore: Connected to ChromaDB');
    } catch (error) {
      console.warn('VectorStore: ChromaDB not available, using fallback mode');
      this.connected = false;
    }
  }

  /**
   * Create or get collections
   */
  private async createCollections(): Promise<void> {
    if (!this.client) return;

    // News collection
    this.newsCollection = await this.client.getOrCreateCollection({
      name: COLLECTIONS.NEWS,
      metadata: { description: 'Trading news articles for semantic search' }
    });

    // Signals collection
    this.signalsCollection = await this.client.getOrCreateCollection({
      name: COLLECTIONS.SIGNALS,
      metadata: { description: 'Historical trading signals' }
    });

    // Analysis collection
    this.analysisCollection = await this.client.getOrCreateCollection({
      name: COLLECTIONS.ANALYSIS,
      metadata: { description: 'Signal analysis and reasoning' }
    });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Check if the vector store is healthy
   * Attempts a heartbeat query to verify ChromaDB is responsive
   * @returns true if healthy, false otherwise
   */
  async isHealthy(): Promise<boolean> {
    if (!this.client || !this.connected) return false;
    try {
      await this.client.heartbeat();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate simple embedding (fallback when no embedding model)
   * This creates a deterministic embedding based on text content
   */
  private generateSimpleEmbedding(text: string): number[] {
    const embedding = new Array(EMBEDDING_DIMENSION).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    words.forEach((word, index) => {
      // Simple hash-based embedding
      const hash = this.simpleHash(word);
      const pos = Math.abs(hash) % EMBEDDING_DIMENSION;
      embedding[pos] += 1;

      // Add positional encoding
      const pos2 = (pos + index) % EMBEDDING_DIMENSION;
      embedding[pos2] += 0.5;
    });

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0)) || 1;
    return embedding.map(val => val / norm);
  }

  /**
   * Simple string hash
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Store news article in vector database
   */
  async storeNewsArticle(article: NewsArticle): Promise<string | null> {
    if (!this.newsCollection || !this.connected) {
      // Store article ID as vector reference
      return null;
    }

    try {
      const id = article.id || `news-${Date.now()}`;
      const text = `${article.title} ${article.content || ''}`;
      const embedding = this.generateSimpleEmbedding(text);

      await this.newsCollection.add({
        ids: [id],
        embeddings: [embedding],
        metadatas: [{
          title: article.title,
          source: article.source,
          category: article.category || 'General',
          sentiment: article.sentiment || 0,
          importance: article.importance || 0.5,
          publishedAt: article.publishedAt?.toISOString() || new Date().toISOString(),
          url: article.sourceUrl || ''
        }],
        documents: [text]
      });

      return id;
    } catch (error) {
      console.error('Error storing news article:', error);
      return null;
    }
  }

  /**
   * Store multiple news articles
   */
  async storeNewsArticles(articles: NewsArticle[]): Promise<string[]> {
    if (!this.newsCollection || !this.connected) {
      return [];
    }

    const ids: string[] = [];
    const embeddings: number[][] = [];
    const metadatas: Record<string, string | number | boolean>[] = [];
    const documents: string[] = [];

    articles.forEach(article => {
      const id = article.id || `news-${Date.now()}-${Math.random()}`;
      const text = `${article.title} ${article.content || ''}`;

      ids.push(id);
      embeddings.push(this.generateSimpleEmbedding(text));
      metadatas.push({
        title: article.title,
        source: article.source,
        category: article.category || 'General',
        sentiment: article.sentiment || 0,
        importance: article.importance || 0.5,
        publishedAt: article.publishedAt?.toISOString() || new Date().toISOString(),
        url: article.sourceUrl || ''
      });
      documents.push(text);
    });

    try {
      await this.newsCollection.add({
        ids,
        embeddings,
        metadatas,
        documents
      });

      return ids;
    } catch (error) {
      console.error('Error storing news articles:', error);
      return [];
    }
  }

  /**
   * Search similar news articles
   */
  async searchSimilarNews(
    query: string,
    nResults: number = 10,
    filters?: Record<string, unknown>
  ): Promise<Array<{
    id: string;
    text: string;
    metadata: Record<string, unknown>;
    distance: number;
  }>> {
    if (!this.newsCollection || !this.connected) {
      return [];
    }

    try {
      const queryEmbedding = this.generateSimpleEmbedding(query);
      
      const results = await this.newsCollection.query({
        queryEmbeddings: [queryEmbedding],
        nResults,
        where: filters,
        include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances]
      });

      if (!results.ids[0]) return [];

      return results.ids[0].map((id, index) => ({
        id,
        text: results.documents?.[0]?.[index] || '',
        metadata: results.metadatas?.[0]?.[index] || {},
        distance: results.distances?.[0]?.[index] || 0
      }));
    } catch (error) {
      console.error('Error searching news:', error);
      return [];
    }
  }

  /**
   * Store signal with analysis
   */
  async storeSignalAnalysis(
    signal: Signal,
    analysis: SignalAnalysis
  ): Promise<void> {
    if (!this.signalsCollection || !this.analysisCollection || !this.connected) {
      return;
    }

    try {
      // Store signal
      const signalText = `${signal.symbol} ${signal.action} ${signal.reasoning}`;
      await this.signalsCollection.add({
        ids: [signal.id],
        embeddings: [this.generateSimpleEmbedding(signalText)],
        metadatas: [{
          symbol: signal.symbol,
          action: signal.action,
          confidence: signal.confidence,
          status: signal.status,
          result: signal.result || 'PENDING',
          pnl: signal.resultPnL || 0,
          createdAt: signal.createdAt.toISOString()
        }],
        documents: [signalText]
      });

      // Store analysis
      const analysisText = analysis.keyFactors.join(' ') + ' ' + 
        analysis.technicalAnalysis.patterns.join(' ') + ' ' +
        analysis.fundamentalAnalysis.marketEvents.join(' ');

      await this.analysisCollection.add({
        ids: [`analysis-${signal.id}`],
        embeddings: [this.generateSimpleEmbedding(analysisText)],
        metadatas: [{
          signalId: signal.id,
          overallScore: analysis.overallScore,
          technicalScore: analysis.technicalAnalysis.score,
          fundamentalScore: analysis.fundamentalAnalysis.score,
          sentimentScore: analysis.sentimentAnalysis.overallSentiment
        }],
        documents: [analysisText]
      });
    } catch (error) {
      console.error('Error storing signal analysis:', error);
    }
  }

  /**
   * Find similar historical signals
   */
  async findSimilarSignals(
    symbol: string,
    action: string,
    reasoning: string,
    nResults: number = 5
  ): Promise<Array<{
    signalId: string;
    metadata: Record<string, unknown>;
    distance: number;
  }>> {
    if (!this.signalsCollection || !this.connected) {
      return [];
    }

    try {
      const queryText = `${symbol} ${action} ${reasoning}`;
      const queryEmbedding = this.generateSimpleEmbedding(queryText);

      const results = await this.signalsCollection.query({
        queryEmbeddings: [queryEmbedding],
        nResults,
        where: { symbol },
        include: [IncludeEnum.Metadatas, IncludeEnum.Distances]
      });

      if (!results.ids[0]) return [];

      return results.ids[0].map((id, index) => ({
        signalId: id,
        metadata: results.metadatas?.[0]?.[index] || {},
        distance: results.distances?.[0]?.[index] || 0
      }));
    } catch (error) {
      console.error('Error finding similar signals:', error);
      return [];
    }
  }

  /**
   * Get signal statistics from vector store
   */
  async getSignalStatistics(symbol?: string): Promise<{
    totalSignals: number;
    winRate: number;
    avgConfidence: number;
    avgPnL: number;
  }> {
    // This would require aggregation queries in ChromaDB
    // For now, return placeholder values
    return {
      totalSignals: 0,
      winRate: 0,
      avgConfidence: 0,
      avgPnL: 0
    };
  }

  /**
   * Delete old entries (cleanup)
   */
  async cleanupOldEntries(beforeDate: Date): Promise<void> {
    if (!this.connected) return;

    try {
      // ChromaDB doesn't have a direct delete by date, 
      // would need to query and delete by IDs
      // This is a placeholder for cleanup logic
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Get contextual news for signal generation
   */
  async getContextualNews(
    symbol: string,
    timeframe: string,
    maxArticles: number = 10
  ): Promise<NewsArticle[]> {
    // Search for relevant news
    const results = await this.searchSimilarNews(
      `${symbol} cryptocurrency trading`,
      maxArticles,
      { symbol: { $contains: symbol } }
    );

    return results.map(result => ({
      id: result.id,
      title: result.metadata.title as string || '',
      source: result.metadata.source as string || 'Unknown',
      sentiment: result.metadata.sentiment as number,
      importance: result.metadata.importance as number,
      category: result.metadata.category as string,
      publishedAt: new Date(result.metadata.publishedAt as string),
      fetchedAt: new Date(),
      processed: true,
      vectorId: result.id
    }));
  }

  /**
   * Analyze text sentiment using stored knowledge
   */
  async analyzeSentimentWithContext(text: string): Promise<{
    sentiment: number;
    label: SentimentLabel;
    relevantArticles: NewsArticle[];
  }> {
    // Search for similar articles
    const similar = await this.searchSimilarNews(text, 5);

    // Calculate aggregate sentiment from similar articles
    let totalSentiment = 0;
    const relevantArticles: NewsArticle[] = [];

    similar.forEach(result => {
      const sentiment = result.metadata.sentiment as number || 0;
      totalSentiment += sentiment;
      relevantArticles.push({
        id: result.id,
        title: result.metadata.title as string || '',
        source: result.metadata.source as string || 'Unknown',
        sentiment,
        publishedAt: new Date(result.metadata.publishedAt as string),
        fetchedAt: new Date(),
        processed: true
      });
    });

    const avgSentiment = similar.length > 0 ? totalSentiment / similar.length : 0;

    // Fixed: Check extreme values FIRST (was reversed, causing VERY_BULLISH to never trigger)
    let label = SentimentLabel.NEUTRAL;
    if (avgSentiment >= 0.6) label = SentimentLabel.VERY_BULLISH;
    else if (avgSentiment >= 0.2) label = SentimentLabel.BULLISH;
    else if (avgSentiment <= -0.6) label = SentimentLabel.VERY_BEARISH;
    else if (avgSentiment <= -0.2) label = SentimentLabel.BEARISH;

    return {
      sentiment: avgSentiment,
      label,
      relevantArticles
    };
  }
}

// Export singleton
export const vectorStore = new VectorStore();
