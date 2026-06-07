/**
 * News API Routes for Mantle AI Trading Bot
 * v3.0.0 - Added pagination, breaking news, weighted sentiment endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { newsAggregator } from '@/lib/trading/news/news-aggregator';
import { db } from '@/lib/db';

// ==================== ZOD SCHEMAS ====================

const newsQuerySchema = z.object({
  symbol: z.string().optional(),
  source: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  page: z.coerce.number().int().min(1).default(1),
  minImportance: z.coerce.number().min(0).max(1).optional(),
});

const sentimentQuerySchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  timeWindowHours: z.coerce.number().min(1).max(168, 'Max 168 hours (7 days)').default(24),
});

const breakingNewsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

// GET /api/trading/news - Get news articles with pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    
    // Check for special endpoints via query param
    const endpoint = searchParams.get('endpoint');

    // Breaking news endpoint
    if (endpoint === 'breaking') {
      const validation = breakingNewsQuerySchema.safeParse(params);
      if (!validation.success) {
        return NextResponse.json(
          { success: false, error: 'Invalid parameters', details: validation.error.flatten() },
          { status: 400 }
        );
      }
      const breakingNews = await newsAggregator.getBreakingNews(validation.data.limit);
      return NextResponse.json({ success: true, data: breakingNews });
    }

    // Weighted sentiment endpoint
    if (endpoint === 'weighted_sentiment') {
      const validation = sentimentQuerySchema.safeParse(params);
      if (!validation.success) {
        return NextResponse.json(
          { success: false, error: 'Invalid parameters', details: validation.error.flatten() },
          { status: 400 }
        );
      }
      const sentiment = await newsAggregator.getWeightedSentiment(
        validation.data.symbol,
        validation.data.timeWindowHours
      );
      return NextResponse.json({ success: true, data: sentiment });
    }

    // Default: paginated news query
    const validation = newsQuerySchema.safeParse(params);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { symbol, source, limit, page, minImportance } = validation.data;
    const offset = (page - 1) * limit;

    if (symbol) {
      const news = await newsAggregator.getNewsForSymbol(symbol, limit);
      
      // Apply client-side pagination
      const paginatedNews = news.slice(offset, offset + limit);
      const total = news.length;
      
      return NextResponse.json({ 
        success: true, 
        data: paginatedNews,
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + limit < total
        }
      });
    }

    const news = await newsAggregator.fetchAllNews({ limit: limit * 2 });
    
    // Filter by min importance if specified
    const filtered = minImportance 
      ? news.filter(a => (a.importance || 0) >= minImportance)
      : news;

    // Apply pagination
    const paginatedNews = filtered.slice(offset, offset + limit);
    const total = filtered.length;

    // Save to database
    for (const article of paginatedNews.slice(0, 20)) {
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
            tags: (article.tags || []).join(','),
            publishedAt: article.publishedAt,
            processed: article.processed
          }
        });
      } catch {
        // Ignore duplicate errors
      }
    }

    return NextResponse.json({
      success: true,
      data: paginatedNews,
      pagination: {
        page,
        limit,
        total,
        hasMore: offset + limit < total
      },
      upcomingEvents: newsAggregator.getUpcomingEvents(),
    });
  } catch (error) {
    console.error('Error fetching news:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch news' },
      { status: 500 }
    );
  }
}
