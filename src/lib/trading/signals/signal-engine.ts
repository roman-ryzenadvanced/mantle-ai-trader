/**
 * Signal Generation Engine for Mantle AI Trading Bot
 * AI-powered signal generation with comprehensive analysis and rating system
 * 
 * v2.0.0 - Fixed: MACD calculation, sentiment label ordering, RSI Wilder smoothing,
 * proper signal status enum usage, input validation, and memory efficiency
 */

import ZAI from 'z-ai-web-dev-sdk';
import {
  Signal,
  SignalGenerationInput,
  SignalGenerationOutput,
  SignalAnalysis,
  TechnicalAnalysis,
  FundamentalAnalysis,
  SentimentAnalysis,
  RiskAssessment,
  TradeAction,
  RiskLevel,
  SentimentLabel,
  SignalStatus,
  TimeFrame,
  MarketDataPoint,
  NewsArticle
} from '../core/types';

// Technical analysis helpers
function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  if (data.length < period) return result;
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

function calculateEMA(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // Use SMA as the first EMA value for proper seeding
  if (data.length < period) {
    result[0] = data[0];
    for (let i = 1; i < data.length; i++) {
      result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
    }
    return result;
  }

  // Seed with SMA of first `period` values
  const seed = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = seed;

  for (let i = period; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
  }

  // Fill in the early values with the seed for consistency
  for (let i = 0; i < period - 1; i++) {
    result[i] = seed;
  }

  return result;
}

/**
 * Calculate RSI using Wilder's smoothing method (standard approach)
 * Fixed: Previously used simple average which gave inaccurate results
 */
function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50; // Neutral for insufficient data
  
  let gains = 0;
  let losses = 0;
  
  // First average: simple average of first `period` changes
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // Wilder's smoothing for remaining data
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const currentGain = diff > 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;
    
    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
  }
  
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate MACD with proper signal line
 * Fixed: Previously generated a fake signal line from constant values
 */
function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  if (closes.length < 26) {
    return { macd: 0, signal: 0, histogram: 0 };
  }

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  
  // Calculate MACD line values
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] !== undefined && ema26[i] !== undefined) {
      macdLine.push(ema12[i] - ema26[i]);
    }
  }
  
  if (macdLine.length < 9) {
    const lastMacd = macdLine[macdLine.length - 1] || 0;
    return { macd: lastMacd, signal: lastMacd, histogram: 0 };
  }
  
  // Calculate signal line as 9-period EMA of MACD line
  const signalEma = calculateEMA(macdLine, 9);
  
  const macd = macdLine[macdLine.length - 1];
  const signal = signalEma[signalEma.length - 1];
  const histogram = macd - signal;
  
  return { macd, signal, histogram };
}

function findSupportResistance(
  highs: number[],
  lows: number[],
  closes: number[]
): { support: number[]; resistance: number[] } {
  const support: number[] = [];
  const resistance: number[] = [];
  
  if (highs.length < 5) return { support, resistance };
  
  for (let i = 2; i < highs.length - 2; i++) {
    // Support: local low
    if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
        lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
      support.push(lows[i]);
    }
    
    // Resistance: local high
    if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
        highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
      resistance.push(highs[i]);
    }
  }
  
  // Sort and deduplicate
  support.sort((a, b) => b - a);
  resistance.sort((a, b) => a - b);
  
  return {
    support: [...new Set(support)].slice(0, 5),
    resistance: [...new Set(resistance)].slice(0, 5)
  };
}

