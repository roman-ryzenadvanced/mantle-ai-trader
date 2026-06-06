/**
 * Core Trading Module Exports
 * Central export point for all trading-related functionality
 */

// Enums and basic types
export * from './types';

// Risk Management
export {
  RiskManager,
  getRiskManager,
  resetRiskManager,
  type RiskConfig,
  type RiskState,
  type RiskCheckResult,
} from './risk-manager';

// Rate Limiting
export {
  RateLimiter,
  getRateLimiter,
  resetRateLimiter,
  type ApiType,
  type RateLimitConfig,
} from './rate-limiter';

// Caching
export {
  Cache,
  PriceCache,
  NewsCache,
  SignalCache,
  getPriceCache,
  getNewsCache,
  getSignalCache,
  clearAllCaches,
  type CacheEntry,
  type CacheConfig,
  type CacheStats,
} from './cache';

// Error Handling
export {
  ErrorHandler,
  getErrorHandler,
  resetErrorHandler,
  withRetry,
  sleep,
  CircuitBreaker,
  TradingError,
  APIError,
  RateLimitError,
  InsufficientFundsError,
  NetworkError,
  TimeoutError,
  OrderError,
  type RetryConfig,
  type CircuitBreakerConfig,
  type CircuitState,
  type ErrorHandlerConfig,
} from './error-handler';

// Smart Money Tracking
export {
  SmartMoneyTracker,
  getSmartMoneyTracker,
  resetSmartMoneyTracker,
  type TraderMetrics,
  type SmartMoneyFilter,
  type WhaleAlert,
  type SmartMoneySignal,
} from './smart-money-tracker';

// Configuration Management
export {
  ConfigManager,
  getConfigManager,
  resetConfigManager,
  DEFAULT_TRADING_CONFIG,
  type TradingConfig as FullTradingConfig,
  type StrategyAllocation,
  type TradingMode,
} from './trading-config';
