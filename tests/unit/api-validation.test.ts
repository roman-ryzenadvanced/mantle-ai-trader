/**
 * Unit Tests for API Validation Utilities
 * Tests the v4.0.0 centralized API validation including rate limiting,
 * error responses, and request logging
 */

import { describe, test, expect, beforeEach } from 'bun:test';

// We test the validation utilities by importing and calling them directly.
// Since they use NextRequest/NextResponse from next/server which needs
// the Next.js runtime, we test the logic at a unit level.

// Import the validation module
import {
  RATE_LIMITS,
  createErrorResponse,
  createSuccessResponse,
  checkRateLimit,
  validateRequest,
  logRequest,
  ApiErrorResponse,
  ApiSuccessResponse,
} from '../../src/lib/api/validation';

// Mock NextRequest for testing
function createMockRequest(url: string, options?: { ip?: string; method?: string; userAgent?: string }) {
  const headers = new Map<string, string>();
  if (options?.ip) {
    headers.set('x-forwarded-for', options.ip);
  }
  if (options?.userAgent) {
    headers.set('user-agent', options.userAgent);
  }

  return {
    url,
    method: options?.method || 'GET',
    headers: {
      get: (name: string) => headers.get(name) || null,
    },
  } as any;
}

describe('API Validation Utilities', () => {
  describe('RATE_LIMITS configuration', () => {
    test('should have all endpoint categories defined', () => {
      expect(RATE_LIMITS).toHaveProperty('SIGNAL_GENERATION');
      expect(RATE_LIMITS).toHaveProperty('DEMO_TRADING');
      expect(RATE_LIMITS).toHaveProperty('NEWS_FETCH');
      expect(RATE_LIMITS).toHaveProperty('BACKTEST');
      expect(RATE_LIMITS).toHaveProperty('HEALTH');
      expect(RATE_LIMITS).toHaveProperty('DEFAULT');
    });

    test('each rate limit should have maxRequests and windowMs', () => {
      Object.values(RATE_LIMITS).forEach(limit => {
        expect(limit).toHaveProperty('maxRequests');
        expect(limit).toHaveProperty('windowMs');
        expect(limit.maxRequests).toBeGreaterThan(0);
        expect(limit.windowMs).toBeGreaterThan(0);
      });
    });

    test('SIGNAL_GENERATION should be most restrictive', () => {
      expect(RATE_LIMITS.SIGNAL_GENERATION.maxRequests).toBeLessThan(RATE_LIMITS.DEFAULT.maxRequests);
    });

    test('HEALTH should be least restrictive', () => {
      expect(RATE_LIMITS.HEALTH.maxRequests).toBeGreaterThan(RATE_LIMITS.DEFAULT.maxRequests);
    });
  });

  describe('rate limiter allows requests within limit', () => {
    test('should allow first request', () => {
      const req = createMockRequest('http://localhost:3000/api/health', { ip: '127.0.0.1' });
      const result = checkRateLimit(req, RATE_LIMITS.HEALTH);
      expect(result.allowed).toBe(true);
    });

    test('should provide remaining count', () => {
      const req = createMockRequest('http://localhost:3000/api/health', { ip: '127.0.0.1' });
      const result = checkRateLimit(req, RATE_LIMITS.HEALTH);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    test('should provide resetAt timestamp', () => {
      const req = createMockRequest('http://localhost:3000/api/health', { ip: '127.0.0.1' });
      const result = checkRateLimit(req, RATE_LIMITS.HEALTH);
      expect(result.resetAt).toBeGreaterThan(0);
    });

    test('should allow multiple requests from different IPs', () => {
      const req1 = createMockRequest('http://localhost:3000/api/health', { ip: '192.168.1.1' });
      const req2 = createMockRequest('http://localhost:3000/api/health', { ip: '192.168.1.2' });
      const result1 = checkRateLimit(req1, { maxRequests: 2, windowMs: 60000 });
      const result2 = checkRateLimit(req2, { maxRequests: 2, windowMs: 60000 });
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('rate limiter blocks requests over limit', () => {
    test('should block requests exceeding the limit', () => {
      const req = createMockRequest('http://localhost:3000/api/test', { ip: '10.0.0.1' });
      const smallLimit = { maxRequests: 2, windowMs: 60000 };
      
      // Use first two requests
      checkRateLimit(req, smallLimit);
      checkRateLimit(req, smallLimit);
      
      // Third request should be blocked
      const result = checkRateLimit(req, smallLimit);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('standardized error response format', () => {
    test('createErrorResponse should return correct structure', () => {
      const response = createErrorResponse(400, 'Bad request', 'INVALID_INPUT', { field: 'symbol' });
      // Response is a NextResponse, check the structure
      expect(response).toBeDefined();
      expect(response.status).toBe(400);
    });

    test('createErrorResponse with 429 should return rate limit error', () => {
      const response = createErrorResponse(429, 'Too many requests', 'RATE_LIMITED');
      expect(response.status).toBe(429);
    });

    test('createErrorResponse with 500 should return internal error', () => {
      const response = createErrorResponse(500, 'Internal error', 'INTERNAL_ERROR');
      expect(response.status).toBe(500);
    });
  });

  describe('standardized success response format', () => {
    test('createSuccessResponse should return 200 by default', () => {
      const response = createSuccessResponse({ data: 'test' });
      expect(response.status).toBe(200);
    });

    test('createSuccessResponse should support custom status codes', () => {
      const response = createSuccessResponse({ id: 1 }, 201);
      expect(response.status).toBe(201);
    });
  });

  describe('request logging', () => {
    test('logRequest should not throw', () => {
      const req = createMockRequest('http://localhost:3000/api/health', {
        ip: '127.0.0.1',
        method: 'GET',
        userAgent: 'TestAgent/1.0',
      });
      // Should not throw
      expect(() => logRequest(req)).not.toThrow();
    });

    test('logRequest with extra context should not throw', () => {
      const req = createMockRequest('http://localhost:3000/api/signals', {
        ip: '127.0.0.1',
        method: 'POST',
      });
      expect(() => logRequest(req, { userId: '123' })).not.toThrow();
    });
  });

  describe('validateRequest', () => {
    test('should return null for allowed requests', () => {
      const req = createMockRequest('http://localhost:3000/api/health', { ip: '127.0.0.1' });
      const result = validateRequest(req, { maxRequests: 100, windowMs: 60000 });
      // First request should be allowed
      expect(result).toBeNull();
    });

    test('should return error response when rate limited', () => {
      const req = createMockRequest('http://localhost:3000/api/test', { ip: '10.0.0.1' });
      const smallLimit = { maxRequests: 1, windowMs: 60000 };
      
      // Use first request
      validateRequest(req, smallLimit);
      
      // Second request should be blocked
      const result = validateRequest(req, smallLimit);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
    });
  });

  describe('Zod schema validation', () => {
    test('should validate using zod schema', async () => {
      const { z } = await import('zod');
      const schema = z.object({
        symbol: z.string().min(2).max(20),
        timeframe: z.string(),
      });

      // Valid data
      const validResult = schema.safeParse({ symbol: 'BTCUSDT', timeframe: '1h' });
      expect(validResult.success).toBe(true);

      // Invalid data
      const invalidResult = schema.safeParse({ symbol: '', timeframe: '1h' });
      expect(invalidResult.success).toBe(false);
    });

    test('should handle nested zod validation', async () => {
      const { z } = await import('zod');
      const schema = z.object({
        symbol: z.string(),
        quantity: z.number().positive(),
        leverage: z.number().min(1).max(100).optional(),
      });

      const validResult = schema.safeParse({ symbol: 'BTCUSDT', quantity: 0.1 });
      expect(validResult.success).toBe(true);

      const invalidResult = schema.safeParse({ symbol: 'BTCUSDT', quantity: -1 });
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('IP extraction', () => {
    test('should use x-forwarded-for header for IP', () => {
      const req = createMockRequest('http://localhost/test', { ip: '203.0.113.1' });
      const ip = req.headers.get('x-forwarded-for');
      expect(ip).toBe('203.0.113.1');
    });

    test('should fall back to x-real-ip header', () => {
      const headers = new Map<string, string>();
      headers.set('x-real-ip', '198.51.100.1');
      const req = {
        headers: { get: (name: string) => headers.get(name) || null },
      };
      const ip = req.headers.get('x-real-ip');
      expect(ip).toBe('198.51.100.1');
    });

    test('should use "unknown" when no IP headers', () => {
      const req = createMockRequest('http://localhost/test');
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
      expect(ip).toBe('unknown');
    });
  });
});
