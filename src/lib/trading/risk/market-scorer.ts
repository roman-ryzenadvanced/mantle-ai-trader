/**
 * Market Opportunity Scorer
 *
 * Scores markets based on volume, liquidity, and bid-ask spread to identify
 * the best trading opportunities. Pure functions only — no framework dependency.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarketScore {
  symbol: string;
  score: number;          // 0-100 composite score
  volumeScore: number;    // 0-100
  liquidityScore: number; // 0-100
  spreadScore: number;    // 0-100
  rank: number;
}

export interface MarketScorerConfig {
  minVolume: number;    // default 1_000_000 ($1M)
  minLiquidity: number; // default 500_000 ($500K)
  maxSpread: number;    // default 0.005 (0.5%)
}

export interface MarketInput {
  symbol: string;
  volume24h: number;
  liquidity: number;
  bidAskSpread: number;
  price: number;
  priceChange24h: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function getDefaultScorerConfig(): MarketScorerConfig {
  return {
    minVolume: 1_000_000,
    minLiquidity: 500_000,
    maxSpread: 0.005,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Scores an array of markets, filters unqualified ones, and returns
 * results sorted by composite score descending with rank assigned.
 */
export function scoreMarkets(
  markets: MarketInput[],
  config?: MarketScorerConfig,
): MarketScore[] {
  const cfg = config ?? getDefaultScorerConfig();

  // Filter out markets that don't meet minimum thresholds
  const qualified = markets.filter((m) => {
    if (m.volume24h < cfg.minVolume) return false;
    if (m.liquidity < cfg.minLiquidity) return false;
    if (m.bidAskSpread > cfg.maxSpread) return false;
    return true;
  });

  // Score each qualified market
  const scored: MarketScore[] = qualified.map((m) => {
    const volumeScore = Math.min(
      (m.volume24h / (cfg.minVolume * 10)) * 100,
      100,
    );

    const liquidityScore = Math.min(
      (m.liquidity / (cfg.minLiquidity * 10)) * 100,
      100,
    );

    const spreadScore = Math.max(
      0,
      100 - (m.bidAskSpread / cfg.maxSpread) * 100,
    );

    const score = volumeScore * 0.4 + liquidityScore * 0.3 + spreadScore * 0.3;

    return {
      symbol: m.symbol,
      score,
      volumeScore,
      liquidityScore,
      spreadScore,
      rank: 0, // assigned after sorting
    };
  });

  // Sort by composite score descending
  scored.sort((a, b) => b.score - a.score);

  // Assign ranks
  scored.forEach((s, i) => {
    s.rank = i + 1;
  });

  return scored;
}