function detectPatterns(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[]
): string[] {
  const patterns: string[] = [];
  const len = closes.length;
  
  if (len < 5) return patterns;
  
  const lastOpen = opens[len - 1];
  const lastClose = closes[len - 1];
  const lastHigh = highs[len - 1];
  const lastLow = lows[len - 1];
  const bodySize = Math.abs(lastClose - lastOpen);
  const range = lastHigh - lastLow;
  
  // Guard against zero range
  if (range === 0) return patterns;
  
  // Doji - very small body relative to range
  if (bodySize < range * 0.1) {
    patterns.push('DOJI');
  }
  
  // Hammer - small body at top, long lower shadow
  if (bodySize < range * 0.3 && 
      (Math.min(lastOpen, lastClose) - lastLow) > range * 0.6) {
    patterns.push('HAMMER');
  }

  // Inverted Hammer - small body at bottom, long upper shadow
  if (bodySize < range * 0.3 &&
      (lastHigh - Math.max(lastOpen, lastClose)) > range * 0.6) {
    patterns.push('INVERTED_HAMMER');
  }
  
  // Bullish Engulfing
  if (len >= 2) {
    const prevClose = closes[len - 2];
    const prevOpen = opens[len - 2];
    
    if (prevClose < prevOpen && // Previous bearish
        lastClose > lastOpen && // Current bullish
        lastOpen <= prevClose && // Opens at or below prev close (fixed: was <)
        lastClose >= prevOpen) { // Closes at or above prev open (fixed: was >)
      patterns.push('BULLISH_ENGULFING');
    }
  }
  
  // Bearish Engulfing
  if (len >= 2) {
    const prevClose = closes[len - 2];
    const prevOpen = opens[len - 2];
    
    if (prevClose > prevOpen && // Previous bullish
        lastClose < lastOpen && // Current bearish
        lastOpen >= prevClose && // Opens at or above prev close (fixed: was >)
        lastClose <= prevOpen) { // Closes at or below prev open (fixed: was <)
      patterns.push('BEARISH_ENGULFING');
    }
  }
  
  // Morning Star
  if (len >= 3) {
    const firstClose = closes[len - 3];
    const firstOpen = opens[len - 3];
    const secondClose = closes[len - 2];
    const secondOpen = opens[len - 2];
    const secondBody = Math.abs(secondClose - secondOpen);
    const secondRange = Math.max(secondOpen, secondClose) - Math.min(secondOpen, secondClose);
    
    if (firstClose < firstOpen && // First bearish
        (secondRange === 0 || secondBody < secondRange * 0.3) && // Small body (fixed: guard against zero)
        lastClose > lastOpen && lastClose > (firstOpen + firstClose) / 2) { // Bullish third
      patterns.push('MORNING_STAR');
    }
  }

  // Evening Star
  if (len >= 3) {
    const firstClose = closes[len - 3];
    const firstOpen = opens[len - 3];
    const secondClose = closes[len - 2];
    const secondOpen = opens[len - 2];
    const secondBody = Math.abs(secondClose - secondOpen);
    const secondRange = Math.max(secondOpen, secondClose) - Math.min(secondOpen, secondClose);

    if (firstClose > firstOpen && // First bullish
        (secondRange === 0 || secondBody < secondRange * 0.3) && // Small body
        lastClose < lastOpen && lastClose < (firstOpen + firstClose) / 2) { // Bearish third
      patterns.push('EVENING_STAR');
    }
  }
  
  return patterns;
}

export class SignalEngine {
  private zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;
  private aiInitialized = false;

  constructor() {
    this.initAI();
  }

  private async initAI(): Promise<void> {
    if (this.aiInitialized) return;
    try {
      this.zai = await ZAI.create();
      this.aiInitialized = true;
    } catch (error) {
      console.warn('SignalEngine: AI initialization failed, using fallback reasoning:', error);
      this.aiInitialized = true; // Don't keep retrying
    }
  }

  /**
   * Ensure AI is initialized before using it
   */
  private async ensureAI(): Promise<void> {
    if (!this.aiInitialized) {
      await this.initAI();
    }
  }

