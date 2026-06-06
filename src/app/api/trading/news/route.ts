/**
 * News API Routes for Mantle AI Trading Bot
 */

import { NextRequest, NextResponse } from 'next/server';
import { newsAggregator } from '@/lib/trading/news/news-aggregator';
import { db } from '@/lib/db';

// GET /api/trading/news - Get news articles
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const source = searchParams.get('source');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (symbol) {
      const news = await newsAggregator.getNewsForSymbol(symbol, limit);
      return NextResponse.json({ success: true, data: news });
    }

    const news = await newsAggregator.fetchAllNews({ limit });
    
    // Save to database
    for (const article of news.slice(0, 20)) {
      try {
        await db.newsArticle.upsert({
          where: { sourceUrl: article.sourceUrl || `unknown-${Date.now()}` },
          update: {},
          create: {
            title: article.title,
            content: article.content || '',
            summary: article.summary,
            source: article.source,
            sourceUrl: article.sourceUrl || '',
            author: article.author,
            category: article.category,
            sentiment: article.sentiment,
            importance: article.importance,
            tags: article.tags || [],
            publishedAt: article.publishedAt,
            processed: article.processed
          }
        });
      } catch {
        // Ignore duplicate errors
      }
    }

    return NextResponse.json({ success: true, data: news });
  } catch (error) {
    console.error('Error fetching news:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch news' },
      { status: 500 }
    );
  }
}

// GET /api/trading/news/sentiment - Get sentiment for symbol
export async function SENTIMENT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Symbol is required' },
        { status: 400 }
      );
    }

    const sentiment = await newsAggregator.getSymbolSentiment(symbol);
    return NextResponse.json({ success: true, data: sentiment });
  } catch (error) {
    console.error('Error fetching sentiment:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch sentiment' },
      { status: 500 }
    );
  }
}
