import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../config/database';
import { getRedisClient } from '../config/redis';
import { logger } from '../config/logger';
import { config } from '../config/env';
import { createApiResponse, createErrorResponse } from '../utils';

// Create router
export const healthRoutes = Router();

// GET /api/health - Basic health check
healthRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: config.server.nodeEnv,
    };

    res.json(createApiResponse(health, 'Service is healthy'));
  } catch (error) {
    logger.error('Health check failed', { error: (error as Error).message });
    res.status(503).json(createErrorResponse('Service unavailable'));
  }
});

// GET /api/health/detailed - Detailed health check with dependencies
healthRoutes.get('/detailed', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    // Check database health
    const dbHealth = await checkDatabaseHealth();
    
    // Check Redis health
    let redisHealth = { status: 'unknown', latency: 0 };
    try {
      const redisStart = Date.now();
      const redisClient = getRedisClient();
      await redisClient.ping();
      redisHealth = {
        status: 'healthy',
        latency: Date.now() - redisStart,
      };
    } catch (error) {
      redisHealth = {
        status: 'unhealthy',
        latency: Date.now() - startTime,
      };
    }

    // Overall health status
    const isHealthy = dbHealth.status === 'healthy' && redisHealth.status === 'healthy';
    const overallStatus = isHealthy ? 'healthy' : 'unhealthy';

    const detailedHealth = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: config.server.nodeEnv,
      dependencies: {
        database: dbHealth,
        redis: redisHealth,
      },
      system: {
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
          external: process.memoryUsage().external,
        },
        cpu: process.cpuUsage(),
        nodeVersion: process.version,
      },
      responseTime: Date.now() - startTime,
    };

    if (isHealthy) {
      res.json(createApiResponse(detailedHealth, 'All systems are healthy'));
    } else {
      res.status(503).json(createApiResponse(detailedHealth, 'Some systems are unhealthy'));
    }
  } catch (error) {
    logger.error('Detailed health check failed', { error: (error as Error).message });
    
    const errorHealth = {
      status: 'error',
      timestamp: new Date().toISOString(),
      error: (error as Error).message,
      uptime: process.uptime(),
      version: '1.0.0',
      environment: config.server.nodeEnv,
    };

    res.status(503).json(createApiResponse(errorHealth, 'Health check failed'));
  }
});

// GET /api/health/ready - Readiness probe for Kubernetes/ECS
healthRoutes.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check if the service is ready to accept requests
    const dbHealth = await checkDatabaseHealth();
    
    if (dbHealth.status === 'healthy') {
      res.json(createApiResponse({ ready: true }, 'Service is ready'));
    } else {
      res.status(503).json(createApiResponse({ ready: false }, 'Service is not ready'));
    }
  } catch (error) {
    logger.error('Readiness check failed', { error: (error as Error).message });
    res.status(503).json(createApiResponse({ ready: false }, 'Service is not ready'));
  }
});

// GET /api/health/live - Liveness probe for Kubernetes/ECS
healthRoutes.get('/live', (req: Request, res: Response) => {
  try {
    // Simple liveness check - service is running
    res.json(createApiResponse({ alive: true }, 'Service is alive'));
  } catch (error) {
    logger.error('Liveness check failed', { error: (error as Error).message });
    res.status(503).json(createApiResponse({ alive: false }, 'Service is not alive'));
  }
});

// GET /api/health/metrics - Basic metrics endpoint
healthRoutes.get('/metrics', (req: Request, res: Response) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    };

    res.json(createApiResponse(metrics, 'Service metrics'));
  } catch (error) {
    logger.error('Metrics check failed', { error: (error as Error).message });
    res.status(503).json(createErrorResponse('Failed to get metrics'));
  }
});