  /**
   * Generate trading signal with comprehensive analysis
   */
  async generateSignal(input: SignalGenerationInput): Promise<SignalGenerationOutput> {
    // Validate input
    if (!input.symbol || input.symbol.trim() === '') {
      throw new Error('Symbol is required for signal generation');
    }
    if (!input.marketData || input.marketData.length === 0) {
      throw new Error('Market data is required for signal generation');
    }

    await this.ensureAI();
    
    // Perform technical analysis
    const technicalAnalysis = this.performTechnicalAnalysis(input.marketData);
    
    // Perform fundamental analysis
    const fundamentalAnalysis = await this.performFundamentalAnalysis(
      input.symbol,
      input.newsArticles
    );
    
    // Perform sentiment analysis
    const sentimentAnalysis = await this.performSentimentAnalysis(
      input.symbol,
      input.newsArticles
    );
    
    // Calculate overall score
    const overallScore = this.calculateOverallScore(
      technicalAnalysis,
      fundamentalAnalysis,
      sentimentAnalysis
    );
    
    // Determine action
    const action = this.determineAction(
      technicalAnalysis,
      fundamentalAnalysis,
      sentimentAnalysis,
      overallScore
    );
    
    // Generate reasoning using AI
    const reasoning = await this.generateReasoning(
      input.symbol,
      action,
      technicalAnalysis,
      fundamentalAnalysis,
      sentimentAnalysis
    );
    
    // Calculate confidence
    const confidence = this.calculateConfidence(
      technicalAnalysis,
      fundamentalAnalysis,
      sentimentAnalysis,
      overallScore
    );
    
    // Assess risk
    const riskAssessment = this.assessRisk(
      input.symbol,
      action,
      technicalAnalysis,
      input.marketData
    );
    
    // Calculate targets
    const currentPrice = input.marketData[input.marketData.length - 1]?.close || 0;
    const { priceTarget, stopLoss, takeProfit } = this.calculateTargets(
      action,
      currentPrice,
      technicalAnalysis,
      riskAssessment
    );
    
    // Build signal with proper enum usage
    const signal: Omit<Signal, 'id' | 'createdAt' | 'updatedAt'> = {
      symbol: input.symbol,
      action,
      confidence,
      rating: 0,
      priceTarget,
      stopLoss,
      takeProfit,
      reasoning,
      newsSources: input.newsArticles.slice(0, 5).map(a => a.sourceUrl).filter((url): url is string => Boolean(url)),
      sentimentScore: sentimentAnalysis.overallSentiment,
      technicalScore: technicalAnalysis.score,
      fundamentalScore: fundamentalAnalysis.score,
      status: SignalStatus.PENDING, // Fixed: Was using string literal
      demo: false
    };
    
    // Build analysis
    const analysis: SignalAnalysis = {
      technicalAnalysis,
      fundamentalAnalysis,
      sentimentAnalysis,
      overallScore,
      keyFactors: this.extractKeyFactors(
        technicalAnalysis,
        fundamentalAnalysis,
        sentimentAnalysis
      ),
      warnings: this.generateWarnings(
        technicalAnalysis,
        fundamentalAnalysis,
        sentimentAnalysis,
        riskAssessment
      )
    };
    
    return {
      signal,
      analysis,
      riskAssessment
    };
  }

