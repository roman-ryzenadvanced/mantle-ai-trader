/**
 * GitHub Activity API Route
 * GET /api/trading/github-activity — analyze tracked crypto repos
 * GET /api/trading/github-activity?repo=owner/repo — analyze single repo
 * GET /api/trading/github-activity?endpoint=intelligence — market intelligence summary
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  analyzeRepo,
  analyzeRepos,
  computeMarketIntelligence,
  DEFAULT_CRYPTO_REPOS,
} from '@/lib/trading/github-activity';

const singleRepoSchema = z.object({
  repo: z.string().min(1, 'repo is required'),
});

const reposSchema = z.object({
  repos: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');

    // Single repo analysis
    const repoParam = searchParams.get('repo');
    if (repoParam) {
      const validation = singleRepoSchema.safeParse({ repo: repoParam });
      if (!validation.success) {
        return NextResponse.json(
          { success: false, error: 'Invalid repo parameter' },
          { status: 400 },
        );
      }
      const summary = await analyzeRepo(validation.data.repo);
      return NextResponse.json({ success: true, data: summary });
    }

    // Market intelligence summary
    if (endpoint === 'intelligence') {
      const reposParam = searchParams.get('repos');
      const repos = reposParam
        ? reposParam.split(',').filter(Boolean)
        : DEFAULT_CRYPTO_REPOS.slice(0, 5); // analyze top 5 for speed

      const summaries = await analyzeRepos(repos, 3);
      const intelligence = await computeMarketIntelligence(summaries);

      return NextResponse.json({
        success: true,
        data: {
          intelligence,
          summaries,
        },
      });
    }

    // Default: analyze all tracked repos
    const reposParam = searchParams.get('repos');
    const repos = reposParam
      ? reposParam.split(',').filter(Boolean)
      : DEFAULT_CRYPTO_REPOS;

    // Analyze up to 10 repos to stay within rate limits
    const targetRepos = repos.slice(0, 10);
    const summaries = await analyzeRepos(targetRepos, 3);
    const intelligence = await computeMarketIntelligence(summaries);

    return NextResponse.json({
      success: true,
      data: {
        summaries,
        intelligence,
      },
    });
  } catch (error) {
    console.error('GitHub activity error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch GitHub activity';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
