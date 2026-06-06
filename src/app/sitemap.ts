import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://github.com/roman-ryzenadvanced/mantle-ai-trader'
  
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
      title: 'Mantle AI Trader - AI-Powered Crypto Trading Bot',
      description: 'Advanced AI trading bot for cryptocurrency markets with news sentiment analysis, technical indicators, backtesting, and paper trading.',
      images: ['/og-image.png'],
    },
    {
      url: `${baseUrl}#features`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
      title: 'Features - AI Signal Generation & Trading',
    },
    {
      url: `${baseUrl}#installation`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
      title: 'Installation Guide',
    },
    {
      url: `${baseUrl}#api`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
      title: 'API Documentation',
    },
    {
      url: `${baseUrl}#backtesting`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
      title: 'Backtesting Engine',
    },
    {
      url: `${baseUrl}#demo-trading`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
      title: 'Demo Paper Trading',
    },
    {
      url: `${baseUrl}#news`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
      title: 'News Aggregation & Sentiment',
    },
  ]
}