  /**
   * Perform technical analysis on market data
   */
  private performTechnicalAnalysis(data: MarketDataPoint[]): TechnicalAnalysis {
    if (data.length < 50) {
      return {
        trend: 'SIDEWAYS',
        trendStrength: 0,
        supportLevels: [],
        resistanceLevels: [],
        indicators: { rsi: 50 },
        patterns: [],
        score: 0.5
      };
    }

    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const opens = data.map(d => d.open);
    const volumes = data.map(d => d.volume);

    // Calculate indicators
    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const rsi = calculateRSI(closes);
    const macd = calculateMACD(closes);

    // Determine trend
    const lastClose = closes[closes.length - 1];
    const lastSma20 = sma20[sma20.length - 1];
    const lastSma50 = sma50[sma50.length - 1];

    let trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' = 'SIDEWAYS';
    let trendStrength = 0;

    if (lastSma20 !== undefined && lastSma50 !== undefined) {
      if (lastClose > lastSma20 && lastSma20 > lastSma50) {
        trend = 'BULLISH';
        trendStrength = Math.min((lastClose - lastSma50) / lastSma50, 1);
      } else if (lastClose < lastSma20 && lastSma20 < lastSma50) {
        trend = 'BEARISH';
        trendStrength = Math.min((lastSma50 - lastClose) / lastSma50, 1);
      }
    }

    // Find support and resistance
    const { support, resistance } = findSupportResistance(highs, lows, closes);

    // Detect patterns
    const patterns = detectPatterns(opens, highs, lows, closes);

    // Calculate score
    let score = 0.5;

    // RSI contribution
    if (rsi > 70) score -= 0.15; // Overbought
    else if (rsi < 30) score += 0.15; // Oversold
    else if (rsi > 50) score += 0.1;

    // MACD contribution
    if (macd.histogram > 0) score += 0.1;
    else score -= 0.1;

    // Trend contribution
    if (trend === 'BULLISH') score += 0.15 * trendStrength;
    else if (trend === 'BEARISH') score -= 0.15 * trendStrength;

    // Pattern contribution
    if (patterns.includes('HAMMER') || patterns.includes('MORNING_STAR') || patterns.includes('BULLISH_ENGULFING')) {
      score += 0.1;
    }
    if (patterns.includes('BEARISH_ENGULFING') || patterns.includes('EVENING_STAR')) {
      score -= 0.1;
    }

    // Volume analysis
    const recentVolumes = volumes.slice(-20);
    if (recentVolumes.length > 0) {
      const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
      const lastVolume = volumes[volumes.length - 1];
      if (lastVolume > avgVolume * 1.5) {
        // High volume confirms trend
        if (trend === 'BULLISH') score += 0.05;
        else if (trend === 'BEARISH') score -= 0.05;
      }
    }

    const indicators: Record<string, number> = { rsi };
    if (sma20.length > 0) indicators.sma20 = lastSma20;
    if (sma50.length > 0) indicators.sma50 = lastSma50;
    if (ema12.length > 0) indicators.ema12 = ema12[ema12.length - 1];
    if (ema26.length > 0) indicators.ema26 = ema26[ema26.length - 1];
    indicators.macd = macd.macd;
    indicators.macdSignal = macd.signal;
    indicators.macdHistogram = macd.histogram;

    return {
      trend,
      trendStrength,
      supportLevels: support,
      resistanceLevels: resistance,
      indicators,
      patterns,
      score: Math.max(0, Math.min(1, score))
    };
  }

  /**
   * Perform fundamental analysis
   */
  private async performFundamentalAnalysis(
    symbol: string,
    newsArticles: NewsArticle[]
  ): Promise<FundamentalAnalysis> {
    // Get news sentiment
    const newsImpact = this.calculateNewsImpact(newsArticles);
    
    // Extract market events
    const marketEvents = this.extractMarketEvents(newsArticles);
    
    // Economic factors
    const economicFactors = this.identifyEconomicFactors(newsArticles);

    // Calculate score based on news
    let score = 0.5;
    
    // Positive events boost score
    marketEvents.forEach(event => {
      const eventLower = event.toLowerCase();
      if (eventLower.includes('partnership') || 
          eventLower.includes('adoption') ||
          eventLower.includes('launch')) {
        score += 0.05;
      }
      if (eventLower.includes('hack') || 
          eventLower.includes('regulation') ||
          eventLower.includes('ban')) {
        score -= 0.05;
      }
    });

    return {
      newsImpact,
      marketEvents,
      economicFactors,
      score: Math.max(0, Math.min(1, score))
    };
  }

