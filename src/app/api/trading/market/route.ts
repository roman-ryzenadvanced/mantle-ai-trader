import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// ── Types ──

interface ExchangeVolume {
  exchange: string;
  symbol: string;
  volume24h: number;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  bidVolume: number;
  askVolume: number;
  timestamp: number;
}

interface AggregatedInstrument {
  symbol: string;
  displayName: string;
  exchanges: Record<string, {
    volume24h: number;
    price: number;
    change24h: number;
    high24h: number;
    low24h: number;
  }>;
  totalVolume24h: number;
  avgPrice: number;
  avgChange24h: number;
  sentiment: 'strongly_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strongly_bearish';
  sentimentScore: number; // -1 to +1
  volumeDominance: Record<string, number>; // % share per exchange
  priceRange24h: { high: number; low: number; percent: number };
}

const SYMBOLS = [
  { id: 'BTCUSDT', name: 'Bitcoin' },
  { id: 'ETHUSDT', name: 'Ethereum' },
  { id: 'SOLUSDT', name: 'Solana' },
  { id: 'BNBUSDT', name: 'BNB' },
  { id: 'XRPUSDT', name: 'XRP' },
  { id: 'DOGEUSDT', name: 'Dogecoin' },
  { id: 'ADAUSDT', name: 'Cardano' },
  { id: 'AVAXUSDT', name: 'Avalanche' },
  { id: 'DOTUSDT', name: 'Polkadot' },
  { id: 'LINKUSDT', name: 'Chainlink' },
];

// ── Exchange Fetchers ──

