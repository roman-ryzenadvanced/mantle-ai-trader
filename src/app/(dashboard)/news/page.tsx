'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Newspaper, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface NewsArticle {
  id: string;
  title: string;
  source: string;
  summary?: string;
  sentiment?: number;
  importance?: number;
  publishedAt?: string;
  sourceUrl?: string;
}

const sentimentLabel = (score?: number) => {
  if (score == null) return 'neutral';
  if (score > 0.3) return 'positive';
  if (score < -0.3) return 'negative';
  return 'neutral';
};

const sentimentBadgeClass: Record<string, string> = {
  positive: 'bg-green-500/20 text-green-400 border-green-500/30',
  negative: 'bg-red-500/20 text-red-400 border-red-500/30',
  neutral: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

function NewsCardSkeleton() {
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20 bg-gray-800" />
        <Skeleton className="h-5 w-16 bg-gray-800" />
      </div>
      <Skeleton className="h-6 w-full bg-gray-800" />
      <Skeleton className="h-4 w-full bg-gray-800" />
      <Skeleton className="h-4 w-3/4 bg-gray-800" />
    </div>
  );
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Newspaper className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold">News Feed</h1>
          <Badge variant="outline" className="text-gray-400 border-gray-700">
            {news.length} articles
          </Badge>
        </div>
        <Button
          variant="outline"
          className="border-gray-700 text-gray-300 hover:bg-gray-800"
          onClick={fetchNews}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <NewsCardSkeleton key={i} />
          ))}
        </div>
      ) : news.length === 0 ? (
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-12 text-center">
          <Newspaper className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">No news available</h3>
          <p className="text-sm text-gray-500">
            News articles will appear here as they are fetched from configured sources.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {news.map((article) => {
            const isBreaking = (article.importance || 0) >= 0.8;
            const sentiment = sentimentLabel(article.sentiment);

            return (
              <div
                key={article.id}
                className={`bg-gray-900/50 backdrop-blur-sm border rounded-xl p-4 space-y-3 transition-colors hover:bg-gray-900/70 ${
                  isBreaking ? 'border-red-500/50' : 'border-gray-800'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{article.source}</span>
                    {isBreaking && (
                      <span className="flex items-center gap-1 text-xs text-red-400 font-medium">
                        <AlertTriangle className="w-3 h-3" />
                        BREAKING
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className={sentimentBadgeClass[sentiment]}>
                    {sentiment.toUpperCase()}
                  </Badge>
                </div>

                {/* Title */}
                <h3 className="font-medium text-white leading-snug">{article.title}</h3>

                {/* Summary */}
                {article.summary && (
                  <p className="text-sm text-gray-400 line-clamp-2">{article.summary}</p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-gray-500">
                    {article.publishedAt
                      ? new Date(article.publishedAt).toLocaleDateString()
                      : 'Unknown date'}
                  </span>
                  {article.sourceUrl && (
                    <a
                      href={article.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      Read more
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