  /**
   * Perform sentiment analysis
   * Fixed: Sentiment label ordering was wrong - now checks extreme values first
   */
  private async performSentimentAnalysis(
    symbol: string,
    newsArticles: NewsArticle[]
  ): Promise<SentimentAnalysis> {
    // Get sentiment from news aggregator
    let newsSentiment = 0;
    try {
      const symbolSentiment = await newsAggregator.getSymbolSentiment(symbol);
      newsSentiment = symbolSentiment.overallSentiment;
    } catch {
      // If news aggregator fails, use articles directly
      if (newsArticles.length > 0) {
        newsSentiment = newsArticles.reduce((sum, a) => sum + (a.sentiment || 0), 0) / newsArticles.length;
      }
    }

    // Get contextual sentiment from vector store
    let contextSentiment = 0;
    try {
      const contextResult = await vectorStore.analyzeSentimentWithContext(
        `${symbol} trading analysis`
      );
      contextSentiment = contextResult.sentiment;
    } catch {
      // Vector store may not be available
    }

    // Combine sentiments with weights (news > context)
    const overallSentiment = newsSentiment * 0.7 + contextSentiment * 0.3;

    // Determine label - FIXED: Check extreme values first (was reversed before)
    let sentimentLabel = SentimentLabel.NEUTRAL;
    if (overallSentiment >= 0.6) sentimentLabel = SentimentLabel.VERY_BULLISH;
    else if (overallSentiment >= 0.2) sentimentLabel = SentimentLabel.BULLISH;
    else if (overallSentiment <= -0.6) sentimentLabel = SentimentLabel.VERY_BEARISH;
    else if (overallSentiment <= -0.2) sentimentLabel = SentimentLabel.BEARISH;

    // Extract key topics
    const keyTopics = this.extractKeyTopics(newsArticles);

    return {
      overallSentiment,
      sentimentLabel,
      newsSentiment,
      socialSentiment: contextSentiment,
      keyTopics,
      trendingKeywords: keyTopics
    };
  }

  /**
   * Calculate overall score
   */
  private calculateOverallScore(
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis
  ): number {
    const weights = {
      technical: 0.4,
      fundamental: 0.3,
      sentiment: 0.3
    };

    return (
      technical.score * weights.technical +
      fundamental.score * weights.fundamental +
      ((sentiment.overallSentiment + 1) / 2) * weights.sentiment
    );
  }

  /**
   * Determine trading action
   */
  private determineAction(
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis,
    overallScore: number
  ): TradeAction {
    // Strong buy conditions
    if (overallScore >= 0.7 && 
        technical.trend === 'BULLISH' &&
        (sentiment.sentimentLabel === SentimentLabel.BULLISH || sentiment.sentimentLabel === SentimentLabel.VERY_BULLISH)) {
      return TradeAction.BUY;
    }

    // Strong sell conditions
    if (overallScore <= 0.3 &&
        technical.trend === 'BEARISH' &&
        (sentiment.sentimentLabel === SentimentLabel.BEARISH || sentiment.sentimentLabel === SentimentLabel.VERY_BEARISH)) {
      return TradeAction.SELL;
    }

    // Moderate buy
    if (overallScore >= 0.6 &&
        (technical.indicators.rsi || 50) < 70 &&
        sentiment.overallSentiment > 0) {
      return TradeAction.BUY;
    }

    // Moderate sell
    if (overallScore <= 0.4 &&
        (technical.indicators.rsi || 50) > 30 &&
        sentiment.overallSentiment < 0) {
      return TradeAction.SELL;
    }

    return TradeAction.HOLD;
  }