async function fetchBybitTickers(symbols: string[]): Promise<ExchangeVolume[]> {
  try {
    const results: ExchangeVolume[] = [];
    for (const symbol of symbols) {
      const res = await axios.get('https://api.bybit.com/v5/market/tickers', {
        params: { category: 'linear', symbol },
        timeout: 5000,
      });
      if (res.data?.retCode === 0 && res.data?.result?.list?.[0]) {
        const t = res.data.result.list[0];
        results.push({
          exchange: 'bybit',
          symbol,
          volume24h: parseFloat(t.volume24h) || 0,
          price: parseFloat(t.lastPrice) || 0,
          change24h: parseFloat(t.price24hPcnt) * 100 || 0,
          high24h: parseFloat(t.highPrice24h) || 0,
          low24h: parseFloat(t.lowPrice24h) || 0,
          bidVolume: parseFloat(t.bid1Size) || 0,
          askVolume: parseFloat(t.ask1Size) || 0,
          timestamp: Date.now(),
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function fetchBinanceTickers(symbols: string[]): Promise<ExchangeVolume[]> {
  try {
    const res = await axios.get('https://api.binance.com/api/v3/ticker/24hr', {
      params: { symbols: JSON.stringify(symbols) },
      timeout: 5000,
    });
    if (!Array.isArray(res.data)) return [];
    return res.data.map((t: Record<string, unknown>) => ({
      exchange: 'binance',
      symbol: t.symbol as string,
      volume24h: parseFloat(t.quoteVolume as string) || 0,
      price: parseFloat(t.lastPrice as string) || 0,
      change24h: parseFloat(t.priceChangePercent as string) || 0,
      high24h: parseFloat(t.highPrice as string) || 0,
      low24h: parseFloat(t.lowPrice as string) || 0,
      bidVolume: 0,
      askVolume: 0,
      timestamp: Date.now(),
    }));
  } catch {
    return [];
  }
}

async function fetchOKXTickers(symbols: string[]): Promise<ExchangeVolume[]> {
  try {
    // OKX uses instId format: BTC-USDT-SWAP
    const okxSymbols = symbols.map(s => s.replace('USDT', '-USDT-SWAP'));
    const results: ExchangeVolume[] = [];
    for (const instId of okxSymbols) {
      const res = await axios.get('https://www.okx.com/api/v5/market/ticker', {
        params: { instId },
        timeout: 5000,
      });
      if (res.data?.code === '0' && res.data?.data?.[0]) {
        const t = res.data.data[0];
        const symbol = instId.replace('-USDT-SWAP', 'USDT');
        const price = parseFloat(t.last) || 0;
        const open24h = parseFloat(t.open24h) || 0;
        const change24h = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;
        results.push({
          exchange: 'okx',
          symbol,
          volume24h: parseFloat(t.volCcy24h) || 0,
          price: price,
          change24h: change24h,
          high24h: parseFloat(t.high24h) || 0,
          low24h: parseFloat(t.low24h) || 0,
          bidVolume: 0,
          askVolume: 0,
          timestamp: Date.now(),
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function fetchGateIOTickers(symbols: string[]): Promise<ExchangeVolume[]> {
  try {
    const results: ExchangeVolume[] = [];
    for (const symbol of symbols) {
      const contractSymbol = symbol.replace('USDT', '_USDT');
      const res = await axios.get('https://api.gateio.ws/api/v4/futures/usdt/tickers', {
        params: { contract: contractSymbol },
        timeout: 5000,
      });
      if (res.data && !res.data.label) {
        const t = res.data;
        results.push({
          exchange: 'gateio',
          symbol,
          volume24h: parseFloat(t.volume_24h) || 0,
          price: parseFloat(t.last) || 0,
          change24h: parseFloat(t.change_percentage) || 0,
          high24h: parseFloat(t.high_24h) || 0,
          low24h: parseFloat(t.low_24h) || 0,
          bidVolume: 0,
          askVolume: 0,
          timestamp: Date.now(),
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function fetchBitgetTickers(symbols: string[]): Promise<ExchangeVolume[]> {
  try {
    const results: ExchangeVolume[] = [];
    for (const symbol of symbols) {
      const res = await axios.get('https://api.bitget.com/api/v2/mix/market/tickers', {
        params: { productType: 'USDT-FUTURES', symbol },
        timeout: 5000,
      });
      if (res.data?.code === '00000' && res.data?.data?.[0]) {
        const t = res.data.data[0];
        const price = parseFloat(t.lastPr) || 0;
        // Validate price is reasonable (skip if clearly wrong symbol mapping)
        if (price > 0 && symbol !== t.symbol) continue;
        results.push({
          exchange: 'bitget',
          symbol,
          volume24h: parseFloat(t.usdtVolume24h) || 0,
          price: price,
          change24h: parseFloat(t.changeRate24h) * 100 || 0,
          high24h: parseFloat(t.high24h) || 0,
          low24h: parseFloat(t.low24h) || 0,
          bidVolume: 0,
          askVolume: 0,
          timestamp: Date.now(),
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ── Aggregation ──

function computeSentiment(change24h: number, bidVolume: number, askVolume: number): { sentiment: AggregatedInstrument['sentiment']; score: number } {
  // Base sentiment from price change
  let score = 0;
  if (change24h > 5) score = 0.8;
  else if (change24h > 2) score = 0.5;
  else if (change24h > 0.5) score = 0.25;
  else if (change24h > -0.5) score = 0;
  else if (change24h > -2) score = -0.25;
  else if (change24h > -5) score = -0.5;
  else score = -0.8;

  // Adjust by bid/ask imbalance if available
  if (bidVolume > 0 || askVolume > 0) {
    const total = bidVolume + askVolume;
    if (total > 0) {
      const imbalance = (bidVolume - askVolume) / total; // +1 = all bids, -1 = all asks
      score = score * 0.7 + imbalance * 0.3;
    }
  }

  // Clamp
  score = Math.max(-1, Math.min(1, score));

  let sentiment: AggregatedInstrument['sentiment'];
  if (score > 0.5) sentiment = 'strongly_bullish';
  else if (score > 0.15) sentiment = 'bullish';
  else if (score > -0.15) sentiment = 'neutral';
  else if (score > -0.5) sentiment = 'bearish';
  else sentiment = 'strongly_bearish';

  return { sentiment, score };
}

function aggregateVolumes(allVolumes: ExchangeVolume[]): AggregatedInstrument[] {
  const symbolMap = new Map<string, ExchangeVolume[]>();
  for (const v of allVolumes) {
    const existing = symbolMap.get(v.symbol) || [];
    existing.push(v);
    symbolMap.set(v.symbol, existing);
  }

  const instruments: AggregatedInstrument[] = [];

  for (const [symbol, volumes] of symbolMap) {
    const symbolInfo = SYMBOLS.find(s => s.id === symbol);
    const displayName = symbolInfo?.name || symbol.replace('USDT', '');

    const exchanges: AggregatedInstrument['exchanges'] = {};
    let totalVolume = 0;
    let totalPrice = 0;
    let totalChange = 0;
    let priceCount = 0;
    let totalBidVol = 0;
    let totalAskVol = 0;
    let globalHigh = 0;
    let globalLow = Infinity;

    for (const v of volumes) {
      const vol = Number(v.volume24h) || 0;
      if (vol <= 0) continue; // Skip zero-volume entries
      exchanges[v.exchange] = {
        volume24h: v.volume24h,
        price: v.price,
        change24h: v.change24h,
        high24h: v.high24h,
        low24h: v.low24h,
      };
      totalVolume += vol;
      const price = Number(v.price) || 0;
      const change = Number(v.change24h) || 0;
      if (price > 0) {
        totalPrice += price;
        priceCount++;
      }
      totalChange += change;
      totalBidVol += v.bidVolume;
      totalAskVol += v.askVolume;
      if (v.high24h > globalHigh) globalHigh = v.high24h;
      if (v.low24h > 0 && v.low24h < globalLow) globalLow = v.low24h;
    }

    const avgPrice = priceCount > 0 ? totalPrice / priceCount : 0;
    const avgChange = volumes.length > 0 ? totalChange / volumes.length : 0;
    const rangePercent = globalLow > 0 && globalHigh > 0 ? ((globalHigh - globalLow) / globalLow) * 100 : 0;

    // Volume dominance per exchange
    const volumeDominance: Record<string, number> = {};
    for (const v of volumes) {
      volumeDominance[v.exchange] = totalVolume > 0 ? (v.volume24h / totalVolume) * 100 : 0;
    }

    const { sentiment, score } = computeSentiment(avgChange, totalBidVol, totalAskVol);

    instruments.push({
      symbol,
      displayName,
      exchanges,
      totalVolume24h: totalVolume,
      avgPrice,
      avgChange24h: avgChange,
      sentiment,
      sentimentScore: score,
      volumeDominance,
      priceRange24h: {
        high: globalHigh,
        low: globalLow > 0 ? globalLow : 0,
        percent: rangePercent,
      },
    });
  }

  // Sort by total volume descending
  return instruments.sort((a, b) => b.totalVolume24h - a.totalVolume24h);
}

// ── Route Handler ──

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'volume';

  if (action === 'volume') {
    const symbols = SYMBOLS.map(s => s.id);

    // Fetch from all exchanges in parallel
    const [bybit, binance, okx, gateio, bitget] = await Promise.all([
      fetchBybitTickers(symbols),
      fetchBinanceTickers(symbols),
      fetchOKXTickers(symbols),
      fetchGateIOTickers(symbols),
      fetchBitgetTickers(symbols),
    ]);

    const allVolumes = [...bybit, ...binance, ...okx, ...gateio, ...bitget];
    const instruments = aggregateVolumes(allVolumes);

    // Add symbols that had no data (with zeros)
    for (const s of SYMBOLS) {
      if (!instruments.find(i => i.symbol === s.id)) {
        instruments.push({
          symbol: s.id,
          displayName: s.name,
          exchanges: {},
          totalVolume24h: 0,
          avgPrice: 0,
          avgChange24h: 0,
          sentiment: 'neutral',
          sentimentScore: 0,
          volumeDominance: {},
          priceRange24h: { high: 0, low: 0, percent: 0 },
        });
      }
    }

    // Sort by original SYMBOLS order
    instruments.sort((a, b) => {
      const ai = SYMBOLS.findIndex(s => s.id === a.symbol);
      const bi = SYMBOLS.findIndex(s => s.id === b.symbol);
      return ai - bi;
    });

    // Market-wide stats
    const totalMarketVolume = instruments.reduce((sum, i) => sum + (Number(i.totalVolume24h) || 0), 0);
    const bullishCount = instruments.filter(i => i.sentiment === 'bullish' || i.sentiment === 'strongly_bullish').length;
    const bearishCount = instruments.filter(i => i.sentiment === 'bearish' || i.sentiment === 'strongly_bearish').length;

    return NextResponse.json({
      success: true,
      data: {
        instruments,
        summary: {
          totalMarketVolume,
          instrumentsTracked: instruments.length,
          bullishCount,
          bearishCount,
          neutralCount: instruments.length - bullishCount - bearishCount,
          overallSentiment: bullishCount > bearishCount
            ? bullishCount > bearishCount * 2 ? 'strongly_bullish' : 'bullish'
            : bearishCount > bullishCount * 2 ? 'strongly_bearish' : 'bearish',
          exchangesResponding: [...new Set(allVolumes.map(v => v.exchange))].length,
          timestamp: Date.now(),
        },
      },
    });
  }

  return NextResponse.json({ success: false, error: 'Unknown action' });
}
