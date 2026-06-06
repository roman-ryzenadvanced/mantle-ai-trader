/**
 * Error Handling with Retry Pattern
 * Adapted from Polymarket-bot for robust error handling
 * 
 * Features:
 * - Exponential backoff retry
 * - Configurable retry strategies
 * - Circuit breaker pattern
 * - Custom error types
 */

// Custom Error Types
export class TradingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'TradingError';
  }
}

export class APIError extends TradingError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string
  ) {
    super(message, `API_${statusCode || 'UNKNOWN'}`, statusCode ? statusCode < 500 : true);
    this.name = 'APIError';
  }
}

export class RateLimitError extends TradingError {
  constructor(
    message: string = 'Rate limit exceeded',
    public readonly resetTime?: number
  ) {
    super(message, 'RATE_LIMIT', true, resetTime);
    this.name = 'RateLimitError';
  }
}

export class InsufficientFundsError extends TradingError {
  constructor(message: string = 'Insufficient funds') {
    super(message, 'INSUFFICIENT_FUNDS', false);
    this.name = 'InsufficientFundsError';
  }
}

export class NetworkError extends TradingError {
  constructor(message: string = 'Network error') {
    super(message, 'NETWORK_ERROR', true);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends TradingError {
  constructor(message: string = 'Request timeout') {
    super(message, 'TIMEOUT', true);
    this.name = 'TimeoutError';
  }
}

export class OrderError extends TradingError {
  constructor(
    message: string,
    public readonly orderId?: string,
    public readonly symbol?: string
  ) {
    super(message, 'ORDER_ERROR', true);
    this.name = 'OrderError';
  }
}

// Retry Configuration
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
  retryableErrors: string[];
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterMs: 100,
  retryableErrors: [
    'NETWORK_ERROR',
    'TIMEOUT',
    'RATE_LIMIT',
    'API_429',
    'API_500',
    'API_502',
    'API_503',
    'API_504',
  ],
};

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= cfg.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      const tradingError = error instanceof TradingError ? error : null;
      const errorCode = tradingError?.code || 'UNKNOWN';
      
      if (!cfg.retryableErrors.includes(errorCode)) {
        throw error;
      }

      // Check if we've exhausted retries
      if (attempt > cfg.maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(
        cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, attempt - 1),
        cfg.maxDelayMs
      );
      const jitter = Math.random() * cfg.jitterMs;
      const delay = baseDelay + jitter;

      // Use retryAfter from error if available
      const actualDelay = tradingError?.retryAfter 
        ? Math.max(delay, tradingError.retryAfter)
        : delay;

      // Call retry callback
      if (cfg.onRetry) {
        cfg.onRetry(attempt, error as Error, actualDelay);
      }

      // Wait before retry
      await sleep(actualDelay);
    }
  }

  throw lastError;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Circuit Breaker
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  resetTimeout: 60000,
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private config: CircuitBreakerConfig;
  private listeners: Array<(state: CircuitState) => void> = [];

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.emitStateChange();
      } else {
        throw new TradingError(
          'Circuit breaker is OPEN',
          'CIRCUIT_OPEN',
          false
        );
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        this.createTimeoutPromise<T>(),
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Create timeout promise
   */
  private createTimeoutPromise<T>(): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(`Operation timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);
    });
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failures = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'CLOSED';
        this.successes = 0;
        this.emitStateChange();
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.emitStateChange();
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.emitStateChange();
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Force reset the circuit breaker
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.emitStateChange();
  }

  /**
   * Add state change listener
   */
  onStateChange(callback: (state: CircuitState) => void): void {
    this.listeners.push(callback);
  }

  /**
   * Emit state change event
   */
  private emitStateChange(): void {
    this.listeners.forEach(listener => listener(this.state));
  }
}

// Error Handler with Circuit Breaker
export interface ErrorHandlerConfig {
  retry: Partial<RetryConfig>;
  circuitBreaker: Partial<CircuitBreakerConfig>;
}

export class ErrorHandler {
  private retryConfig: RetryConfig;
  private circuitBreakers: Map<string, CircuitBreaker>;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry };
    this.circuitBreakers = new Map();
  }

  /**
   * Execute a function with full error handling
   */
  async execute<T>(
    operation: string,
    fn: () => Promise<T>,
    options: {
      retry?: Partial<RetryConfig>;
      useCircuitBreaker?: boolean;
    } = {}
  ): Promise<T> {
    const { useCircuitBreaker = true } = options;
    const retryConfig = { ...this.retryConfig, ...options.retry };

    const executeWithRetry = async (): Promise<T> => {
      return withRetry(fn, {
        ...retryConfig,
        onRetry: (attempt, error, delay) => {
          console.warn(
            `[ErrorHandler] Retry ${attempt}/${retryConfig.maxRetries} for ${operation} after ${delay}ms due to: ${error.message}`
          );
          retryConfig.onRetry?.(attempt, error, delay);
        },
      });
    };

    if (useCircuitBreaker) {
      const circuit = this.getOrCreateCircuitBreaker(operation);
      return circuit.execute(executeWithRetry);
    }

    return executeWithRetry();
  }

  /**
   * Get or create circuit breaker for an operation
   */
  private getOrCreateCircuitBreaker(operation: string): CircuitBreaker {
    if (!this.circuitBreakers.has(operation)) {
      this.circuitBreakers.set(operation, new CircuitBreaker());
    }
    return this.circuitBreakers.get(operation)!;
  }

  /**
   * Get all circuit breaker states
   */
  getCircuitBreakerStates(): Record<string, CircuitState> {
    const states: Record<string, CircuitState> = {};
    this.circuitBreakers.forEach((circuit, operation) => {
      states[operation] = circuit.getState();
    });
    return states;
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers(): void {
    this.circuitBreakers.forEach(circuit => circuit.reset());
  }
}

// Singleton error handler
let errorHandlerInstance: ErrorHandler | null = null;

export function getErrorHandler(config?: Partial<ErrorHandlerConfig>): ErrorHandler {
  if (!errorHandlerInstance) {
    errorHandlerInstance = new ErrorHandler(config);
  }
  return errorHandlerInstance;
}

export function resetErrorHandler(): void {
  errorHandlerInstance = null;
}
