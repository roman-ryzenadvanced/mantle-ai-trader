/**
 * API Route Validation & Utilities for Mantle AI Trading Bot
 * Shared validation helpers, rate limiting constants, standardized error responses,
 * and request logging for all API routes
 * 
 * v4.0.0 - New: centralised API validation utilities
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

// ==================== RATE LIMITING ====================

/** Rate limiting configuration per endpoint category */
export const RATE_LIMITS = {
  /** Signal generation: 10 requests per minute */
  SIGNAL_GENERATION: { maxRequests: 10, windowMs: 60 * 1000 },
  /** Demo trading: 30 requests per minute */
  DEMO_TRADING: { maxRequests: 30, windowMs: 60 * 1000 },
  /** News fetching: 20 requests per minute */
  NEWS_FETCH: { maxRequests: 20, windowMs: 60 * 1000 },
  /** Backtest: 5 requests per minute (heavy computation) */
  BACKTEST: { maxRequests: 5, windowMs: 60 * 1000 },
  /** Health check: 60 requests per minute */
  HEALTH: { maxRequests: 60, windowMs: 60 * 1000 },
  /** Default: 30 requests per minute */
  DEFAULT: { maxRequests: 30, windowMs: 60 * 1000 },
} as const;

/** In-memory rate limit tracker (per-IP, per-endpoint) */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check if a request should be rate limited
 * @param request - The incoming request
 * @param limitConfig - Rate limit configuration
 * @returns Whether the request should be allowed
 */
export function checkRateLimit(
  request: NextRequest,
  limitConfig: { maxRequests: number; windowMs: number } = RATE_LIMITS.DEFAULT
): { allowed: boolean; remaining: number; resetAt: number } {
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown';
  const endpoint = new URL(request.url).pathname;
  const key = `${ip}:${endpoint}`;

  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + limitConfig.windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limitConfig.maxRequests - 1, resetAt };
  }

  if (entry.count >= limitConfig.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: limitConfig.maxRequests - entry.count, resetAt: entry.resetAt };
}

// ==================== STANDARDIZED ERROR RESPONSES ====================

/** Standard API error response format */
export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: unknown;
  requestId?: string;
  timestamp: string;
}

/** Standard API success response format */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    timestamp: string;
  };
}

/**
 * Create a standardized error response
 * @param statusCode - HTTP status code
 * @param error - Human-readable error message
 * @param code - Machine-readable error code
 * @param details - Optional additional details
 * @returns NextResponse with error format
 */
export function createErrorResponse(
  statusCode: number,
  error: string,
  code: string,
  details?: unknown
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      code,
      details,
      timestamp: new Date().toISOString()
    },
    { status: statusCode }
  );
}

/**
 * Create a standardized success response
 * @param data - Response data
 * @param statusCode - HTTP status code (default: 200)
 * @returns NextResponse with success format
 */
export function createSuccessResponse<T>(
  data: T,
  statusCode: number = 200
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString()
      }
    },
    { status: statusCode }
  );
}

/**
 * Handle a Zod validation error and return a standardized response
 * @param error - The ZodError from validation
 * @returns NextResponse with 400 status
 */
export function handleValidationError(error: ZodError): NextResponse<ApiErrorResponse> {
  return createErrorResponse(
    400,
    'Invalid request parameters',
    'VALIDATION_ERROR',
    error.flatten()
  );
}

/**
 * Handle an internal server error and return a standardized response
 * @param error - The error that occurred
 * @param context - Description of what was being attempted
 * @returns NextResponse with 500 status
 */
export function handleInternalError(error: unknown, context: string): NextResponse<ApiErrorResponse> {
  console.error(`Error in ${context}:`, error);
  return createErrorResponse(
    500,
    `An internal error occurred while ${context}`,
    'INTERNAL_ERROR'
  );
}

// ==================== REQUEST LOGGING ====================

/**
 * Log an API request for debugging
 * @param request - The incoming request
 * @param extra - Extra context to log
 */
export function logRequest(request: NextRequest, extra?: Record<string, unknown>): void {
  const method = request.method;
  const url = request.url;
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  console.log(`[API] ${method} ${url} - IP: ${ip} - UA: ${userAgent.substring(0, 80)}${extra ? ` - ${JSON.stringify(extra)}` : ''}`);
}

// ==================== MIDDLEWARE HELPER ====================

/**
 * Combined validation and rate-limiting check for API routes
 * Returns an error response if validation or rate limit fails, null if OK
 * @param request - The incoming request
 * @param rateLimitConfig - Rate limit configuration
 * @returns Error response if blocked, null if allowed
 */
export function validateRequest(
  request: NextRequest,
  rateLimitConfig: { maxRequests: number; windowMs: number } = RATE_LIMITS.DEFAULT
): NextResponse<ApiErrorResponse> | null {
  // Log the request
  logRequest(request);

  // Check rate limit
  const rateLimit = checkRateLimit(request, rateLimitConfig);
  if (!rateLimit.allowed) {
    return createErrorResponse(
      429,
      'Too many requests. Please try again later.',
      'RATE_LIMITED',
      { retryAfterMs: rateLimit.resetAt - Date.now() }
    );
  }

  return null;
}
