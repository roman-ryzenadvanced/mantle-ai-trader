'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Target,
  RefreshCw,
  Zap,
  Play,
  Pause,
  Radar,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  Activity,
  BarChart3,
  Brain,
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Timer,
  LineChart,
  ArrowDownRight,
  ArrowUpRight,
  Loader2,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── TypeScript Interfaces ────────────────────────────────────────────────

interface Indicator {
  name: string;
  value: number;
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  note?: string;
}

interface TechnicalAnalysis {
  trend?: string;
  trendStrength?: number;
  supportLevels?: number[];
  resistanceLevels?: number[];
  indicators?: Indicator[];
  patterns?: string[];
  score?: number;
}

interface FundamentalAnalysis {
  newsImpact?: string;
  marketEvents?: string[];
  economicFactors?: string[];
  score?: number;
}

interface SentimentAnalysis {
  overallSentiment?: number;
  sentimentLabel?: string;
  newsSentiment?: number;
  socialSentiment?: number;
  keyFactors?: string[];
  warnings?: string[];
}

interface RiskAssessment {
  riskScore?: number;
  riskLevel?: string;
  maxRecommendedPosition?: number;
  riskFactors?: string[];
  marketVolatility?: number;
  liquidityRisk?: number;
}

interface SignalDetails {
  currentPrice?: number;
  entryZone?: { low: number; high: number; strategy: 'LIMIT' | 'MARKET'; description: string };
  takeProfitLevels?: Array<{ level: number; price: number; percentFromEntry: number; positionPercent: number; description: string }>;
  stopLoss?: { price: number; percentFromEntry: number; reasoning: string; type: 'HARD' | 'TRAILING' };
  riskRewardRatio?: number;
  leverage?: { min: number; max: number; recommended: number; reasoning: string };
  timeHorizon?: 'SCALP' | 'SWING' | 'POSITION';
  volatility?: { value: number; label: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME'; atrPercent: number };
  marketContext?: string;
  priceActionNotes?: string[];
  fundamentalCatalysts?: string[];
  keyLevels?: { supports: number[]; resistances: number[]; nearestSupport: number; nearestResistance: number };
  indicatorSummary?: Indicator[];
  patternAnalysis?: { detected: string[]; reliability: 'LOW' | 'MEDIUM' | 'HIGH'; summary: string };
}

interface Analysis {
  technicalAnalysis?: TechnicalAnalysis;
  fundamentalAnalysis?: FundamentalAnalysis;
  sentimentAnalysis?: SentimentAnalysis;
}

// Technical scan result shape (from engine.scanPairs)
interface TechnicalScanResult {
  signal?: {
    symbol: string;
    action: string;
    confidence: number;
    reasoning: string;
    priceTarget?: number;
    stopLoss?: number;
    details?: SignalDetails;
  };
  analysis?: Analysis;
  riskAssessment?: RiskAssessment;
  signalDetails?: SignalDetails;
  strategyName?: string;
  signalType?: string;
  scannedAt?: string;
}

// News-based signal shape (from engine.generateNewsSignals)
interface NewsScanResult {
  symbol: string;
  action: string;
  confidence: number;
  reasoning: string;
  sourceArticle?: string;
  sentimentShift?: number;
  importance?: number;
  strategyName: string;       // 'NEWS'
  signalType: string;
  generatedAt?: string;
  indicators?: {
    newsSentiment?: number;
    articleCount?: number;
    highImpactCount?: number;
    topicKeywords?: string[];
  };
}

type ScanResultData = TechnicalScanResult | NewsScanResult;

// Type guard: detect if a scan result is a news signal
function isNewsResult(r: ScanResultData): r is NewsScanResult {
  return 'symbol' in r && typeof (r as NewsScanResult).symbol === 'string' &&
    !('signal' in r) && !(r as TechnicalScanResult).signal;
}

interface Signal {
  id: string;
  symbol: string;
  action: string;
  confidence: number;
  rating?: string;
  priceTarget?: number;
  stopLoss?: number;
  takeProfit?: number;
  reasoning: string;
  newsSources?: string[];
  sentimentScore?: number;
  technicalScore?: number;
  fundamentalScore?: number;
  status: string;
  executedAt?: string;
  executedPrice?: number;
  result?: string;
  resultPnL?: number;
  demo?: boolean;
  createdAt: string;
  updatedAt: string;
  // Enriched from scan results
  scanData?: ScanResultData;
}

type ScanMode = 'auto' | 'on-demand';
type StatusFilter = 'ALL' | 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED';
type ActionFilter = 'ALL' | 'BUY' | 'SELL' | 'HOLD';
type IntervalOption = '30' | '60' | '120' | '300';

// ─── Constants ───────────────────────────────────────────────────────────

const AVAILABLE_SYMBOLS: { value: string; label: string }[] = [
  { value: 'BTCUSDT', label: 'BTC' },
  { value: 'ETHUSDT', label: 'ETH' },
  { value: 'SOLUSDT', label: 'SOL' },
  { value: 'BNBUSDT', label: 'BNB' },
  { value: 'XRPUSDT', label: 'XRP' },
  { value: 'ADAUSDT', label: 'ADA' },
  { value: 'DOGEUSDT', label: 'DOGE' },
  { value: 'AVAXUSDT', label: 'AVAX' },
  { value: 'DOTUSDT', label: 'DOT' },
];

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
const SCAN_STRATEGIES = ['DEFAULT', 'MOMENTUM', 'BREAKOUT', 'MEAN_REVERSION', 'VWAP_TWAP'];
const SCAN_TIMEFRAME = '1h';

const ACTION_COLORS: Record<string, string> = {
  BUY: 'bg-green-500/15 text-green-600 border-green-500/30',
  SELL: 'bg-red-500/15 text-red-600 border-red-500/30',
  HOLD: 'bg-muted text-muted-foreground border-border',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  EXECUTED: 'bg-green-500/15 text-green-600 border-green-500/30',
  CANCELLED: 'bg-gray-500/15 text-gray-500 border-gray-500/30',
  EXPIRED: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  PENDING: Timer,
  EXECUTED: CheckCircle2,
  CANCELLED: Minus,
  EXPIRED: Clock,
};

// ─── Helper Functions ────────────────────────────────────────────────────

function confidenceBarColor(value: number): { bg: string; track: string; text: string } {
  if (value > 70) return { bg: 'bg-green-500', track: 'bg-green-500/20', text: 'text-green-600' };
  if (value >= 40) return { bg: 'bg-yellow-500', track: 'bg-yellow-500/20', text: 'text-yellow-600' };
  return { bg: 'bg-red-500', track: 'bg-red-500/20', text: 'text-red-600' };
}

function formatPrice(val: number | undefined): string {
  if (val == null) return '—';
  if (val < 0.01) return `$${val.toFixed(6)}`;
  if (val < 1) return `$${val.toFixed(4)}`;
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function indicatorDotColor(signal: string): string {
  switch (signal) {
    case 'BULLISH':
    case 'bullish': return 'bg-green-500';
    case 'BEARISH':
    case 'bearish': return 'bg-red-500';
    default: return 'bg-gray-400';
  }
}

function volatilityColor(vol: { label?: string } | undefined): string {
  switch (vol?.label) {
    case 'LOW': return 'text-green-600';
    case 'MODERATE': return 'text-yellow-600';
    case 'HIGH': return 'text-orange-600';
    case 'EXTREME': return 'text-red-600';
    default: return 'text-muted-foreground';
  }
}

function timeHorizonLabel(horizon: string | undefined): string {
  switch (horizon) {
    case 'SCALP': return 'Scalp';
    case 'SWING': return 'Swing';
    case 'POSITION': return 'Position';
    default: return horizon || '—';
  }
}

function unwrapResponse<T>(data: { success?: boolean; data?: T }): T | undefined {
  return data.data ?? (data as unknown as T);
}

// ─── Skeleton Components ─────────────────────────────────────────────────

function SignalCardSkeleton() {
  return (
    <Card className="bg-card border border-border rounded-xl overflow-hidden">
      <CardContent className="p-4 space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-14 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
        {/* Confidence bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-8" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        {/* Price targets */}
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
        {/* Score bars */}
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          ))}
        </div>
        {/* Reasoning text */}
        <Skeleton className="h-10 w-full" />
        {/* Key metrics */}
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-6 w-20 rounded-full" />
          ))}
        </div>
        {/* Footer */}
        <Separator />
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatsBarSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap gap-6 items-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className={`h-8 ${i === 0 ? 'w-32' : 'w-20'} rounded`} />
      ))}
    </div>
  );
}