  /**
   * Generate AI reasoning
   */
  private async generateReasoning(
    symbol: string,
    action: TradeAction,
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis
  ): Promise<string> {
    if (!this.zai) {
      return this.generateBasicReasoning(
        symbol, action, technical, fundamental, sentiment
      );
    }

    try {
      const prompt = `Analyze the following trading signal for ${symbol} and provide a brief, professional reasoning (2-3 sentences):

Action: ${action}
Technical Analysis: Trend is ${technical.trend} with ${Math.round(technical.trendStrength * 100)}% strength. RSI: ${(technical.indicators.rsi || 50).toFixed(1)}. Patterns detected: ${technical.patterns.join(', ') || 'None'}.
Fundamental Analysis: News impact score: ${(fundamental.newsImpact * 100).toFixed(0)}%. Key events: ${fundamental.marketEvents.slice(0, 3).join(', ') || 'None significant'}.
Sentiment: ${sentiment.sentimentLabel} (${(sentiment.overallSentiment * 100).toFixed(0)}%)

Provide a concise trading rationale:`;

      const completion = await this.zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a professional trading analyst. Provide concise, actionable insights.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.3
      });

      return completion.choices[0]?.message?.content || 
        this.generateBasicReasoning(symbol, action, technical, fundamental, sentiment);
    } catch (error) {
      return this.generateBasicReasoning(symbol, action, technical, fundamental, sentiment);
    }
  }

  /**
   * Generate basic reasoning without AI
   */
  private generateBasicReasoning(
    symbol: string,
    action: TradeAction,
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis
  ): string {
    const reasons: string[] = [];

    if (technical.trend === 'BULLISH' && action === TradeAction.BUY) {
      reasons.push(`Bullish trend detected with ${Math.round(technical.trendStrength * 100)}% strength`);
    }
    if (technical.trend === 'BEARISH' && action === TradeAction.SELL) {
      reasons.push(`Bearish trend detected with ${Math.round(technical.trendStrength * 100)}% strength`);
    }
    if (technical.indicators.rsi && technical.indicators.rsi < 30) {
      reasons.push('RSI indicates oversold conditions');
    }
    if (technical.indicators.rsi && technical.indicators.rsi > 70) {
      reasons.push('RSI indicates overbought conditions');
    }
    if (technical.patterns.includes('BULLISH_ENGULFING')) {
      reasons.push('Bullish engulfing pattern detected');
    }
    if (technical.patterns.includes('BEARISH_ENGULFING')) {
      reasons.push('Bearish engulfing pattern detected');
    }
    if (sentiment.sentimentLabel === SentimentLabel.BULLISH || sentiment.sentimentLabel === SentimentLabel.VERY_BULLISH) {
      reasons.push('Market sentiment is bullish');
    }
    if (sentiment.sentimentLabel === SentimentLabel.BEARISH || sentiment.sentimentLabel === SentimentLabel.VERY_BEARISH) {
      reasons.push('Market sentiment is bearish');
    }

    return reasons.length > 0 
      ? `${symbol}: ${action} signal. ${reasons.join('. ')}.`
      : `${symbol}: ${action} signal based on mixed indicators.`;
  }

  /**
   * Calculate confidence
   */
  private calculateConfidence(
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis,
    overallScore: number
  ): number {
    // Base confidence from overall score
    let confidence = Math.abs(overallScore - 0.5) * 2;

    // Boost confidence when all indicators align
    const technicalDirection = technical.score > 0.5 ? 1 : -1;
    const sentimentDirection = sentiment.overallSentiment > 0 ? 1 : -1;

    if (technicalDirection === sentimentDirection) {
      confidence *= 1.2;
    }

    // Reduce confidence during high volatility (wide support/resistance range)
    if (technical.supportLevels.length > 0 && technical.resistanceLevels.length > 0) {
      const range = technical.resistanceLevels[0] - technical.supportLevels[0];
      const midPrice = (technical.resistanceLevels[0] + technical.supportLevels[0]) / 2;
      if (midPrice > 0) {
        const rangePercent = range / midPrice;
        if (rangePercent > 0.1) {
          confidence *= 0.8;
        }
      }
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Assess risk
   */
  private assessRisk(
    symbol: string,
    action: TradeAction,
    technical: TechnicalAnalysis,
    marketData: MarketDataPoint[]
  ): RiskAssessment {
    const lastPrice = marketData[marketData.length - 1]?.close || 0;

    // Calculate volatility
    const returns = marketData.slice(-20).map((d, i, arr) => {
      if (i === 0) return 0;
      const prevClose = arr[i - 1].close;
      return prevClose !== 0 ? (d.close - prevClose) / prevClose : 0;
    });
    const volatility = Math.sqrt(
      returns.reduce((sum, r) => sum + r * r, 0) / Math.max(returns.length, 1)
    );

    // Determine risk level
    let riskLevel = RiskLevel.MODERATE;
    let riskScore = 0.5;

    if (volatility > 0.05) {
      riskLevel = RiskLevel.AGGRESSIVE;
      riskScore = 0.7;
    } else if (volatility < 0.02) {
      riskLevel = RiskLevel.CONSERVATIVE;
      riskScore = 0.3;
    }

    // Calculate suggested levels
    const suggestedStopLoss = action === TradeAction.BUY
      ? lastPrice * (1 - volatility * 2)
      : lastPrice * (1 + volatility * 2);

    const suggestedTakeProfit = action === TradeAction.BUY
      ? lastPrice * (1 + volatility * 3)
      : lastPrice * (1 - volatility * 3);

    // Risk factors
    const riskFactors: string[] = [];
    if ((technical.indicators.rsi || 50) > 70) {
      riskFactors.push('Overbought conditions');
    }
    if ((technical.indicators.rsi || 50) < 30) {
      riskFactors.push('Oversold conditions');
    }
    if (volatility > 0.04) {
      riskFactors.push('High market volatility');
    }
    if (technical.patterns.includes('DOJI')) {
      riskFactors.push('Indecision pattern detected');
    }

    // Max recommended position based on risk level
    const maxPositionMultiplier = riskLevel === RiskLevel.CONSERVATIVE ? 0.01 : 
                                   riskLevel === RiskLevel.MODERATE ? 0.03 : 0.05;

    return {
      riskScore,
      riskLevel,
      maxRecommendedPosition: lastPrice * 10 * maxPositionMultiplier / lastPrice, // Risk-adjusted
      suggestedStopLoss,
      suggestedTakeProfit,
      riskFactors,
      marketVolatility: volatility,
      liquidityRisk: 0.2 // Assume good liquidity for major pairs
    };
  }

  /**
   * Calculate price targets
   */
  private calculateTargets(
    action: TradeAction,
    currentPrice: number,
    technical: TechnicalAnalysis,
    risk: RiskAssessment
  ): { priceTarget: number; stopLoss: number; takeProfit: number } {
    if (action === TradeAction.HOLD || currentPrice === 0) {
      return {
        priceTarget: currentPrice,
        stopLoss: currentPrice,
        takeProfit: currentPrice
      };
    }

    // Use support/resistance if available
    let priceTarget = risk.suggestedTakeProfit;
    let stopLoss = risk.suggestedStopLoss;

    if (action === TradeAction.BUY) {
      // Target nearest resistance
      if (technical.resistanceLevels.length > 0) {
        priceTarget = Math.min(
          technical.resistanceLevels[0],
          risk.suggestedTakeProfit
        );
      }
      // Stop at nearest support
      if (technical.supportLevels.length > 0) {
        stopLoss = Math.max(
          technical.supportLevels[0],
          risk.suggestedStopLoss
        );
      }
    } else {
      // Target nearest support
      if (technical.supportLevels.length > 0) {
        priceTarget = Math.max(
          technical.supportLevels[0],
          risk.suggestedTakeProfit
        );
      }
      // Stop at nearest resistance
      if (technical.resistanceLevels.length > 0) {
        stopLoss = Math.min(
          technical.resistanceLevels[0],
          risk.suggestedStopLoss
        );
      }
    }

    // Validate targets make sense
    if (action === TradeAction.BUY) {
      if (stopLoss >= currentPrice) stopLoss = risk.suggestedStopLoss;
      if (priceTarget <= currentPrice) priceTarget = risk.suggestedTakeProfit;
    } else {
      if (stopLoss <= currentPrice) stopLoss = risk.suggestedStopLoss;
      if (priceTarget >= currentPrice) priceTarget = risk.suggestedTakeProfit;
    }

    const takeProfit = priceTarget;

    return { priceTarget, stopLoss, takeProfit };
  }

  // Helper methods
  private calculateNewsImpact(articles: NewsArticle[]): number {
    if (articles.length === 0) return 0;
    
    const totalImportance = articles.reduce(
      (sum, a) => sum + (a.importance || 0.5),
      0
    );
    
    return Math.min(totalImportance / articles.length, 1);
  }

  private extractMarketEvents(articles: NewsArticle[]): string[] {
    return articles
      .filter(a => a.importance && a.importance > 0.6)
      .slice(0, 10)
      .map(a => a.title);
  }

  private identifyEconomicFactors(articles: NewsArticle[]): string[] {
    const factors: string[] = [];
    const keywords = ['inflation', 'interest rate', 'fed', 'regulation', 'adoption', 'institutional'];
    
    articles.forEach(article => {
      const text = article.title.toLowerCase();
      keywords.forEach(kw => {
        if (text.includes(kw)) {
          factors.push(kw);
        }
      });
    });
    
    return [...new Set(factors)];
  }

  private extractKeyTopics(articles: NewsArticle[]): string[] {
    const topics: string[] = [];
    
    articles.forEach(article => {
      if (article.tags) {
        topics.push(...article.tags);
      }
    });
    
    // Return most frequent topics
    const frequency: Record<string, number> = {};
    topics.forEach(t => {
      frequency[t] = (frequency[t] || 0) + 1;
    });
    
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);
  }

  private extractKeyFactors(
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis
  ): string[] {
    const factors: string[] = [];

    if (technical.trend !== 'SIDEWAYS') {
      factors.push(`${technical.trend} trend (${Math.round(technical.trendStrength * 100)}% strength)`);
    }
    if (technical.patterns.length > 0) {
      factors.push(`Patterns: ${technical.patterns.join(', ')}`);
    }
    if (fundamental.marketEvents.length > 0) {
      factors.push(`Key events: ${fundamental.marketEvents.slice(0, 2).join(', ')}`);
    }
    if (sentiment.sentimentLabel !== SentimentLabel.NEUTRAL) {
      factors.push(`Sentiment: ${sentiment.sentimentLabel}`);
    }

    return factors;
  }

  private generateWarnings(
    technical: TechnicalAnalysis,
    fundamental: FundamentalAnalysis,
    sentiment: SentimentAnalysis,
    risk: RiskAssessment
  ): string[] {
    const warnings: string[] = [];

    if ((technical.indicators.rsi || 50) > 70) {
      warnings.push('RSI indicates overbought conditions - potential reversal risk');
    }
    if ((technical.indicators.rsi || 50) < 30) {
      warnings.push('RSI indicates oversold conditions - may continue falling');
    }
    if (risk.marketVolatility > 0.05) {
      warnings.push('High market volatility - use smaller position sizes');
    }
    if (risk.riskFactors.includes('Indecision pattern detected')) {
      warnings.push('Market showing indecision - wait for clearer signals');
    }
    if (fundamental.marketEvents.some(e => 
      e.toLowerCase().includes('regulation') || 
      e.toLowerCase().includes('ban')
    )) {
      warnings.push('Regulatory news may cause volatility');
    }
    if (technical.trend === 'SIDEWAYS' && technical.patterns.length === 0) {
      warnings.push('No clear trend or patterns - low confidence signal');
    }

    return warnings;
  }
}

// Export singleton - lazy initialization
let _signalEngine: SignalEngine | null = null;
export function getSignalEngine(): SignalEngine {
  if (!_signalEngine) {
    _signalEngine = new SignalEngine();
  }
  return _signalEngine;
}

// Keep backward compatibility
export const signalEngine = new SignalEngine();
