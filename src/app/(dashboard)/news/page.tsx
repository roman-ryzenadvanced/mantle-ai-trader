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
  positive: 'bg-green-500/15 text-green-600 border-green-500/30',
  negative: 'bg-red-500/15 text-red-600 border-red-500/30',
  neutral: 'bg-muted text-muted-foreground border-border',
};

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
          <Newspaper className="w-7 h-7 text-blue-600" />
          <h1 className="text-2xl font-bold">News Feed</h1>
          <Badge variant="outline" className="text-muted-foreground">
            {news.length} articles
          </Badge>
        </div>
        <Button
          variant="outline"
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

            return (
              <div
                key={article.id}
                className={`bg-card border rounded-xl p-4 space-y-3 transition-colors hover:bg-accent/50 ${
                  isBreaking ? 'border-red-500/50' : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{article.source}</span>
                    {isBreaking && (
                      <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                        <AlertTriangle className="w-3 h-3" />
                        BREAKING
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className={sentimentBadgeClass[sentiment]}>
                    {sentiment.toUpperCase()}
                  </Badge>
                </div>

                <h3 className="font-medium text-foreground leading-snug">{article.title}</h3>

                {article.summary && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{article.summary}</p>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    {article.publishedAt
                      ? new Date(article.publishedAt).toLocaleDateString()
                      : 'Unknown date'}
                  </span>
                  {article.sourceUrl && (
                    <a
                      href={article.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
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
