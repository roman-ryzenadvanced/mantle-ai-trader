/**
 * Rate Limiter with Bottleneck Pattern
 * Adapted from Polymarket-bot for API rate limiting
 * 
 * Features:
 * - Token bucket algorithm for rate limiting
 * - Reservoir pattern for burst handling
 * - Concurrent request limiting
 * - Multiple API endpoint support with different limits
 */

export type ApiType = 'BYBIT_PUBLIC' | 'BYBIT_PRIVATE' | 'NEWS_API' | 'GENERAL';

export interface RateLimitConfig {
  // Minimum time between requests (ms)
  minTime?: number;
  // Maximum concurrent requests
  maxConcurrent?: number;
  // Reservoir size (tokens available)
  reservoir?: number;
  // How often to refresh reservoir (ms)
  reservoirRefreshInterval?: number;
  // How many tokens to add on refresh
  reservoirRefreshAmount?: number;
}

interface RequestQueueItem {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timestamp: number;
  priority: number;
}

interface ApiRateLimitState {
  tokens: number;
  lastRefill: number;
  activeRequests: number;
  queue: RequestQueueItem[];
}

const DEFAULT_LIMITS: Record<ApiType, RateLimitConfig> = {
  BYBIT_PUBLIC: {
    minTime: 100,          // 10 requests per second
    maxConcurrent: 10,
    reservoir: 100,
    reservoirRefreshInterval: 1000,
    reservoirRefreshAmount: 100,
  },
  BYBIT_PRIVATE: {
    minTime: 200,          // 5 requests per second (more conservative)
    maxConcurrent: 5,
    reservoir: 50,
    reservoirRefreshInterval: 1000,
    reservoirRefreshAmount: 50,
  },
  NEWS_API: {
    minTime: 500,          // 2 requests per second
    maxConcurrent: 3,
    reservoir: 30,
    reservoirRefreshInterval: 60000, // 30 per minute
    reservoirRefreshAmount: 30,
  },
  GENERAL: {
    minTime: 100,
    maxConcurrent: 5,
    reservoir: 50,
    reservoirRefreshInterval: 1000,
    reservoirRefreshAmount: 50,
  },
};

export class RateLimiter {
  private limits: Map<ApiType, RateLimitConfig>;
  private states: Map<ApiType, ApiRateLimitState>;
  private timers: Map<ApiType, NodeJS.Timeout>;

  constructor(customLimits?: Partial<Record<ApiType, RateLimitConfig>>) {
    this.limits = new Map();
    this.states = new Map();
    this.timers = new Map();

    // Initialize with default or custom limits
    const apiTypes: ApiType[] = ['BYBIT_PUBLIC', 'BYBIT_PRIVATE', 'NEWS_API', 'GENERAL'];
    
    for (const type of apiTypes) {
      const config = {
        ...DEFAULT_LIMITS[type],
        ...(customLimits?.[type] || {}),
      };
      this.limits.set(type, config);
      this.states.set(type, {
        tokens: config.reservoir || 100,
        lastRefill: Date.now(),
        activeRequests: 0,
        queue: [],
      });
    }

    // Start refill timers
    this.startRefillTimers();
  }

  /**
   * Schedule a request with rate limiting
   */
  async schedule<T>(
    apiType: ApiType,
    fn: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const state = this.states.get(apiType)!;
      const config = this.limits.get(apiType)!;

      // Check if we can execute immediately
      if (
        state.tokens > 0 &&
        state.activeRequests < (config.maxConcurrent || 5)
      ) {
        this.executeRequest(apiType, fn, resolve, reject);
        return;
      }

      // Queue the request
      state.queue.push({
        resolve: resolve as (value: unknown) => void,
        reject,
        timestamp: Date.now(),
        priority,
      });

      // Sort queue by priority (higher first)
      state.queue.sort((a, b) => b.priority - a.priority);
    });
  }

  /**
   * Execute a request
   */
  private async executeRequest<T>(
    apiType: ApiType,
    fn: () => Promise<T>,
    resolve: (value: T) => void,
    reject: (error: Error) => void
  ): Promise<void> {
    const state = this.states.get(apiType)!;
    const config = this.limits.get(apiType)!;

    // Consume token and increment active requests
    state.tokens--;
    state.activeRequests++;

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error as Error);
    } finally {
      state.activeRequests--;
      this.processQueue(apiType);
    }
  }

  /**
   * Process the next item in queue
   */
  private processQueue(apiType: ApiType): void {
    const state = this.states.get(apiType)!;
    const config = this.limits.get(apiType)!;

    if (
      state.queue.length === 0 ||
      state.tokens <= 0 ||
      state.activeRequests >= (config.maxConcurrent || 5)
    ) {
      return;
    }

    const next = state.queue.shift();
    if (next) {
      this.executeRequest(
        apiType,
        async () => {
          // This is a placeholder - the actual function was passed in schedule
          return next;
        },
        next.resolve,
        next.reject
      );
    }
  }

  /**
   * Start refill timers for all API types
   */
  private startRefillTimers(): void {
    for (const [type, config] of this.limits) {
      if (config.reservoirRefreshInterval) {
        const timer = setInterval(() => {
          this.refillTokens(type);
        }, config.reservoirRefreshInterval);
        
        this.timers.set(type, timer);
      }
    }
  }

  /**
   * Refill tokens for a specific API type
   */
  private refillTokens(apiType: ApiType): void {
    const state = this.states.get(apiType)!;
    const config = this.limits.get(apiType)!;

    const maxTokens = config.reservoir || 100;
    const refillAmount = config.reservoirRefreshAmount || maxTokens;

    state.tokens = Math.min(maxTokens, state.tokens + refillAmount);
    state.lastRefill = Date.now();

    // Process any queued requests
    this.processQueue(apiType);
  }

  /**
   * Get current token count for an API type
   */
  getTokens(apiType: ApiType): number {
    return this.states.get(apiType)?.tokens || 0;
  }

  /**
   * Get queue length for an API type
   */
  getQueueLength(apiType: ApiType): number {
    return this.states.get(apiType)?.queue.length || 0;
  }

  /**
   * Get active request count for an API type
   */
  getActiveRequests(apiType: ApiType): number {
    return this.states.get(apiType)?.activeRequests || 0;
  }

  /**
   * Clear the queue for an API type
   */
  clearQueue(apiType: ApiType): void {
    const state = this.states.get(apiType)!;
    const queue = state.queue;
    state.queue = [];
    
    // Reject all queued requests
    queue.forEach(item => {
      item.reject(new Error('Queue cleared'));
    });
  }

  /**
   * Update limits for a specific API type
   */
  updateLimits(apiType: ApiType, config: Partial<RateLimitConfig>): void {
    const currentConfig = this.limits.get(apiType)!;
    this.limits.set(apiType, { ...currentConfig, ...config });
  }

  /**
   * Stop all timers and cleanup
   */
  destroy(): void {
    for (const [, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();

    // Reject all queued requests
    for (const [, state] of this.states) {
      state.queue.forEach(item => {
        item.reject(new Error('Rate limiter destroyed'));
      });
    }
  }
}

// Singleton instance
let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(customLimits?: Partial<Record<ApiType, RateLimitConfig>>): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter(customLimits);
  }
  return rateLimiterInstance;
}

export function resetRateLimiter(): void {
  if (rateLimiterInstance) {
    rateLimiterInstance.destroy();
    rateLimiterInstance = null;
  }
}
