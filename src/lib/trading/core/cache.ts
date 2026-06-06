/**
 * Cache Layer with TTL
 * Adapted from Polymarket-bot for API response caching
 * 
 * Features:
 * - TTL (Time To Live) based expiration
 * - Automatic cleanup of expired entries
 * - LRU eviction when max size reached
 * - Memory-efficient storage
 */

export interface CacheEntry<T> {
  value: T;
  expires: number;
  createdAt: number;
  hits: number;
}

export interface CacheConfig {
  // Default TTL in milliseconds (default: 60 seconds)
  defaultTTL: number;
  // Maximum number of entries (default: 1000)
  maxSize: number;
  // Cleanup interval in milliseconds (default: 60 seconds)
  cleanupInterval: number;
  // Enable debug logging
  debug: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  hitRate: number;
  totalSize: number;
}

export class Cache<T = unknown> {
  private store: Map<string, CacheEntry<T>>;
  private config: CacheConfig;
  private stats: { hits: number; misses: number };
  private cleanupTimer: NodeJS.Timeout | null;
  private accessOrder: string[];

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      defaultTTL: 60000,      // 60 seconds
      maxSize: 1000,
      cleanupInterval: 60000, // 60 seconds
      debug: false,
      ...config,
    };

    this.store = new Map();
    this.stats = { hits: 0, misses: 0 };
    this.accessOrder = [];
    this.cleanupTimer = null;

    this.startCleanup();
  }

  /**
   * Get a value from cache
   */
  get(key: string): T | null {
    const entry = this.store.get(key);
    
    if (!entry) {
      this.stats.misses++;
      if (this.config.debug) {
        console.log(`[Cache] MISS: ${key}`);
      }
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      this.stats.misses++;
      if (this.config.debug) {
        console.log(`[Cache] EXPIRED: ${key}`);
      }
      return null;
    }

    // Update access order for LRU
    this.updateAccessOrder(key);
    entry.hits++;
    this.stats.hits++;
    
    if (this.config.debug) {
      console.log(`[Cache] HIT: ${key} (hits: ${entry.hits})`);
    }

    return entry.value;
  }

  /**
   * Set a value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    const actualTTL = ttl ?? this.config.defaultTTL;
    
    // Check if we need to evict
    if (this.store.size >= this.config.maxSize && !this.store.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      expires: Date.now() + actualTTL,
      createdAt: Date.now(),
      hits: 0,
    };

    this.store.set(key, entry);
    this.updateAccessOrder(key);

    if (this.config.debug) {
      console.log(`[Cache] SET: ${key} (TTL: ${actualTTL}ms)`);
    }
  }

  /**
   * Get or set - returns cached value or computes and caches it
   */
  async getOrSet(
    key: string,
    ttl: number | (() => Promise<T> | T),
    fn?: () => Promise<T> | T
  ): Promise<T> {
    // Handle overloaded parameters
    let actualTTL: number;
    let actualFn: () => Promise<T> | T;
    
    if (typeof ttl === 'function') {
      actualTTL = this.config.defaultTTL;
      actualFn = ttl;
    } else {
      actualTTL = ttl;
      actualFn = fn!;
    }

    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await actualFn();
    this.set(key, value, actualTTL);
    return value;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): boolean {
    const result = this.store.delete(key);
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    return result;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.store.clear();
    this.accessOrder = [];
    if (this.config.debug) {
      console.log('[Cache] CLEARED');
    }
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Get remaining TTL for a key
   */
  getRemainingTTL(key: string): number {
    const entry = this.store.get(key);
    if (!entry) return 0;
    
    const remaining = entry.expires - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Update access order for LRU eviction
   */
  private updateAccessOrder(key: string): void {
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;
    
    const lruKey = this.accessOrder.shift();
    if (lruKey) {
      this.store.delete(lruKey);
      if (this.config.debug) {
        console.log(`[Cache] EVICT (LRU): ${lruKey}`);
      }
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Remove expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.store) {
      if (now > entry.expires) {
        this.store.delete(key);
        this.accessOrder = this.accessOrder.filter(k => k !== key);
        removed++;
      }
    }

    if (this.config.debug && removed > 0) {
      console.log(`[Cache] CLEANUP: Removed ${removed} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      entries: this.store.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      totalSize: this.store.size,
    };
  }

  /**
   * Stop cleanup timer and cleanup
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}

// Specialized caches for different data types
export class PriceCache extends Cache<number> {
  constructor() {
    super({
      defaultTTL: 5000,       // 5 seconds for prices
      maxSize: 500,
      cleanupInterval: 10000, // 10 seconds
    });
  }
}

export class NewsCache extends Cache<unknown> {
  constructor() {
    super({
      defaultTTL: 300000,     // 5 minutes for news
      maxSize: 200,
      cleanupInterval: 60000,
    });
  }
}

export class SignalCache extends Cache<unknown> {
  constructor() {
    super({
      defaultTTL: 60000,      // 1 minute for signals
      maxSize: 100,
      cleanupInterval: 30000,
    });
  }
}

// Singleton cache instances
let priceCache: PriceCache | null = null;
let newsCache: NewsCache | null = null;
let signalCache: SignalCache | null = null;

export function getPriceCache(): PriceCache {
  if (!priceCache) {
    priceCache = new PriceCache();
  }
  return priceCache;
}

export function getNewsCache(): NewsCache {
  if (!newsCache) {
    newsCache = new NewsCache();
  }
  return newsCache;
}

export function getSignalCache(): SignalCache {
  if (!signalCache) {
    signalCache = new SignalCache();
  }
  return signalCache;
}

export function clearAllCaches(): void {
  priceCache?.destroy();
  newsCache?.destroy();
  signalCache?.destroy();
  priceCache = null;
  newsCache = null;
  signalCache = null;
}
