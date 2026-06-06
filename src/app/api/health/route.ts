/**
 * Health Check API Endpoint for Mantle AI Trading Bot
 * Checks database, external APIs, ChromaDB, and system resources
 * 
 * v4.0.0 - New: system health monitoring endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateRequest, RATE_LIMITS, createErrorResponse } from '@/lib/api/validation';
import { db } from '@/lib/db';

/** System health check result */
interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: ComponentCheck;
    bybitApi: ComponentCheck;
    chromaDb: ComponentCheck;
  };
  system: {
    memoryUsage: NodeMemoryInfo;
    activeConnections: number;
    nodeVersion: string;
    environment: string;
  };
}

/** Individual component check */
interface ComponentCheck {
  status: 'ok' | 'error' | 'degraded';
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

/** Node.js memory information */
interface NodeMemoryInfo {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

/** Application start time for uptime calculation */
const startTime = Date.now();

/** Application version */
const APP_VERSION = '4.0.0';

/**
 * Check database connectivity
 * @returns Component check result
 */
async function checkDatabase(): Promise<ComponentCheck> {
  const start = Date.now();
  try {
    // Simple query to verify database is responsive
    await db.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      latencyMs: Date.now() - start
    };
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown database error'
    };
  }
}

/**
 * Check Bybit API availability
 * @returns Component check result
 */
async function checkBybitApi(): Promise<ComponentCheck> {
  const start = Date.now();
  try {
    const response = await fetch('https://api.bybit.com/v2/public/time', {
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    
    if (response.ok) {
      const data = await response.json() as { time_now: string };
      return {
        status: 'ok',
        latencyMs: Date.now() - start,
        details: {
          serverTime: data.time_now
        }
      };
    } else {
      return {
        status: 'degraded',
        latencyMs: Date.now() - start,
        error: `Bybit API returned ${response.status}`
      };
    }
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Cannot reach Bybit API'
    };
  }
}

/**
 * Check ChromaDB availability
 * @returns Component check result
 */
async function checkChromaDb(): Promise<ComponentCheck> {
  const start = Date.now();
  try {
    // Try to import and check vector store
    const { vectorStore } = await import('@/lib/vector/vector-store');
    // Attempt a simple health check - this will throw if ChromaDB is down
    const isHealthy = await vectorStore.isHealthy();
    
    if (isHealthy) {
      return {
        status: 'ok',
        latencyMs: Date.now() - start
      };
    } else {
      return {
        status: 'degraded',
        latencyMs: Date.now() - start,
        error: 'ChromaDB health check returned false'
      };
    }
  } catch (error) {
    return {
      status: 'degraded', // Not critical - system can work without ChromaDB
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'ChromaDB not available'
    };
  }
}

/**
 * GET /api/health - System health check
 * Returns comprehensive system status including database, APIs, and resources
 */
export async function GET(request: NextRequest) {
  // Validate request (rate limiting + logging)
  const validationError = validateRequest(request, RATE_LIMITS.HEALTH);
  if (validationError) return validationError;

  try {
    // Run all checks in parallel for faster response
    const [dbCheck, bybitCheck, chromaCheck] = await Promise.all([
      checkDatabase(),
      checkBybitApi(),
      checkChromaDb()
    ]);

    // Determine overall status
    const checks = { database: dbCheck, bybitApi: bybitCheck, chromaDb: chromaCheck };
    const allOk = Object.values(checks).every(c => c.status === 'ok');
    const anyError = Object.values(checks).some(c => c.status === 'error');
    
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (allOk) {
      overallStatus = 'healthy';
    } else if (anyError) {
      // Database error means unhealthy; Bybit error means degraded; ChromaDB error means degraded
      overallStatus = dbCheck.status === 'error' ? 'unhealthy' : 'degraded';
    } else {
      overallStatus = 'degraded';
    }

    // System info
    const memoryUsage = process.memoryUsage();
    const system: HealthCheckResult['system'] = {
      memoryUsage: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
        arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024)
      },
      activeConnections: 0, // Would need actual connection pool tracking
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    };

    const result: HealthCheckResult = {
      status: overallStatus,
      version: APP_VERSION,
      uptime: Math.round((Date.now() - startTime) / 1000), // seconds
      timestamp: new Date().toISOString(),
      checks,
      system
    };

    // Return with appropriate HTTP status
    const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
    
    return NextResponse.json(
      {
        success: true,
        data: result
      },
      { status: httpStatus }
    );
  } catch (error) {
    console.error('Health check error:', error);
    return createErrorResponse(
      503,
      'Health check failed',
      'HEALTH_CHECK_ERROR',
      { error: error instanceof Error ? error.message : 'Unknown error' }
    );
  }
}