// ─── Signal Dot (for indicator table) ─────────────────────────────────────

function SignalDot({ signal }: { signal: string }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${indicatorDotColor(signal)}`}
      title={signal}
    />
  );
}

// ─── Mini Score Bar ───────────────────────────────────────────────────────

function MiniScoreBar({ label, value, color }: { label: string; value?: number; color?: string }) {
  if (value == null || value === 0) return null;
  const pct = Math.min(Math.max(value, 0), 100);
  const barColor = color || confidenceBarColor(value).bg;
  return (
    <div className="space-y-0.5 min-w-0">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="ml-1 shrink-0 font-medium text-foreground">{Math.round(pct)}</span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Signal Card Component ────────────────────────────────────────────────

function SignalCard({
  signal,
  onExecute,
}: {
  signal: Signal;
  onExecute: (signalId: string, symbol: string, action: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const scanData = signal.scanData as TechnicalScanResult | undefined;
  const details = scanData?.signalDetails;
  const analysis = scanData?.analysis;
  const risk = scanData?.riskAssessment;
  const actionColor = ACTION_COLORS[signal.action] || ACTION_COLORS.HOLD;
  const statusColor = STATUS_COLORS[signal.status] || '';
  const StatusIcon = STATUS_ICONS[signal.status] || Timer;
  const confColors = confidenceBarColor(signal.confidence);

  // Determine which icon to show for the action badge
  const ActionIcon =
    signal.action === 'BUY'
      ? TrendingUp
      : signal.action === 'SELL'
        ? TrendingDown
        : Minus;

  return (
    <Card className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-sm transition-shadow flex flex-col">
      <CardContent className="p-4 space-y-4 flex-1 flex flex-col">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-base text-foreground truncate">
              {signal.symbol.replace('USDT', '')}
            </span>
            <span className="text-xs text-muted-foreground font-mono shrink-0">
              /USDT
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className={`${actionColor} text-[11px] font-semibold px-2 py-0`}>
              <ActionIcon className="w-3 h-3 mr-1" />
              {signal.action}
            </Badge>
            <Badge variant="outline" className={`${statusColor} text-[10px] px-1.5 py-0`}>
              <StatusIcon className="w-3 h-3 mr-0.5 inline" />
              {signal.status}
            </Badge>
          </div>
        </div>

        {/* ── Confidence Bar ──────────────────────────────────────── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Confidence</span>
            <span className={`font-bold ${confColors.text}`}>
              {Math.round(signal.confidence)}%
            </span>
          </div>
          <div className={`h-2.5 w-full rounded-full ${confColors.track}`}>
            <div
              className={`h-full rounded-full transition-all duration-500 ${confColors.bg}`}
              style={{ width: `${Math.min(signal.confidence, 100)}%` }}
            />
          </div>
        </div>

        {/* ── Price Targets ───────────────────────────────────────── */}
        {(signal.priceTarget || signal.stopLoss || signal.takeProfit) && (
          <div className="grid grid-cols-3 gap-2">
            {signal.priceTarget != null && (
              <div className="bg-muted/50 rounded-lg p-2 text-center space-y-0.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Target</p>
                <p className="text-xs font-bold text-green-600">{formatPrice(signal.priceTarget)}</p>
              </div>
            )}
            {signal.stopLoss != null && (
              <div className="bg-muted/50 rounded-lg p-2 text-center space-y-0.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Stop Loss</p>
                <p className="text-xs font-bold text-red-500">{formatPrice(signal.stopLoss)}</p>
              </div>
            )}
            {signal.takeProfit != null && (
              <div className="bg-muted/50 rounded-lg p-2 text-center space-y-0.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Take Profit</p>
                <p className="text-xs font-bold text-blue-600">{formatPrice(signal.takeProfit)}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Score Bars ──────────────────────────────────────────── */}
        {(signal.technicalScore || signal.fundamentalScore || signal.sentimentScore || signal.rating) && (
          <div className="grid grid-cols-4 gap-x-3 gap-y-1">
            <MiniScoreBar
              label="Technical"
              value={signal.technicalScore ?? analysis?.technicalAnalysis?.score}
            />
            <MiniScoreBar
              label="Fundamental"
              value={signal.fundamentalScore ?? analysis?.fundamentalAnalysis?.score}
            />
            <MiniScoreBar
              label="Sentiment"
              value={signal.sentimentScore ?? analysis?.sentimentAnalysis?.overallSentiment}
            />
            {signal.rating && (
              <div className="space-y-0.5">
                <div className="text-[10px] text-muted-foreground truncate">Quality</div>
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  {signal.rating}
                </Badge>
              </div>
            )}
          </div>
        )}

        {/* ── Reasoning ───────────────────────────────────────────── */}
        {signal.reasoning && (
          <p
            className={`text-sm text-muted-foreground leading-relaxed ${
              expanded ? '' : 'line-clamp-3'
            }`}
          >
            {signal.reasoning}
          </p>
        )}

        {/* ── Key Metrics Row ─────────────────────────────────────── */}
        {details && (
          <div className="flex flex-wrap gap-1.5">
            {details.riskRewardRatio && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                <Shield className="w-3 h-3" />
                R:R {details.riskRewardRatio}
              </Badge>
            )}
            {details.timeHorizon && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                <Clock className="w-3 h-3" />
                {timeHorizonLabel(details.timeHorizon)}
              </Badge>
            )}
            {details.volatility && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-0.5 ${volatilityColor(details.volatility)}`}>
                <Activity className="w-3 h-3" />
                {details.volatility.label}
              </Badge>
            )}
            {details.leverage != null && details.leverage.recommended > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                <Zap className="w-3 h-3" />
                {details.leverage.recommended}x Lev
              </Badge>
            )}
          </div>
        )}

        {/* ── Expandable Details Section ───────────────────────────── */}
        {(analysis || details || risk) && (
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors">
              {expanded ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5 rotate-180" /> Hide Details
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" /> Show Details
                </>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="border-t border-border pt-3 space-y-3">
                {/* Indicator Summary Table */}
                {details?.indicatorSummary && details.indicatorSummary.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <LineChart className="w-3.5 h-3.5 text-blue-500" />
                      Indicators
                    </h4>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="bg-muted/60">
                            <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Indicator</th>
                            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Value</th>
                            <th className="text-center py-1.5 px-2 font-medium text-muted-foreground">Signal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.indicatorSummary.map((ind, idx) => (
                            <tr key={idx} className="border-t border-border/50 hover:bg-accent/30">
                              <td className="py-1 px-2 text-foreground font-medium">{ind.name}</td>
                              <td className="py-1 px-2 text-right font-mono text-muted-foreground">{typeof ind.value === 'number' ? ind.value.toFixed(2) : ind.value}</td>
                              <td className="py-1 px-2 text-center">
                                <SignalDot signal={ind.signal} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Candlestick Patterns */}
                {details?.patternAnalysis && details.patternAnalysis.detected && details.patternAnalysis.detected.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5 text-purple-500" />
                      Patterns Detected
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {details.patternAnalysis.detected.map((pattern, idx) => (
                        <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0">
                          {pattern}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Support & Resistance Levels */}
                {(details?.keyLevels || analysis?.technicalAnalysis?.supportLevels || analysis?.technicalAnalysis?.resistanceLevels) && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-orange-500" />
                      Key Levels
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {analysis?.technicalAnalysis?.supportLevels && analysis.technicalAnalysis.supportLevels.length > 0 && (
                        <div className="rounded-md bg-green-500/10 border border-green-500/20 p-2 space-y-0.5">
                          <span className="text-green-600 font-medium text-[10px] uppercase tracking-wider">Support</span>
                          {analysis.technicalAnalysis.supportLevels.map((lvl, i) => (
                            <p key={i} className="text-green-700 dark:text-green-400 font-mono">{formatPrice(lvl)}</p>
                          ))}
                        </div>
                      )}
                      {analysis?.technicalAnalysis?.resistanceLevels && analysis.technicalAnalysis.resistanceLevels.length > 0 && (
                        <div className="rounded-md bg-red-500/10 border border-red-500/20 p-2 space-y-0.5">
                          <span className="text-red-600 font-medium text-[10px] uppercase tracking-wider">Resistance</span>
                          {analysis.technicalAnalysis.resistanceLevels.map((lvl, i) => (
                            <p key={i} className="text-red-700 dark:text-red-400 font-mono">{formatPrice(lvl)}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Risk Assessment */}
                {risk && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                      Risk Assessment
                    </h4>
                    <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/15 p-2.5 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Risk Level</span>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {risk.riskLevel || 'Unknown'}
                        </Badge>
                      </div>
                      {risk.riskScore != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Risk Score</span>
                          <span className="font-medium text-foreground">{risk.riskScore}/100</span>
                        </div>
                      )}
                      {risk.marketVolatility != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Volatility</span>
                          <span className={`font-medium ${risk.marketVolatility > 70 ? 'text-red-600' : risk.marketVolatility > 40 ? 'text-yellow-600' : 'text-green-600'}`}>{risk.marketVolatility.toFixed(1)}%</span>
                        </div>
                      )}
                      {risk.riskFactors && risk.riskFactors.length > 0 && (
                        <ul className="list-disc list-inside text-muted-foreground space-y-0.5 mt-1">
                          {risk.riskFactors.slice(0, 4).map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {/* Market Context */}
                {details?.marketContext && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5 text-indigo-500" />
                      Market Context
                    </h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed rounded-md bg-muted/40 p-2">
                      {details.marketContext}
                    </p>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Spacer to push footer down */}
        <div className="flex-1" />

        {/* ── Footer ────────────────────────────────────────────────── */}
        <Separator />
        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-muted-foreground">
            {formatDateTime(signal.createdAt)}
          </span>
          {signal.status === 'PENDING' && (
            <Button
              size="sm"
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium gap-1"
              onClick={() => onExecute(signal.id, signal.symbol, signal.action)}
            >
              <Play className="w-3 h-3" />
              Execute
            </Button>
          )}
          {signal.status === 'EXECUTED' && signal.executedPrice != null && (
            <span className="text-[11px] text-muted-foreground">
              @ {formatPrice(signal.executedPrice)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Execute Trade Dialog ─────────────────────────────────────────────────

function ExecuteDialog({
  open,
  onOpenChange,
  signal,
  onExecute,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signal: Signal | null;
  onExecute: (params: {
    symbol: string;
    action: string;
    quantity: number;
    leverage: number;
    stopLoss?: number;
    takeProfit?: number;
  }) => void;
}) {
  const [quantity, setQuantity] = useState(0.01);
  const [leverage, setLeverage] = useState(5);
  const [stopLossPct, setStopLossPct] = useState(2);
  const [takeProfitPct, setTakeProfitPct] = useState(5);

  if (!signal) return null;

  // Derive approximate current price from signal data
  const approxPrice = signal.priceTarget
    ? signal.priceTarget / (1 + takeProfitPct / 100)
    : signal.stopLoss
      ? signal.stopLoss / (1 - stopLossPct / 100)
      : 0; // will show placeholder

  const estSL = approxPrice ? parseFloat((approxPrice * (1 - stopLossPct / 100)).toFixed(2)) : undefined;
  const estTP = approxPrice ? parseFloat((approxPrice * (1 + takeProfitPct / 100)).toFixed(2)) : undefined;
  const estNotional = approxPrice ? parseFloat((approxPrice * quantity * leverage).toFixed(2)) : 0;

  const handleSubmit = () => {
    onExecute({
      symbol: signal.symbol,
      action: signal.action === 'BUY' || signal.action === 'SELL' ? signal.action : 'BUY',
      quantity,
      leverage,
      stopLoss: estSL,
      takeProfit: estTP,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {signal.action === 'BUY' ? (
              <TrendingUp className="w-5 h-5 text-green-500" />
            ) : signal.action === 'SELL' ? (
              <TrendingDown className="w-5 h-5 text-red-500" />
            ) : (
              <Target className="w-5 h-5 text-muted-foreground" />
            )}
            Execute Trade
          </DialogTitle>
          <DialogDescription>
            Place a {signal.action} order for{' '}
            <span className="font-semibold text-foreground">{signal.symbol.replace('USDT', '')}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Signal info summary */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Signal</span>
              <span className="font-medium text-foreground">
                {signal.action} &middot; {Math.round(signal.confidence)}% confidence
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Reasoning</span>
              <span className="font-medium text-foreground text-right max-w-[200px] truncate">
                {signal.reasoning.slice(0, 60)}
                {signal.reasoning.length > 60 ? '...' : ''}
              </span>
            </div>
            {signal.priceTarget && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Price Target</span>
                <span className="font-medium text-green-600">{formatPrice(signal.priceTarget)}</span>
              </div>
            )}
            {signal.stopLoss && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Suggested SL</span>
                <span className="font-medium text-red-500">{formatPrice(signal.stopLoss)}</span>
              </div>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <Label htmlFor="exec-quantity" className="text-xs font-medium text-muted-foreground">
              Quantity
            </Label>
            <Input
              id="exec-quantity"
              type="number"
              min={0.0001}
              step={0.001}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0.0001, parseFloat(e.target.value) || 0))}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* Leverage slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">Leverage</Label>
              <span className="text-sm font-bold text-foreground">{leverage}x</span>
            </div>
            <Slider
              value={[leverage]}
              onValueChange={([v]) => setLeverage(v)}
              min={1}
              max={100}
              step={1}
              className="py-1"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1x</span>
              <span>25x</span>
              <span>50x</span>
              <span>75x</span>
              <span>100x</span>
            </div>
          </div>

          {/* Stop Loss % */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">Stop Loss</Label>
              <span className="text-sm font-bold text-red-500">{stopLossPct}%{estSL != null ? ` (${formatPrice(estSL)})` : ''}</span>
            </div>
            <Slider
              value={[stopLossPct]}
              onValueChange={([v]) => setStopLossPct(v)}
              min={0.1}
              max={20}
              step={0.1}
              className="py-1"
            />
          </div>

          {/* Take Profit % */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">Take Profit</Label>
              <span className="text-sm font-bold text-green-600">{takeProfitPct}%{estTP != null ? ` (${formatPrice(estTP)})` : ''}</span>
            </div>
            <Slider
              value={[takeProfitPct]}
              onValueChange={([v]) => setTakeProfitPct(v)}
              min={0.5}
              max={50}
              step={0.5}
              className="py-1"
            />
          </div>

          {/* Estimated notional */}
          {approxPrice > 0 && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2.5 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Est. Notional ({leverage}x)</span>
              <span className="text-sm font-bold text-blue-600">${estNotional.toLocaleString()}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
            <Zap className="w-4 h-4" />
            Place {signal.action} Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────

export default function SignalsPage() {
  // ── State ─────────────────────────────────────────────────────
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('on-demand');
  const [scanInterval, setScanInterval] = useState<IntervalOption>('60');
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL');
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);

  // ── Execute Dialog state ─────────────────────────────────────
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [selectedSignalForExecution, setSelectedSignalForExecution] = useState<Signal | null>(null);

  // Refs for auto-scan interval management
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAutoRef = useRef(false);
  // Stable ref for handleScan so useEffect doesn't re-fire on every scan state change
  const handleScanRef = useRef<(() => Promise<void>) | null>(null);
  // Ref for scanning guard (avoids stale closure issues in auto-scan loop)
  const scanningRef = useRef(false);

  // ── Computed Stats ────────────────────────────────────────────
  const filteredSignals = signals.filter((s) => {
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (actionFilter !== 'ALL' && s.action !== actionFilter) return false;
    return true;
  });

  const totalSignals = filteredSignals.length;
  const buyCount = filteredSignals.filter((s) => s.action === 'BUY').length;
  const sellCount = filteredSignals.filter((s) => s.action === 'SELL').length;
  const holdCount = filteredSignals.filter((s) => s.action === 'HOLD').length;
  const avgConfidence =
    totalSignals > 0
      ? filteredSignals.reduce((sum, s) => sum + s.confidence, 0) / totalSignals
      : 0;

  // ── Fetch existing signals from DB ─────────────────────────────
  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/signals');
      if (res.ok) {
        const data = await res.json();
        // Only accept actual arrays — guard against error objects being truthy
        if (data.success === false || !Array.isArray(data.data)) return;
        const payload = data.data as Signal[];
        if (payload.length > 0) setSignals(payload);
      }
    } catch {
      // Silently fail on network/auth errors — don't wipe existing state
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Scan (trigger scan API + refresh) ─────────────────────────
  const handleScan = useCallback(async () => {
    // Use ref to check scanning state (avoids stale closure + prevents re-render loop)
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    try {
      const res = await fetch('/api/trading/signals/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: selectedSymbols,
          strategies: SCAN_STRATEGIES,
          timeframe: SCAN_TIMEFRAME,
        }),
      });

      if (!res.ok) throw new Error('Scan request failed');

      const data = await res.json();
      const rawResults = unwrapResponse<ScanResultData[]>(data);

      if (rawResults && Array.isArray(rawResults)) {
        // Map EACH result (technical OR news) into a proper Signal object
        const newSignals: Signal[] = rawResults.map((result) => {
          if (isNewsResult(result)) {
            // ── News-based signal (flat shape) ─────────────────
            return {
              id: crypto.randomUUID(),
              symbol: result.symbol,
              action: result.action === 'BUY' || result.action === 'SELL' ? result.action : 'HOLD',
              confidence: result.confidence ?? 50,
              reasoning: result.reasoning || 'News-based signal',
              newsSources: result.sourceArticle ? [result.sourceArticle] : undefined,
              sentimentScore: result.indicators?.newsSentiment,
              status: 'PENDING',
              createdAt: result.generatedAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              rating: result.confidence > 75 ? 'A' : result.confidence > 50 ? 'B' : 'C',
            } as Signal;
          }

          // ── Technical scan result (nested shape) ─────────────
          const techResult = result as TechnicalScanResult;
          const sig = techResult.signal;
          const details = techResult.signalDetails;
          const notes = details?.priceActionNotes;

          return {
            id: crypto.randomUUID(),
            symbol: sig?.symbol || techResult.strategyName || 'UNKNOWN',
            action: sig?.action || techResult.signalType || 'HOLD',
            confidence: sig?.confidence ?? 50,
            reasoning:
              details?.marketContext ||
              (Array.isArray(notes) ? notes.join('. ') : notes) ||
              sig?.reasoning ||
              `${techResult.strategyName || 'Technical'} analysis`,
            priceTarget: sig?.priceTarget ?? details?.takeProfitLevels?.[0]?.price,
            stopLoss: sig?.stopLoss ?? details?.stopLoss?.price,
            takeProfit: details?.takeProfitLevels?.[0]?.price,
            technicalScore: sig?.confidence,
            status: 'PENDING',
            createdAt: techResult.scannedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            rating: (sig?.confidence ?? 50) > 75 ? 'A' : (sig?.confidence ?? 50) > 50 ? 'B' : 'C',
            riskRewardRatio: details?.riskRewardRatio,
            scanData: result,
          } as Signal;
        });

        // Prepend new signals, keep total under 100, dedupe by symbol+action
        setSignals((prev) => {
          const existingKeys = new Set(prev.map((s) => `${s.symbol}:${s.action}`));
          const unique = newSignals.filter((s) => !existingKeys.has(`${s.symbol}:${s.action}`));
          return [...unique, ...prev].slice(0, 100);
        });
      }

      toast.success(
        `Scan complete — ${rawResults?.length || 0} signals found`
      );
      setLastScanAt(new Date());

      // Don't re-fetch DB here — scan results ARE the current truth.
      // DB fetch would overwrite in-memory scan results (and often fails with auth errors).
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to run signal scan';
      console.error('Scan error:', err);
      toast.error(msg);
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [fetchSignals, selectedSymbols]);

  // Keep ref in sync so auto-scan interval can call stable reference
  handleScanRef.current = handleScan;

  // ── Execute signal handler — opens dialog ────────────────────
  const handleExecute = useCallback((signalId: string, symbol: string, action: string) => {
    const signal = signals.find((s) => s.id === signalId);
    setSelectedSignalForExecution(signal || null);
    setExecuteDialogOpen(true);
  }, [signals]);

  // ── Execute trade with full order params from dialog ──────────
  const handleExecuteTrade = useCallback(async (params: {
    symbol: string;
    action: string;
    quantity: number;
    leverage: number;
    stopLoss?: number;
    takeProfit?: number;
  }) => {
    try {
      toast.info(`Placing ${params.symbol} ${params.action} order...`);
      const res = await fetch('/api/trading/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'place_order',
          symbol: params.symbol,
          side: params.action as 'BUY' | 'SELL',
          type: 'MARKET',
          quantity: params.quantity,
          leverage: params.leverage,
          stopLoss: params.stopLoss,
          takeProfit: params.takeProfit,
        }),
      });
      if (res.ok) {
        toast.success(`Order placed: ${params.symbol} ${params.action} @ ${params.quantity}`);
        setExecuteDialogOpen(false);
        setSelectedSignalForExecution(null);
        await fetchSignals();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.message || errData.error || 'Failed to execute trade');
      }
    } catch {
      toast.error('Network error while executing trade');
    }
  }, [fetchSignals]);

  // ── Auto-scan interval management ─────────────────────────────
  useEffect(() => {
    isAutoRef.current = scanMode === 'auto';

    // Clear any existing interval when mode changes
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (scanMode === 'auto') {
      // Immediately run first scan on switch to auto mode
      handleScanRef.current?.();

      intervalRef.current = setInterval(() => {
        if (isAutoRef.current) {
          handleScanRef.current?.();
        }
      }, Number(scanInterval) * 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // Intentionally omit handleScanRef — it's a mutable ref, not a dep.
    // Including it would recreate the effect on every render (infinite loop).
  }, [scanMode, scanInterval]);

  // ── Initial load ──────────────────────────────────────────────
  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ═══ PAGE HEADER ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Radar className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Trading Signals</h1>
            <p className="text-xs text-muted-foreground">Real-time market analysis &amp; trade recommendations</p>
          </div>
        </div>

        {/* Mode Toggle + Scan Button */}
        <div className="flex items-center gap-3">
          {/* Auto / On-Demand Mode Switch */}
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5">
            <Pause className={`w-4 h-4 ${scanMode === 'on-demand' ? 'text-foreground' : 'text-muted-foreground'}`} />
            <Switch
              checked={scanMode === 'auto'}
              onCheckedChange={(checked) => setScanMode(checked ? 'auto' : 'on-demand')}
              aria-label="Toggle auto-scanning mode"
            />
            <Play className={`w-4 h-4 ${scanMode === 'auto' ? 'text-green-500' : 'text-muted-foreground'}`} />
            <span className="text-xs font-medium text-muted-foreground ml-1 hidden sm:inline">
              {scanMode === 'auto' ? 'Auto' : 'Manual'}
            </span>
          </div>

          {/* Scan Button (always visible; in auto-mode shows scanning state) */}
          <Button
            variant={scanMode === 'auto' ? 'outline' : 'default'}
            size="sm"
            onClick={() => (scanMode === 'auto' ? undefined : handleScan())}
            disabled={scanning}
            className={
              scanMode === 'auto'
                ? 'bg-transparent border-border hover:bg-accent text-foreground'
                : ''
            }
          >
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                {scanMode === 'auto' ? 'Scanning...' : 'Scan Now'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ═══ CONTROLS BAR ═══ */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap gap-3 items-center">
        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="EXECUTED">Executed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action Filter */}
        <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as ActionFilter)}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Actions</SelectItem>
            <SelectItem value="BUY">
              <TrendingUp className="w-3 h-3 inline mr-1 text-green-500" /> BUY
            </SelectItem>
            <SelectItem value="SELL">
              <TrendingDown className="w-3 h-3 inline mr-1 text-red-500" /> SELL
            </SelectItem>
            <SelectItem value="HOLD">
              <Minus className="w-3 h-3 inline mr-1 text-gray-400" /> HOLD
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Instrument Selector */}
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex flex-wrap gap-1">
            {AVAILABLE_SYMBOLS.map((sym) => {
              const active = selectedSymbols.includes(sym.value);
              return (
                <button
                  key={sym.value}
                  onClick={() =>
                    setSelectedSymbols((prev) =>
                      prev.includes(sym.value)
                        ? prev.filter((s) => s !== sym.value)
                        : [...prev, sym.value]
                    )
                  }
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                    active
                      ? 'bg-blue-500/15 text-blue-600 border-blue-500/30 hover:bg-blue-500/25'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {sym.label}
                </button>
              );
            })}
          </div>
          <span className="text-[10px] text-muted-foreground hidden lg:inline">
            ({selectedSymbols.length})
          </span>
        </div>

        <Separator orientation="vertical" className="h-6 hidden sm:block" />

        {/* Scan Interval (only visible in auto mode) */}
        {scanMode === 'auto' && (
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-muted-foreground" />
            <Select value={scanInterval} onValueChange={(v) => setScanInterval(v as IntervalOption)}>
              <SelectTrigger className="h-8 w-[100px] text-xs">
                <SelectValue placeholder="Interval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">60 seconds</SelectItem>
                <SelectItem value="120">2 minutes</SelectItem>
                <SelectItem value="300">5 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Scanning indicator in auto mode */}
        {scanMode === 'auto' && scanning && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            <span className="text-[11px] text-muted-foreground font-medium animate-pulse">
              Scanning...
            </span>
          </div>
        )}

        {/* Results count */}
        {!loading && (
          <span className="text-[11px] text-muted-foreground ml-auto sm:ml-0">
            Showing {totalSignals} of {signals.length} signals
          </span>
        )}
      </div>

      {/* ═══ STATS SUMMARY BAR ═══ */}
      {loading ? (
        <StatsBarSkeleton />
      ) : totalSignals > 0 ? (
        <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap gap-x-8 gap-y-3 items-center justify-between">
          {/* Total count */}
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-muted-foreground">Total Signals:</span>
            <span className="text-lg font-bold text-foreground">{totalSignals}</span>
          </div>

          {/* Action breakdown */}
          <div className="flex items-center gap-3">
            <Badge className={`${ACTION_COLORS.BUY} text-xs px-2.5 py-1`}>
              <ArrowUpRight className="w-3 h-3 mr-1" /> {buyCount} BUY
            </Badge>
            <Badge className={`${ACTION_COLORS.SELL} text-xs px-2.5 py-1`}>
              <ArrowDownRight className="w-3 h-3 mr-1" /> {sellCount} SELL
            </Badge>
            <Badge className={`${ACTION_COLORS.HOLD} text-xs px-2.5 py-1`}>
              <Minus className="w-3 h-3 mr-1" /> {holdCount} HOLD
            </Badge>
          </div>

          {/* Average confidence */}
          <div className="flex items-center gap-2 min-w-[140px]">
            <BarChart3 className="w-4 h-4 text-purple-500" />
            <span className="text-sm text-muted-foreground">Avg Confidence:</span>
            <div className="flex items-center gap-2 flex-1">
              <div className={`flex-1 h-2 rounded-full ${confidenceBarColor(avgConfidence).track} max-w-[80px]`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${confidenceBarColor(avgConfidence).bg}`}
                  style={{ width: `${Math.min(avgConfidence, 100)}%` }}
                />
              </div>
              <span className={`text-sm font-bold ${confidenceBarColor(avgConfidence).text}`}>
                {Math.round(avgConfidence)}%
              </span>
            </div>
          </div>

          {/* Last scan timestamp (auto mode) */}
          {(lastScanAt || scanMode === 'auto') && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <RefreshCw className="w-3 h-3" />
              Last scan:{' '}
              {lastScanAt
                ? formatDateTime(lastScanAt.toISOString())
                : '—'}
            </div>
          )}
        </div>
      ) : null}

      {/* ═══ SIGNAL CARDS GRID / EMPTY STATE / LOADING ═══ */}

      {/* Loading skeleton grid */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SignalCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state (not loading, no signals) */}
      {!loading && filteredSignals.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-12 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Radar className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold text-foreground">
              {signals.length > 0 ? 'No matching signals' : 'No signals yet'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              {signals.length > 0
                ? 'Adjust your filters above to see more signals, or reset them to view all available signals.'
                : 'Start scanning the market to generate trading signals based on technical, fundamental, and sentiment analysis.'}
            </p>
          </div>
          {signals.length === 0 && (
            <Button onClick={handleScan} disabled={scanning} size="lg" className="mt-2 gap-2">
              {scanning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {scanning ? 'Scanning...' : 'Scan Now'}
            </Button>
          )}
        </div>
      )}

      {/* Signal cards grid */}
      {!loading && filteredSignals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSignals.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              onExecute={handleExecute}
            />
          ))}
        </div>
      )}

      {/* Show skeleton overlay while scanning (after initial load) */}
      {!loading && scanning && filteredSignals.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="bg-card border border-border rounded-lg shadow-lg px-4 py-2.5 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            <span className="text-xs font-medium text-foreground">
              Scanning markets...
            </span>
          </div>
        </div>
      )}

      {/* ── Execute Trade Dialog ──────────────────────────────── */}
      <ExecuteDialog
        open={executeDialogOpen}
        onOpenChange={setExecuteDialogOpen}
        signal={selectedSignalForExecution}
        onExecute={handleExecuteTrade}
      />
    </div>
  );
}
